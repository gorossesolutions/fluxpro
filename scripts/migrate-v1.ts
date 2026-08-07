#!/usr/bin/env tsx
/**
 * V1 -> V2 data migration (spec §13). Dry-run by default; --confirm to actually write.
 *
 * Usage:
 *   tsx scripts/migrate-v1.ts \
 *     --v1-url https://xxx.supabase.co --v1-service-key ey... \
 *     --v2-url https://yyy.supabase.co --v2-service-key ey... \
 *     --user-id <uuid-of-the-single-v2-auth-user> \
 *     [--confirm] [--split-details] [--identifier-type BRN|SIRET]
 *
 * See docs/MIGRATION.md for the full runbook, every mapping decision, and the rollback
 * procedure. Keep V1 live and read-only until the reconciliation report below is clean.
 */
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  computeTaxAmounts,
  generateExpenseOccurrences,
  inferCountryCode,
  inferSupplyTreatment,
  mapInvoiceLines,
  mapInvoiceStatus,
  mapRecurrence,
} from './lib/mappers'
import type { V1Depense, V1Facture, V1Parametres } from './lib/v1-types'

interface Args {
  'v1-url': string
  'v1-service-key': string
  'v2-url': string
  'v2-service-key': string
  'user-id': string
  confirm: boolean
  'split-details': boolean
  'identifier-type': string | undefined
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      'v1-url': { type: 'string' },
      'v1-service-key': { type: 'string' },
      'v2-url': { type: 'string' },
      'v2-service-key': { type: 'string' },
      'user-id': { type: 'string' },
      confirm: { type: 'boolean', default: false },
      'split-details': { type: 'boolean', default: false },
      'identifier-type': { type: 'string' },
    },
  })

  const required = ['v1-url', 'v1-service-key', 'v2-url', 'v2-service-key', 'user-id'] as const
  const missing = required.filter((key) => !values[key])
  if (missing.length > 0) {
    console.error(`Missing required flags: ${missing.map((m) => `--${m}`).join(', ')}`)
    console.error('See docs/MIGRATION.md for the full command.')
    process.exit(1)
  }

  return values as Args
}

