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
