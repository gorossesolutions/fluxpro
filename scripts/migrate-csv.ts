#!/usr/bin/env tsx
/**
 * CSV-driven migration (spec §13, adapted — see docs/MIGRATION.md "CSV import path"). Used
 * instead of migrate-v1.ts's live V1 API read when the source data is a set of CSV exports
 * rather than a reachable V1 Supabase project. Same server-side RPC layer
 * (0007_migration_functions.sql), same idempotency via migration_map, same dry-run-by-default
 * posture.
 *
 * Usage:
 *   tsx scripts/migrate-csv.ts \
 *     --factures factures.csv --devis devis.csv --depenses depenses.csv \
 *     --config business-config.json \
 *     --v2-url https://xxx.supabase.co --v2-service-key ey... \
 *     --user-id <uuid> \
 *     [--confirm]
 */
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  computeTaxAmounts,
  inferSupplyTreatment,
  mapExpenseCategoryLabel,
  mapInvoiceLines,
  mapInvoiceStatus,
  mapRecurrence,
  generateExpenseOccurrences,
} from './lib/mappers'
import { parseDepensesCsv, parseDevisCsv, parseFacturesCsv, type CsvExpenseRow, type CsvInvoiceRow } from './lib/csv-source'
import { findClientOverride, type BusinessConfig } from './lib/business-config'

interface Args {
  factures: string
  devis: string
  depenses: string
  config: string
  'v2-url': string
  'v2-service-key': string
  'user-id': string
  confirm: boolean
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      factures: { type: 'string' },
      devis: { type: 'string' },
      depenses: { type: 'string' },
      config: { type: 'string' },
      'v2-url': { type: 'string' },
      'v2-service-key': { type: 'string' },
      'user-id': { type: 'string' },
      confirm: { type: 'boolean', default: false },
    },
  })

  const required = ['factures', 'devis', 'depenses', 'config', 'v2-url', 'v2-service-key', 'user-id'] as const
  const missing = required.filter((key) => !values[key])
  if (missing.length > 0) {
    console.error(`Missing required flags: ${missing.map((m) => `--${m}`).join(', ')}`)
    process.exit(1)
  }

  return values as Args
}

interface ReconciliationRow {
  entity: string
  sourceCount: number
  migrated: number
  failed: number
}

function stableExpenseLegacyId(row: CsvExpenseRow): string {
  const hash = createHash('sha1')
    .update(`${row.supplier}|${row.description ?? ''}|${row.dateDebut}|${row.montant}|${row.currency}`)
    .digest('hex')
    .slice(0, 12)
  return `csv-expense-${hash}`
}

