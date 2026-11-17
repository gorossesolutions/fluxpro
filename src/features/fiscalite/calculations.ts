import type { TaxBand, TaxConfig } from './api'
import { addMoney, mulMoney, toMinorUnits, type MinorUnits } from '@/lib/money'

/** Mauritian fiscal year runs 1 July → 30 June (spec §3.1) — never calendar year. */
export function currentFiscalYearStart(today: Date = new Date()): string {
  const year = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-07-01`
}

export interface TaxBandResult {
  bandOrder: number
  lowerBound: number
  upperBound: number | null
  ratePct: number
  taxableInBand: number
  taxForBand: number
}

export interface ProgressiveTaxResult {
  bands: TaxBandResult[]
  totalTax: number
}

/** Marginal band-by-band computation (spec §3.1) — never a flat rate on the whole income.
 * Rates are read from tax_bands, never hardcoded. */
export function computeProgressiveTax(bands: TaxBand[], chargeableIncome: number): ProgressiveTaxResult {
  const sorted = [...bands].sort((a, b) => a.band_order - b.band_order)
  let totalTax = 0
  const results: TaxBandResult[] = sorted.map((band) => {
    const lower = band.lower_bound
    const upper = band.upper_bound
    const bandCeiling = upper ?? Infinity
    const taxableInBand = Math.max(0, Math.min(chargeableIncome, bandCeiling) - lower)
    const taxForBand = taxableInBand > 0 ? (taxableInBand * band.rate_pct) / 100 : 0
    totalTax += taxForBand
    return { bandOrder: band.band_order, lowerBound: lower, upperBound: upper, ratePct: band.rate_pct, taxableInBand, taxForBand }
  })
  return { bands: results, totalTax }
}

/**
 * Fair Share Contribution: 15% on leviable income above MUR 12M (spec §3.1).
 * ⚠ Open item (docs/COMPLIANCE.md §3.1): FSC's statutory base is "leviable income," which may
 * differ from "chargeable income" used for the progressive bands. This applies FSC to the same
 * chargeable-income figure until an accountant confirms otherwise — flagged in the UI, not just
 * here.
 */
export function computeFsc(config: TaxConfig | undefined, chargeableIncome: number): number {
  if (!config || !config.fsc_active) return 0
  if (chargeableIncome <= config.fsc_threshold) return 0
  return ((chargeableIncome - config.fsc_threshold) * config.fsc_rate) / 100
}

// ---------------------------------------------------------------------------
// Expenses grouped by category, for filling in the annual tax return
// ---------------------------------------------------------------------------

export interface CategoryOccurrenceInput {
  expenseId: string
  amountMur: number
}

export interface CategoryExpenseInput {
  id: string
  categoryId: string | null
  isDeductible: boolean
  /** Template amount + VAT, in the expense's own currency — only their ratio is used. */
  amount: number
  vatAmount: number
}

export interface CategoryInput {
  id: string
  label: string
  pcgCode: string | null
}

export interface ExpenseCategoryTotal {
  categoryId: string | null
  label: string
  pcgCode: string | null
  count: number
  totalMinor: MinorUnits
  deductibleMinor: MinorUnits
  nonDeductibleMinor: MinorUnits
  /** VAT included in the amounts, in MUR — prorated per occurrence from the expense's VAT/amount ratio. */
  vatMinor: MinorUnits
}

export interface ExpensesByCategoryResult {
  rows: ExpenseCategoryTotal[]
  totals: Omit<ExpenseCategoryTotal, 'categoryId' | 'label' | 'pcgCode'>
}

export const UNCATEGORISED_LABEL = 'Sans catégorie'

/** Groups a fiscal year's materialised expense occurrences (already converted to MUR at the
 * expense's frozen rate) by expense category. Occurrences whose expense isn't in `expenses`
 * (e.g. archived/soft-deleted ones the caller filtered out) are skipped. Rows are sorted by
 * total, largest first, with "Sans catégorie" always last so it stands out as something to fix. */
export function groupExpensesByCategory(
  occurrences: CategoryOccurrenceInput[],
  expenses: CategoryExpenseInput[],
  categories: CategoryInput[],
): ExpensesByCategoryResult {
  const expensesById = new Map(expenses.map((e) => [e.id, e]))
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const rowsByKey = new Map<string, ExpenseCategoryTotal>()

  const zero = 0 as MinorUnits
  const totals = { count: 0, totalMinor: zero, deductibleMinor: zero, nonDeductibleMinor: zero, vatMinor: zero }

  for (const occ of occurrences) {
    const expense = expensesById.get(occ.expenseId)
    if (!expense) continue

    const category = expense.categoryId ? categoriesById.get(expense.categoryId) : undefined
    const key = category?.id ?? '__none__'
    let row = rowsByKey.get(key)
    if (!row) {
      row = {
        categoryId: category?.id ?? null,
        label: category?.label ?? UNCATEGORISED_LABEL,
        pcgCode: category?.pcgCode ?? null,
        count: 0,
        totalMinor: zero,
        deductibleMinor: zero,
        nonDeductibleMinor: zero,
        vatMinor: zero,
      }
      rowsByKey.set(key, row)
    }

    const amountMinor = toMinorUnits(occ.amountMur.toFixed(2))
    const vatRatio = expense.amount > 0 ? expense.vatAmount / expense.amount : 0
    const vatMinor = mulMoney(amountMinor, vatRatio)

    row.count++
    row.totalMinor = addMoney(row.totalMinor, amountMinor)
    row.vatMinor = addMoney(row.vatMinor, vatMinor)
    if (expense.isDeductible) row.deductibleMinor = addMoney(row.deductibleMinor, amountMinor)
    else row.nonDeductibleMinor = addMoney(row.nonDeductibleMinor, amountMinor)

    totals.count++
    totals.totalMinor = addMoney(totals.totalMinor, amountMinor)
    totals.vatMinor = addMoney(totals.vatMinor, vatMinor)
    if (expense.isDeductible) totals.deductibleMinor = addMoney(totals.deductibleMinor, amountMinor)
    else totals.nonDeductibleMinor = addMoney(totals.nonDeductibleMinor, amountMinor)
  }

  const rows = [...rowsByKey.values()].sort((a, b) => {
    if (a.categoryId === null) return 1
    if (b.categoryId === null) return -1
    return b.totalMinor - a.totalMinor || a.label.localeCompare(b.label, 'fr')
  })

  return { rows, totals }
}

/** Fiscal year end (30 June) for a 1 July start date, as YYYY-MM-DD. */
export function fiscalYearEndDate(fiscalYearStart: string): string {
  const startYear = Number(fiscalYearStart.slice(0, 4))
  return `${startYear + 1}-06-30`
}

// ---------------------------------------------------------------------------
// CSG / social contribution for self-employed individuals
// ---------------------------------------------------------------------------

/** Self-employed CSG bands (MRA Starting Business Guide, Jan 2026 — Social Contribution and
 * Social Benefits Act 2021), on the month's net income, in MUR:
 *   ≤ 10,000          → flat Rs 150
 *   10,000 – 50,000   → 1.5% of 90% of net income, minimum Rs 150
 *   > 50,000          → 3% of 90% of net income
 * Hardcoded on purpose (unlike tax_bands): it's a fixed statutory schedule unchanged since 2021;
 * move it to a reference table if it ever starts changing yearly. A loss month counts as ≤ 10,000. */
export const CSG_FLAT_AMOUNT_MUR = 150
export const CSG_LOWER_THRESHOLD_MUR = 10_000
export const CSG_UPPER_THRESHOLD_MUR = 50_000
export const CSG_BASE_RATIO = 0.9
export const CSG_LOWER_RATE = 0.015
export const CSG_UPPER_RATE = 0.03

export function computeSelfEmployedCsg(monthlyNetIncomeMinor: MinorUnits): MinorUnits {
  const flat = toMinorUnits(CSG_FLAT_AMOUNT_MUR)
  if (monthlyNetIncomeMinor <= toMinorUnits(CSG_LOWER_THRESHOLD_MUR)) return flat
  const rate = monthlyNetIncomeMinor <= toMinorUnits(CSG_UPPER_THRESHOLD_MUR) ? CSG_LOWER_RATE : CSG_UPPER_RATE
  const due = mulMoney(monthlyNetIncomeMinor, CSG_BASE_RATIO * rate)
  return (due < flat ? flat : due) as MinorUnits
}

export type CsgMode = 'actual' | 'previous_year'

export interface CsgMonth {
  /** YYYY-MM */
  month: string
  /** Net income used as the CSG base for this month (null = month not reached yet, actual mode). */
  baseMinor: MinorUnits | null
  csgMinor: MinorUnits | null
}

export interface CsgSchedule {
  months: CsgMonth[]
  /** Sum of the months computed so far (actual mode) or of all 12 (previous-year mode). */
  totalMinor: MinorUnits
  /** How many months totalMinor covers (≤ 12 in actual mode, always 12 in previous-year mode). */
  monthsComputed: number
}

/** The 12 months (YYYY-MM) of a 1 July fiscal year. */
export function fiscalYearMonths(fiscalYearStart: string): string[] {
  const startYear = Number(fiscalYearStart.slice(0, 4))
  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = 6 + i // July = 6
    const year = startYear + Math.floor(monthIndex / 12)
    return `${year}-${String((monthIndex % 12) + 1).padStart(2, '0')}`
  })
}

/**
 * - 'actual': each month's CSG on that month's own net income (what a newly registered
 *   self-employed declares monthly). Months after `currentMonth` are left empty.
 * - 'previous_year': every month's base is 1/12 of the preceding fiscal year's net income (the
 *   option for someone in business for 12+ months, filed monthly or annually in advance).
 */
export function computeCsgSchedule(
  fiscalYearStart: string,
  mode: CsgMode,
  monthlyNetMinor: Record<string, MinorUnits>,
  previousYearNetMinor: MinorUnits,
  currentMonth: string,
): CsgSchedule {
  let total = 0 as MinorUnits
  let computed = 0
  const previousYearMonthly = Math.round(previousYearNetMinor / 12) as MinorUnits

  const months = fiscalYearMonths(fiscalYearStart).map((month): CsgMonth => {
    if (mode === 'actual' && month > currentMonth) return { month, baseMinor: null, csgMinor: null }
    const baseMinor = mode === 'actual' ? (monthlyNetMinor[month] ?? (0 as MinorUnits)) : previousYearMonthly
    const csgMinor = computeSelfEmployedCsg(baseMinor)
    total = addMoney(total, csgMinor)
    computed++
    return { month, baseMinor, csgMinor }
  })

  return { months, totalMinor: total, monthsComputed: computed }
}
