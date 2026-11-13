import { describe, expect, it } from 'vitest'
import { groupExpensesByCategory, fiscalYearEndDate, UNCATEGORISED_LABEL } from './calculations'

const CATEGORIES = [
  { id: 'cat-soft', label: 'Logiciels & abonnements', pcgCode: '6065' },
  { id: 'cat-fuel', label: 'Carburant', pcgCode: '6061' },
  { id: 'cat-unused', label: 'Assurances', pcgCode: '616' },
]

const EXPENSES = [
  { id: 'e-figma', categoryId: 'cat-soft', isDeductible: true, amount: 115, vatAmount: 15 },
  { id: 'e-fuel', categoryId: 'cat-fuel', isDeductible: true, amount: 2000, vatAmount: 0 },
  { id: 'e-lunch', categoryId: 'cat-fuel', isDeductible: false, amount: 500, vatAmount: 0 },
  { id: 'e-misc', categoryId: null, isDeductible: true, amount: 100, vatAmount: 0 },
]

describe('groupExpensesByCategory', () => {
  const result = groupExpensesByCategory(
    [
      // monthly subscription billed in EUR, already converted to MUR per occurrence
      { expenseId: 'e-figma', amountMur: 5750 },
      { expenseId: 'e-figma', amountMur: 5750 },
      { expenseId: 'e-fuel', amountMur: 2000 },
      { expenseId: 'e-lunch', amountMur: 500.5 },
      { expenseId: 'e-misc', amountMur: 100 },
      // archived expense: not in the expenses list, must be ignored
      { expenseId: 'e-deleted', amountMur: 99999 },
    ],
    EXPENSES,
    CATEGORIES,
  )

  it('sums each category in minor units, largest first, uncategorised last', () => {
    expect(result.rows.map((r) => r.label)).toEqual(['Logiciels & abonnements', 'Carburant', UNCATEGORISED_LABEL])
    expect(result.rows[0]).toMatchObject({ count: 2, totalMinor: 1_150_000, pcgCode: '6065' })
  })

  it('splits deductible and non-deductible amounts', () => {
    expect(result.rows[1]).toMatchObject({ count: 2, deductibleMinor: 200_000, nonDeductibleMinor: 50_050, totalMinor: 250_050 })
  })

  it('prorates VAT from the expense VAT/amount ratio', () => {
    // 15/115 of 5750 = 750 MUR per occurrence
    expect(result.rows[0]?.vatMinor).toBe(150_000)
  })

  it('omits categories with no expense and skips unknown/archived expenses', () => {
    expect(result.rows.find((r) => r.categoryId === 'cat-unused')).toBeUndefined()
    expect(result.totals).toMatchObject({ count: 5, totalMinor: 1_410_050 })
  })

  it('returns empty totals with no data', () => {
    expect(groupExpensesByCategory([], [], [])).toEqual({
      rows: [],
      totals: { count: 0, totalMinor: 0, deductibleMinor: 0, nonDeductibleMinor: 0, vatMinor: 0 },
    })
  })
})

describe('fiscalYearEndDate', () => {
  it('ends on 30 June of the following year', () => {
    expect(fiscalYearEndDate('2025-07-01')).toBe('2026-06-30')
  })
})
