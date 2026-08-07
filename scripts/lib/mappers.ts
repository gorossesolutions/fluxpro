/**
 * Pure V1 -> V2 mapping functions — no I/O, no Supabase client. Kept separate from
 * migrate-v1.ts so they're directly unit-testable (spec §18: "the V1 migration mappers").
 */
import { addMoney, fromMinorUnits, mulMoney, toMinorUnits, type MinorUnits } from '../../src/lib/money'

export type MappedInvoiceStatus = 'issued' | 'paid'
export type MappedRecurrence = 'none' | 'monthly' | 'quarterly' | 'yearly'

export interface InvoiceLineInput {
  title: string
  description: string | null
  quantity: number
  unit_price: string
  line_total: string
}

export interface ExpenseOccurrenceInput {
  occurrence_date: string
  amount: string
  amount_mur: string
}

/** Normalises a client identity to a dedupe key — mirrors what fn_migrate_upsert_client does
 * server-side (lower/trim on name + email), so the reconciliation report can preview
 * dedup groups before anything is written. */
export function normalizeClientKey(name: string, email: string | null): string {
  const normalizedName = name.trim().toLowerCase()
  const normalizedEmail = (email ?? '').trim().toLowerCase()
  return `${normalizedName}|${normalizedEmail}`
}

const COUNTRY_KEYWORDS: Array<[RegExp, string]> = [
  [/\bfrance\b|\bparis\b|\blyon\b|\bmarseille\b/i, 'FR'],
  [/\bsuisse\b|\bswitzerland\b|\bgen[eè]ve\b|\bzurich\b|\bch-\d{4}\b/i, 'CH'],
  [/\bbelgique\b|\bbelgium\b|\bbruxelles\b|\bbrussels\b/i, 'BE'],
  [/\bémirats\b|\bemirates\b|\budubai\b|\bdubai\b|\babu dhabi\b|\buae\b/i, 'AE'],
  [/\bcanada\b|\bquébec\b|\bquebec\b|\bmontr[eé]al\b|\bontario\b/i, 'CA'],
  [/\bafrique du sud\b|\bsouth africa\b|\bjohannesburg\b|\bcape town\b/i, 'ZA'],
  [/\bmaurice\b|\bmauritius\b|\bport louis\b|\bport-louis\b/i, 'MU'],
]

/** Best-effort country inference from free-text V1 address data — V1 never stored a
 * structured country field, so this is a heuristic, not a lookup. Returns null (surfaced
 * as "à compléter" in the Clients list) when nothing matches. */
export function inferCountryCode(address: string | null): string | null {
  if (!address) return null
  for (const [pattern, code] of COUNTRY_KEYWORDS) {
    if (pattern.test(address)) return code
  }
  return null
}

/** GR AdLab's client base is predominantly foreign B2B (spec intro); when the country can't
 * be inferred, defaulting to zero-rated export is the more likely-correct guess than
 * domestic — but this is explicitly a best-effort classification on historical documents,
 * not a re-assertion of new legal terms, and must be spot-checked (see docs/MIGRATION.md). */
export function inferSupplyTreatment(countryCode: string | null): 'domestic' | 'zero_rated_export' {
  return countryCode === 'MU' ? 'domestic' : 'zero_rated_export'
}

/** Accepts a plain string rather than a strict union — CSV exports aren't guaranteed to be
 * as clean as a DB enum, and an unrecognised value should fail loudly, not silently coerce. */
export function mapInvoiceStatus(statut: string): MappedInvoiceStatus {
  const normalized = statut.trim().toLowerCase()
  if (normalized === 'payée' || normalized === 'payee') return 'paid'
  if (normalized === 'en attente' || normalized === 'en retard') return 'issued'
  throw new Error(`Unrecognised invoice status: "${statut}"`)
}

export function mapRecurrence(recurrence: string | null): MappedRecurrence {
  switch (recurrence?.trim().toLowerCase()) {
    case 'mensuelle':
      return 'monthly'
    case 'trimestrielle':
      return 'quarterly'
    case 'annuelle':
      return 'yearly'
    case '':
    case null:
    case undefined:
      return 'none'
    default:
      throw new Error(`Unrecognised recurrence: "${recurrence}"`)
  }
}