async function main() {
  const args = parseCliArgs()
  const dryRun = !args.confirm

  console.log(dryRun ? '=== DRY RUN (pass --confirm to actually write) ===' : '=== LIVE RUN — writing to V2 ===')

  const [facturesText, devisText, depensesText, configText] = await Promise.all([
    readFile(args.factures, 'utf-8'),
    readFile(args.devis, 'utf-8'),
    readFile(args.depenses, 'utf-8'),
    readFile(args.config, 'utf-8'),
  ])

  const factures = parseFacturesCsv(facturesText)
  const devis = parseDevisCsv(devisText)
  const depenses = parseDepensesCsv(depensesText)
  const config: BusinessConfig = JSON.parse(configText)

  console.log(`\nParsed: ${factures.length} factures, ${devis.length} devis, ${depenses.length} dépenses`)

  await mkdir('backup', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const snapshotPath = `backup/csv-import-${stamp}.json`
  try {
    await writeFile(snapshotPath, JSON.stringify({ factures, devis, depenses, config }, null, 2), 'utf-8')
  } catch (err) {
    console.error('Snapshot failed — refusing to proceed. Nothing was written to V2.')
    console.error(err)
    process.exit(1)
  }
  console.log(`Wrote snapshot: ${snapshotPath}`)

  const v2 = createClient(args['v2-url'], args['v2-service-key'])
  const userId = args['user-id']

  const report: ReconciliationRow[] = []

  // Invoices first — quotes link to them by number afterward.
  report.push(await migrateInvoices(v2, userId, factures, config, dryRun))
  report.push(await migrateQuotes(v2, userId, devis, config, dryRun))
  report.push(await migrateExpenses(v2, userId, depenses, config, dryRun))

  if (!dryRun) {
    await linkQuotesToInvoices(v2, userId, config)
    await seedBusinessConfig(v2, userId, config)
  } else {
    console.log('\n[dry run] would link quotes to invoices per quoteInvoiceLinks and seed business identity/bank account/FX rates')
  }

  console.log('\n=== Reconciliation report ===')
  console.table(report.map((r) => ({ entity: r.entity, 'source rows': r.sourceCount, migrated: r.migrated, failed: r.failed })))

  const totalFailed = report.reduce((sum, r) => sum + r.failed, 0)
  if (totalFailed > 0) {
    console.error(`\n${totalFailed} row(s) failed. See errors above.`)
    process.exitCode = 1
  } else if (dryRun) {
    console.log('\nDry run complete. Re-run with --confirm once this looks right.')
  } else {
    console.log('\nMigration complete with zero variance.')
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

async function migrateInvoices(
  v2: SupabaseClient,
  userId: string,
  rows: CsvInvoiceRow[],
  config: BusinessConfig,
  dryRun: boolean,
): Promise<ReconciliationRow> {
  console.log(`\nMigrating ${rows.length} factures...`)
  let migrated = 0
  let failed = 0

  for (const row of rows) {
    try {
      const override = findClientOverride(config, row.client)
      // No address column in this CSV export — country is only known via an explicit
      // override (Ipedis, Olivier Francis); everyone else stays "à compléter" as agreed.
      const countryCode = override?.countryCode ?? null
      const supplyTreatment = override?.supplyTreatment ?? inferSupplyTreatment(countryCode)
      const { subtotal, taxAmount, total } = computeTaxAmounts(row.montantHt, row.tvaPct)

      if (Math.abs(Number.parseFloat(total) - row.ttc) > 0.01) {
        console.warn(`  WARNING ${row.number}: computed total ${total} != CSV TTC ${row.ttc}`)
      }

      const lines = mapInvoiceLines(row.description, null, row.montantHt, false)
      const fxRate = row.currency === 'MUR' ? 1 : (config.fxRates[row.currency] ?? 1)
      const status = mapInvoiceStatus(row.statut)

      let countryMention: string | null = null
      if (countryCode && !dryRun) {
        const { data } = await v2.from('country_rules').select('mention_fr, reverse_charge').eq('country_code', countryCode).maybeSingle()
        if (data?.reverse_charge) countryMention = data.mention_fr
      }

      let clientId: string | null = null
      if (!dryRun) {
        const { data, error } = await v2.rpc('fn_migrate_upsert_client', {
          p_user_id: userId,
          p_name: row.client,
          p_email: row.email,
          p_address: null,
          p_country_code: countryCode,
        })
        if (error) throw new Error(error.message)
        clientId = data as string
      }

      const payload = {
        legacy_id: row.number,
        number: row.number,
        client_id: clientId,
        client_snapshot: { name: row.client, email: row.email },
        issue_date: row.date,
        due_date: row.dueOrValidity,
        currency: row.currency,
        fx_rate_to_mur: fxRate,
        fx_rate_date: row.date,
        fx_source: 'manual',
        subtotal,
        tax_rate: row.tvaPct,
        tax_amount: taxAmount,
        total,
        status,
        supply_treatment: supplyTreatment,
        country_mention: countryMention,
        payment_terms: 30,
        lines,
        payment: status === 'paid' ? { amount: total, currency: row.currency, fx_rate_to_mur: fxRate, payment_date: row.date } : null,
      }

      if (dryRun) {
        migrated += 1
        continue
      }

      const { error } = await v2.rpc('fn_migrate_insert_invoice', { p_user_id: userId, p_payload: payload })
      if (error) throw new Error(error.message)
      migrated += 1
    } catch (err) {
      failed += 1
      console.error(`  FAILED invoice ${row.number}: ${(err as Error).message}`)
    }
  }

  return { entity: 'invoice', sourceCount: rows.length, migrated, failed }
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

async function migrateQuotes(
  v2: SupabaseClient,
  userId: string,
  rows: CsvInvoiceRow[],
  config: BusinessConfig,
  dryRun: boolean,
): Promise<ReconciliationRow> {
  const toImport = rows.filter((r) => !config.skipQuoteNumbers.includes(r.number))
  const skipped = rows.length - toImport.length
  console.log(`\nMigrating ${toImport.length} devis (${skipped} skipped per config.skipQuoteNumbers)...`)
  let migrated = 0
  let failed = 0

  for (const row of toImport) {
    try {
      const override = findClientOverride(config, row.client)
      const countryCode = override?.countryCode ?? null
      const supplyTreatment = override?.supplyTreatment ?? inferSupplyTreatment(countryCode)
      const { subtotal, taxAmount, total } = computeTaxAmounts(row.montantHt, row.tvaPct)
      const lines = mapInvoiceLines(row.description, null, row.montantHt, false)
      const fxRate = row.currency === 'MUR' ? 1 : (config.fxRates[row.currency] ?? 1)

      let countryMention: string | null = null
      if (countryCode && !dryRun) {
        const { data } = await v2.from('country_rules').select('mention_fr, reverse_charge').eq('country_code', countryCode).maybeSingle()
        if (data?.reverse_charge) countryMention = data.mention_fr
      }

      let clientId: string | null = null
      if (!dryRun) {
        const { data, error } = await v2.rpc('fn_migrate_upsert_client', {
          p_user_id: userId,
          p_name: row.client,
          p_email: null,
          p_address: null,
          p_country_code: countryCode,
        })
        if (error) throw new Error(error.message)
        clientId = data as string
      }

      const payload = {
        legacy_id: row.number,
        number: row.number,
        client_id: clientId,
        client_snapshot: { name: row.client },
        issue_date: row.date,
        currency: row.currency,
        fx_rate_to_mur: fxRate,
        fx_rate_date: row.date,
        fx_source: 'manual',
        subtotal,
        tax_rate: row.tvaPct,
        tax_amount: taxAmount,
        total,
        status: row.statut.trim().toLowerCase() === 'converti' ? 'accepted' : 'sent',
        supply_treatment: supplyTreatment,
        country_mention: countryMention,
        payment_terms: 30,
        lines,
      }

      if (dryRun) {
        migrated += 1
        continue
      }

      const { error } = await v2.rpc('fn_migrate_insert_quote', { p_user_id: userId, p_payload: payload })
      if (error) throw new Error(error.message)
      migrated += 1
    } catch (err) {
      failed += 1
      console.error(`  FAILED quote ${row.number}: ${(err as Error).message}`)
    }
  }

  return { entity: 'quote', sourceCount: toImport.length, migrated, failed }
}

async function linkQuotesToInvoices(v2: SupabaseClient, userId: string, config: BusinessConfig) {
  console.log('\nLinking converted quotes to their invoices...')
  for (const [quoteNumber, invoiceNumber] of Object.entries(config.quoteInvoiceLinks)) {
    const [{ data: quote, error: qErr }, { data: invoice, error: iErr }] = await Promise.all([
      v2.from('quotes').select('id').eq('user_id', userId).eq('number', quoteNumber).maybeSingle(),
      v2.from('invoices').select('id').eq('user_id', userId).eq('number', invoiceNumber).maybeSingle(),
    ])
    if (qErr || iErr || !quote || !invoice) {
      console.error(`  FAILED to link ${quoteNumber} -> ${invoiceNumber}: ${qErr?.message ?? iErr?.message ?? 'not found'}`)
      continue
    }
    const [{ error: updQuote }, { error: updInvoice }] = await Promise.all([
      v2.from('quotes').update({ converted_invoice_id: invoice.id }).eq('id', quote.id),
      v2.from('invoices').update({ source_quote_id: quote.id }).eq('id', invoice.id),
    ])
    if (updQuote || updInvoice) {
      console.error(`  FAILED to link ${quoteNumber} -> ${invoiceNumber}: ${updQuote?.message ?? updInvoice?.message}`)
    } else {
      console.log(`  linked ${quoteNumber} -> ${invoiceNumber}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

async function migrateExpenses(
  v2: SupabaseClient,
  userId: string,
  rows: CsvExpenseRow[],
  config: BusinessConfig,
  dryRun: boolean,
): Promise<ReconciliationRow> {
  console.log(`\nMigrating ${rows.length} dépenses...`)
  let migrated = 0
  let failed = 0
  const today = new Date()

  for (const row of rows) {
    try {
      const recurrence = mapRecurrence(row.recurrence)
      const fxRate = row.currency === 'MUR' ? 1 : (config.fxRates[row.currency] ?? 1)
      const occurrences = generateExpenseOccurrences(
        new Date(row.dateDebut),
        row.dateFin ? new Date(row.dateFin) : null,
        recurrence,
        row.montant,
        fxRate,
        today,
      )

      const payload = {
        legacy_id: stableExpenseLegacyId(row),
        supplier: row.supplier,
        description: row.description,
        category_key: mapExpenseCategoryLabel(row.categorie),
        amount: row.montant.toFixed(2),
        currency: row.currency,
        fx_rate_to_mur: fxRate,
        fx_rate_date: row.dateDebut,
        fx_source: 'manual',
        expense_date: row.dateDebut,
        recurrence,
        recurrence_interval: null,
        recurrence_end_date: row.dateFin,
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
      console.error(`  FAILED expense ${row.supplier} (${row.dateDebut}): ${(err as Error).message}`)
    }
  }

  return { entity: 'expense', sourceCount: rows.length, migrated, failed }
}

// ---------------------------------------------------------------------------
// Business identity, bank account, FX rate seed
// ---------------------------------------------------------------------------

async function seedBusinessConfig(v2: SupabaseClient, userId: string, config: BusinessConfig) {
  console.log('\nSeeding business identity, bank account, FX rates...')

  const bi = config.businessIdentity
  const { error: biError } = await v2.from('business_identity').upsert(
    {
      user_id: userId,
      name: bi.name,
      identifier_type: bi.identifierType,
      identifier_value: bi.identifierValue,
      email: bi.email,
      phone: bi.phone,
      address_line1: bi.addressLine1,
      city: bi.city,
      country_code: bi.countryCode,
      vat_registered: bi.vatRegistered,
      legal_mentions: bi.legalMentions,
    },
    { onConflict: 'user_id' },
  )
  if (biError) console.error(`  FAILED business_identity: ${biError.message}`)

  const ba = config.bankAccount
  const { error: baError } = await v2.from('bank_accounts').insert({
    user_id: userId,
    bank_name: ba.bankName,
    bank_address: ba.bankAddress,
    beneficiary: ba.beneficiary,
    account_number: ba.accountNumber,
    iban: ba.iban,
    bic_swift: ba.bicSwift,
    paypal_alias: ba.paypalAlias,
    currency: ba.currency,
    is_default: true,
  })
  if (baError) console.error(`  FAILED bank_accounts: ${baError.message}`)

  const today = new Date().toISOString().slice(0, 10)
  for (const [currency, rate] of Object.entries(config.fxRates)) {
    const { error } = await v2
      .from('fx_rates')
      .upsert(
        { rate_date: today, base_currency: currency, quote_currency: 'MUR', rate, source: 'manual' },
        { onConflict: 'rate_date,base_currency,quote_currency' },
      )
    if (error) console.error(`  FAILED fx_rates seed for ${currency}: ${error.message}`)
  }

  console.log('  done.')
}

main().catch((err) => {
  console.error('\nMigration script crashed:', err)
  process.exit(1)
})