async function fetchAll<T>(client: SupabaseClient, table: string): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await client.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to read V1 table "${table}": ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function snapshotV1(data: {
  factures: V1Facture[]
  devis: V1Facture[]
  depenses: V1Depense[]
  parametres: V1Parametres[]
}): Promise<string> {
  await mkdir('backup', { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const path = `backup/v1-${stamp}.json`
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
  return path
}

interface ReconciliationRow {
  entity: string
  v1Count: number
  migrated: number
  failed: number
}

async function main() {
  const args = parseCliArgs()
  const dryRun = !args.confirm

  console.log(dryRun ? '=== DRY RUN (pass --confirm to actually write) ===' : '=== LIVE RUN — writing to V2 ===')

  const v1 = createClient(args['v1-url'], args['v1-service-key'])
  const v2 = createClient(args['v2-url'], args['v2-service-key'])
  const userId = args['user-id']

  console.log('\nReading V1 tables...')
  const [factures, devis, depenses, parametresRows] = await Promise.all([
    fetchAll<V1Facture>(v1, 'factures'),
    fetchAll<V1Facture>(v1, 'devis'),
    fetchAll<V1Depense>(v1, 'depenses'),
    fetchAll<V1Parametres>(v1, 'parametres'),
  ])
  const parametres = parametresRows[0] ?? null
  console.log(`  factures: ${factures.length}, devis: ${devis.length}, depenses: ${depenses.length}, parametres: ${parametres ? 1 : 0}`)

  console.log('\nSnapshotting V1 before touching anything...')
  let snapshotPath: string
  try {
    snapshotPath = await snapshotV1({ factures, devis, depenses, parametres: parametresRows })
  } catch (err) {
    console.error('Snapshot failed — refusing to proceed. Nothing was written to V2.')
    console.error(err)
    process.exit(1)
  }
  console.log(`  wrote ${snapshotPath}`)

  // V1 never stored a per-document FX rate — only a single "current" rate per currency in
  // parametres. Used here as the best available approximation for every historical document
  // in that currency, always flagged fx_source = 'v1_manual_approx' so it's never confused
  // with a rate frozen at the time (spec §13 "Known lossy mappings").
  const rateMap: Record<string, number> = { MUR: 1 }
  if (parametres?.eur_mur) rateMap.EUR = parametres.eur_mur
  if (parametres?.usd_mur) rateMap.USD = parametres.usd_mur
  if (parametres?.gbp_mur) rateMap.GBP = parametres.gbp_mur

  const report: ReconciliationRow[] = []

  report.push(await migrateInvoiceLike(v2, userId, factures, 'invoice', 'fn_migrate_insert_invoice', args, dryRun, rateMap))
  report.push(await migrateInvoiceLike(v2, userId, devis, 'quote', 'fn_migrate_insert_quote', args, dryRun, rateMap))
  report.push(await migrateExpenses(v2, userId, depenses, dryRun, rateMap))

  if (parametres) {
    await migrateParametres(v2, userId, parametres, dryRun)
  } else {
    console.log('\nNo V1 parametres row found — skipping business identity/bank account/tax history migration.')
  }

  printReconciliationReport(report)
  printForexKeyInstructions(parametres)

  const totalFailed = report.reduce((sum, r) => sum + r.failed, 0)
  if (totalFailed > 0) {
    console.error(`\n${totalFailed} row(s) failed to migrate. See errors above. Exiting non-zero.`)
    process.exitCode = 1
  } else if (dryRun) {
    console.log('\nDry run complete, nothing was written. Re-run with --confirm once this looks right.')
  } else {
    console.log('\nMigration complete with zero variance. Keep V1 read-only until you are confident in V2.')
  }
}

// ---------------------------------------------------------------------------
// Invoices & quotes (shared shape)
// ---------------------------------------------------------------------------

async function migrateInvoiceLike(
  v2: SupabaseClient,
  userId: string,
  rows: V1Facture[],
  entity: 'invoice' | 'quote',
  rpcName: 'fn_migrate_insert_invoice' | 'fn_migrate_insert_quote',
  args: Args,
  dryRun: boolean,
  rateMap: Record<string, number>,
): Promise<ReconciliationRow> {
  console.log(`\nMigrating ${rows.length} ${entity === 'invoice' ? 'factures' : 'devis'}...`)
  let migrated = 0
  let failed = 0

  for (const row of rows) {
    try {
      const countryCode = inferCountryCode(row.client_adresse)
      const supplyTreatment = inferSupplyTreatment(countryCode)
      const { subtotal, taxAmount, total } = computeTaxAmounts(row.montant, row.tva)
      const lines = mapInvoiceLines(row.desc_titre, row.desc_detail, row.montant, args['split-details'])

      let countryMention: string | null = null
      if (countryCode) {
        const { data } = await v2.from('country_rules').select('mention_fr, reverse_charge').eq('country_code', countryCode).maybeSingle()
        if (data?.reverse_charge) countryMention = data.mention_fr
      }

      let clientId: string | null = null
      if (!dryRun) {
        const { data, error } = await v2.rpc('fn_migrate_upsert_client', {
          p_user_id: userId,
          p_name: row.client,
          p_email: row.client_email,
          p_address: row.client_adresse,
          p_country_code: countryCode,
        })
        if (error) throw new Error(error.message)
        clientId = data as string
      }

      // V1 never stored a per-document rate — the closest available approximation is
      // parametres' single "current" rate for that currency, which is why this is always
      // flagged v1_manual_approx rather than treated as a frozen-accurate rate.
      const fxRate = rateMap[row.devise] ?? 1

      const payload = {
        legacy_id: row.id,
        number: row.num,
        client_id: clientId,
        client_snapshot: { name: row.client, email: row.client_email, address: row.client_adresse },
        issue_date: row.date,
        due_date: row.echeance,
        currency: row.devise,
        fx_rate_to_mur: fxRate,
        fx_rate_date: row.date,
        fx_source: 'v1_manual_approx',
        subtotal,
        tax_rate: row.tva,
        tax_amount: taxAmount,
        total,
        status: entity === 'invoice' ? mapInvoiceStatus(row.statut) : 'issued',
        supply_treatment: supplyTreatment,
        country_mention: countryMention,
        payment_terms: 30,
        lines,
        payment:
          entity === 'invoice' && mapInvoiceStatus(row.statut) === 'paid'
            ? { amount: total, currency: row.devise, fx_rate_to_mur: fxRate, payment_date: row.date }
            : null,
      }

      if (dryRun) {
        migrated += 1
        continue
      }

      const { error } = await v2.rpc(rpcName, { p_user_id: userId, p_payload: payload })
      if (error) throw new Error(error.message)
      migrated += 1
    } catch (err) {
      failed += 1
      console.error(`  FAILED ${entity} ${row.id} (${row.num}): ${(err as Error).message}`)
    }
  }

  return { entity, v1Count: rows.length, migrated, failed }
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

async function migrateExpenses(
  v2: SupabaseClient,
  userId: string,
  rows: V1Depense[],
  dryRun: boolean,
  rateMap: Record<string, number>,
): Promise<ReconciliationRow> {
  console.log(`\nMigrating ${rows.length} dépenses...`)
  let migrated = 0
  let failed = 0
  const today = new Date()

  for (const row of rows) {
    try {
      const recurrence = mapRecurrence(row.recurrence)
      const fxRate = rateMap[row.devise] ?? 1
      const occurrences = generateExpenseOccurrences(
        new Date(row.date_debut),
        row.date_fin ? new Date(row.date_fin) : null,
        recurrence,
        row.montant,
        fxRate,
        today,
      )

      const payload = {
        legacy_id: row.id,
        supplier: row.fournisseur,
        description: row.description,
        category_key: row.categorie ?? 'other',
        amount: row.montant.toFixed(2),
        currency: row.devise,
        fx_rate_to_mur: fxRate,
        fx_rate_date: row.date_debut,
        fx_source: 'v1_manual_approx',
        expense_date: row.date_debut,
        recurrence,
        recurrence_interval: null,
        recurrence_end_date: row.date_fin,
        is_deductible: true,
        vat_amount: 0,
        occurrences,
      }

      if (dryRun) {
        migrated += 1
        continue
      }

      const { error } = await v2.rpc('fn_migrate_insert_expense', { p_user_id: userId, p_payload: payload })
      if (error) throw new Error(error.message)
      migrated += 1
    } catch (err) {
      failed += 1
      console.error(`  FAILED expense ${row.id} (${row.fournisseur}): ${(err as Error).message}`)
    }
  }

  return { entity: 'expense', v1Count: rows.length, migrated, failed }
}

// ---------------------------------------------------------------------------
// parametres -> business_identity + bank_accounts + app_settings + tax_history + fx_rates
// ---------------------------------------------------------------------------

async function migrateParametres(v2: SupabaseClient, userId: string, parametres: V1Parametres, dryRun: boolean) {
  console.log('\nMigrating parametres (business identity, bank account, tax history, FX seed)...')

  let identifierType = 'BRN'
  if (parametres.siret) {
    console.log(`  V1 "siret" field is set: ${parametres.siret}`)
    console.log('  seuil_impot/taux_impot are DISCARDED — replaced by the progressive tax_bands (spec §3.1).')
    identifierType = await resolveIdentifierType(dryRun)
  }

  if (dryRun) {
    console.log(`  [dry run] would upsert business_identity with identifier_type=${identifierType}`)
    console.log('  [dry run] would upsert one bank_accounts row from banque/iban/bic/paypal')
    console.log('  [dry run] would seed fx_rates from eur_mur/usd_mur/gbp_mur (source=v1_manual)')
    if (parametres.fiscal_history) {
      console.log(`  [dry run] would insert ${parametres.fiscal_history.length} tax_history row(s) from fiscal_history`)
    }
    return
  }

  if (parametres.nom && parametres.email) {
    const { error } = await v2.from('business_identity').upsert(
      {
        user_id: userId,
        name: parametres.nom,
        identifier_type: identifierType,
        identifier_value: parametres.siret ?? '',
        email: parametres.email,
        phone: parametres.tel,
        address_line1: parametres.adresse,
        billing_details: parametres.details_facturation,
        legal_mentions: parametres.mentions,
      },
      { onConflict: 'user_id' },
    )
    if (error) console.error(`  FAILED business_identity: ${error.message}`)
  }

  if (parametres.banque || parametres.iban || parametres.paypal) {
    const { error } = await v2.from('bank_accounts').insert({
      user_id: userId,
      bank_name: parametres.banque ?? 'Compte migré de V1',
      bank_address: parametres.banque_adresse,
      beneficiary: parametres.beneficiaire ?? parametres.nom,
      account_number: parametres.compte,
      iban: parametres.iban,
      bic_swift: parametres.bic,
      paypal_alias: parametres.paypal,
      currency: 'EUR',
      is_default: true,
    })
    if (error) console.error(`  FAILED bank_accounts: ${error.message}`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const fxSeeds: Array<[string, number | null]> = [
    ['EUR', parametres.eur_mur],
    ['USD', parametres.usd_mur],
    ['GBP', parametres.gbp_mur],
  ]
  for (const [currency, rate] of fxSeeds) {
    if (!rate) continue
    const { error } = await v2
      .from('fx_rates')
      .upsert(
        { rate_date: today, base_currency: currency, quote_currency: 'MUR', rate, source: 'v1_manual' },
        { onConflict: 'rate_date,base_currency,quote_currency' },
      )
    if (error) console.error(`  FAILED fx_rates seed for ${currency}: ${error.message}`)
  }

  if (parametres.fiscal_history?.length) {
    for (const entry of parametres.fiscal_history) {
      const fiscalYearStart = entry.year ? `${entry.year}-07-01` : null
      if (!fiscalYearStart) continue
      const { error } = await v2.from('tax_history').upsert(
        {
          user_id: userId,
          fiscal_year_start: fiscalYearStart,
          notes: 'Migré depuis V1 fiscal_history — seuil_impot/taux_impot V1 non repris, voir docs/COMPLIANCE.md §3.1',
        },
        { onConflict: 'user_id,fiscal_year_start' },
      )
      if (error) console.error(`  FAILED tax_history for ${fiscalYearStart}: ${error.message}`)
    }
  }

  console.log('  done.')
}

async function resolveIdentifierType(dryRun: boolean): Promise<string> {
  if (dryRun) return 'BRN'
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(
    '  Is the V1 "siret" value a Mauritian BRN or a French SIRET? Type BRN or SIRET: ',
  )
  rl.close()
  const normalized = answer.trim().toUpperCase()
  return normalized === 'SIRET' ? 'SIRET' : 'BRN'
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printReconciliationReport(report: ReconciliationRow[]) {
  console.log('\n=== Reconciliation report ===')
  console.table(report.map((r) => ({ entity: r.entity, 'V1 rows': r.v1Count, migrated: r.migrated, failed: r.failed })))
}

function printForexKeyInstructions(parametres: V1Parametres | null) {
  if (!parametres?.forex_api_key) return
  console.log('\n=== ExchangeRate API key ===')
  console.log('V1 had a forex_api_key in parametres. It was NOT copied anywhere in V2 — set it as an')
  console.log('Edge Function secret instead, then let the operator rotate/revoke the old key if reused:')
  console.log('  supabase secrets set EXCHANGERATE_API_KEY=<key> --project-ref <your-v2-project-ref>')
}

main().catch((err) => {
  console.error('\nMigration script crashed:', err)
  process.exit(1)
})