/** Maps the French category labels used in the depenses export to the seeded
 * expense_categories keys (spec §9). Throws on anything unmapped rather than silently
 * bucketing into "other" — a wrong category is a wrong PCG account on the accountant export. */
const EXPENSE_CATEGORY_LABEL_MAP: Record<string, string> = {
  'logiciels/abonnements': 'software_subscriptions',
  'marketing': 'advertising',
  'matériel': 'hardware',
  'materiel': 'hardware',
}

export function mapExpenseCategoryLabel(label: string | null): string {
  if (!label) return 'other'
  const key = EXPENSE_CATEGORY_LABEL_MAP[label.trim().toLowerCase()]
  if (!key) throw new Error(`Unrecognised expense category label: "${label}" — add it to EXPENSE_CATEGORY_LABEL_MAP`)
  return key
}

/**
 * V1 invoices had a single title + free-text detail. Default: one line, detail folded into
 * the description (spec §13 default). With splitDetails=true, "- " prefixed detail lines
 * become their own zero-priced lines and the parent line carries the full amount — an
 * explicit opt-in since it changes the number of rows created, not just their content.
 */
export function mapInvoiceLines(
  title: string,
  detail: string | null,
  amount: number,
  splitDetails: boolean,
): InvoiceLineInput[] {
  const trimmedDetail = detail?.trim() ?? ''

  if (!splitDetails || !trimmedDetail) {
    return [
      {
        title,
        description: trimmedDetail || null,
        quantity: 1,
        unit_price: amount.toFixed(2),
        line_total: amount.toFixed(2),
      },
    ]
  }

  const detailLines = trimmedDetail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, ''))

  if (detailLines.length === 0) {
    return [{ title, description: trimmedDetail, quantity: 1, unit_price: amount.toFixed(2), line_total: amount.toFixed(2) }]
  }

  return [
    { title, description: null, quantity: 1, unit_price: amount.toFixed(2), line_total: amount.toFixed(2) },
    ...detailLines.map((line) => ({
      title: line,
      description: null,
      quantity: 1,
      unit_price: '0.00',
      line_total: '0.00',
    })),
  ]
}

export interface TaxAmounts {
  subtotal: string
  taxAmount: string
  total: string
}

/** subtotal is V1's `montant` (HT); tva is a percentage — computed with money.ts so no
 * float drift creeps into totals during migration. */
export function computeTaxAmounts(montantHt: number, tvaPct: number): TaxAmounts {
  const subtotal = toMinorUnits(montantHt.toFixed(2))
  const taxAmount = mulMoney(subtotal, tvaPct / 100)
  const total = addMoney(subtotal, taxAmount)
  return {
    subtotal: fromMinorUnits(subtotal),
    taxAmount: fromMinorUnits(taxAmount),
    total: fromMinorUnits(total),
  }
}

/**
 * Backfills expense_occurrences from date_debut to the earlier of date_fin/today, matching
 * V1's in-memory expansion so historical monthly totals don't move (spec §13). A `none`
 * recurrence still produces exactly one occurrence (itself) — expense_occurrences is the
 * single source dashboards read from, so a one-off expense needs a row there too.
 */
export function generateExpenseOccurrences(
  startDate: Date,
  endDate: Date | null,
  recurrence: MappedRecurrence,
  amount: number,
  fxRateToMur: number,
  today: Date,
): ExpenseOccurrenceInput[] {
  const amountMinor = toMinorUnits(amount.toFixed(2))
  const amountMur = fromMinorUnits(mulMoney(amountMinor, fxRateToMur))
  const amountStr = fromMinorUnits(amountMinor)

  if (recurrence === 'none') {
    return [{ occurrence_date: toIsoDate(startDate), amount: amountStr, amount_mur: amountMur }]
  }

  const stopAt = endDate && endDate < today ? endDate : today
  const occurrences: ExpenseOccurrenceInput[] = []
  let cursor = new Date(startDate)

  while (cursor <= stopAt) {
    occurrences.push({ occurrence_date: toIsoDate(cursor), amount: amountStr, amount_mur: amountMur })
    cursor = advance(cursor, recurrence)
  }

  return occurrences
}

function advance(date: Date, recurrence: MappedRecurrence): Date {
  const next = new Date(date)
  switch (recurrence) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
    case 'none':
      break
  }
  return next
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export type { MinorUnits }
