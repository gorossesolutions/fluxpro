import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { addMoney, subMoney, mulMoney, toMinorUnits, type MinorUnits } from '@/lib/money'

const ROLLING_MONTHS = 12

/**
 * Canonical month key: sliced directly off the ISO date string, never routed through a JS
 * `Date` object. V1's dashboard grouped by a locale-formatted month name derived from a `Date`
 * — which, depending on local timezone offset, could push a date stored as e.g. "2026-08-01"
 * into "juillet" instead of "août", and collapsed different years sharing a month name into one
 * row. A plain string slice has no timezone to get wrong and no display formatting to collide on.
 */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function monthLabel(key: string): string {
  const parts = key.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function rollingMonthKeys(count: number): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export interface MonthlyRow {
  key: string
  label: string
  invoicedMur: MinorUnits
  collectedMur: MinorUnits
  expensesMur: MinorUnits
  netMur: MinorUnits
}

export type AgedBucket = '0-30' | '31-60' | '61-90' | '90+'

export interface DashboardSummary {
  monthly: MonthlyRow[]
  kpis: {
    collectedThisMonthMur: MinorUnits
    pendingMur: MinorUnits
    overdueMur: MinorUnits
    netThisMonthMur: MinorUnits
  }
  agedReceivables: { bucket: AgedBucket; amountMur: MinorUnits }[]
  expenseByCategory: { label: string; amountMur: MinorUnits }[]
  fxRates: { currency: string; rate: number; asOfDate: string }[]
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async (): Promise<DashboardSummary> => {
      const [invoicesResult, paymentsResult, occurrencesResult, categoriesResult, fxResult] = await Promise.all([
        supabase.from('invoices').select('id, issue_date, due_date, status, total, currency, fx_rate_to_mur').neq('status', 'draft').neq('status', 'cancelled'),
        supabase.from('payments').select('invoice_id, amount, currency, fx_rate_to_mur, payment_date'),
        supabase.from('expense_occurrences').select('expense_id, occurrence_date, amount_mur'),
        supabase.from('expenses').select('id, category_id').is('deleted_at', null),
        supabase.from('fx_rates').select('base_currency, rate, rate_date').eq('quote_currency', 'MUR').order('rate_date', { ascending: false }),
      ])
      if (invoicesResult.error) throw invoicesResult.error
      if (paymentsResult.error) throw paymentsResult.error
      if (occurrencesResult.error) throw occurrencesResult.error
      if (categoriesResult.error) throw categoriesResult.error
      if (fxResult.error) throw fxResult.error

      const invoices = invoicesResult.data
      const payments = paymentsResult.data
      const occurrences = occurrencesResult.data
      const categoryIdByExpenseId = new Map(categoriesResult.data.map((e) => [e.id, e.category_id]))

      const { data: categoryLabelsData, error: catLabelError } = await supabase.from('expense_categories').select('id, label_fr')
      if (catLabelError) throw catLabelError
      const categoryLabelById = new Map(categoryLabelsData.map((c) => [c.id, c.label_fr]))

      const monthKeys = rollingMonthKeys(ROLLING_MONTHS)
      const monthSet = new Set(monthKeys)
      const invoicedByMonth = new Map<string, MinorUnits>()
      const collectedByMonth = new Map<string, MinorUnits>()
      const expensesByMonth = new Map<string, MinorUnits>()

      const today = new Date().toISOString().slice(0, 10)
      const currentMonthKey = monthKey(today)

      let pendingMur = 0 as MinorUnits
      let overdueMur = 0 as MinorUnits
      const agedBuckets: Record<AgedBucket, MinorUnits> = { '0-30': 0 as MinorUnits, '31-60': 0 as MinorUnits, '61-90': 0 as MinorUnits, '90+': 0 as MinorUnits }

      for (const inv of invoices) {
        const totalMinor = toMinorUnits(String(inv.total))
        const totalMur = mulMoney(totalMinor, inv.fx_rate_to_mur)
        const key = monthKey(inv.issue_date)
        if (monthSet.has(key)) {
          invoicedByMonth.set(key, addMoney(invoicedByMonth.get(key) ?? (0 as MinorUnits), totalMur))
        }

        if (inv.status === 'issued' || inv.status === 'overdue') {
          const daysOverdue = inv.due_date ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86_400_000) : 0
          if (daysOverdue <= 0) {
            pendingMur = addMoney(pendingMur, totalMur)
          } else {
            overdueMur = addMoney(overdueMur, totalMur)
            const bucket: AgedBucket = daysOverdue <= 30 ? '0-30' : daysOverdue <= 60 ? '31-60' : daysOverdue <= 90 ? '61-90' : '90+'
            agedBuckets[bucket] = addMoney(agedBuckets[bucket], totalMur)
          }
        }
      }

      let collectedThisMonthMur = 0 as MinorUnits
      for (const p of payments) {
        const amountMinor = toMinorUnits(String(p.amount))
        const amountMur = mulMoney(amountMinor, p.fx_rate_to_mur)
        const key = monthKey(p.payment_date)
        if (monthSet.has(key)) {
          collectedByMonth.set(key, addMoney(collectedByMonth.get(key) ?? (0 as MinorUnits), amountMur))
        }
        if (key === currentMonthKey) collectedThisMonthMur = addMoney(collectedThisMonthMur, amountMur)
      }

      const categoryTotals = new Map<string, MinorUnits>()
      for (const occ of occurrences) {
        const amountMur = toMinorUnits(String(occ.amount_mur))
        const key = monthKey(occ.occurrence_date)
        if (monthSet.has(key)) {
          expensesByMonth.set(key, addMoney(expensesByMonth.get(key) ?? (0 as MinorUnits), amountMur))

          const categoryId = categoryIdByExpenseId.get(occ.expense_id)
          const label = categoryId ? (categoryLabelById.get(categoryId) ?? 'Autre') : 'Sans catégorie'
          categoryTotals.set(label, addMoney(categoryTotals.get(label) ?? (0 as MinorUnits), amountMur))
        }
      }

      const netThisMonthMur = subMoney(collectedThisMonthMur, expensesByMonth.get(currentMonthKey) ?? (0 as MinorUnits))

      const monthly: MonthlyRow[] = monthKeys.map((key) => {
        const invoicedMur = invoicedByMonth.get(key) ?? (0 as MinorUnits)
        const collectedMur = collectedByMonth.get(key) ?? (0 as MinorUnits)
        const expensesMur = expensesByMonth.get(key) ?? (0 as MinorUnits)
        return { key, label: monthLabel(key), invoicedMur, collectedMur, expensesMur, netMur: subMoney(collectedMur, expensesMur) }
      })

      const expenseByCategory = [...categoryTotals.entries()]
        .map(([label, amountMur]) => ({ label, amountMur }))
        .sort((a, b) => b.amountMur - a.amountMur)

      const latestFxByCurrency = new Map<string, { rate: number; asOfDate: string }>()
      for (const row of fxResult.data) {
        if (!latestFxByCurrency.has(row.base_currency)) {
          latestFxByCurrency.set(row.base_currency, { rate: row.rate, asOfDate: row.rate_date })
        }
      }
      const fxRates = [...latestFxByCurrency.entries()].map(([currency, v]) => ({ currency, ...v }))

      return {
        monthly,
        kpis: { collectedThisMonthMur, pendingMur, overdueMur, netThisMonthMur },
        agedReceivables: (['0-30', '31-60', '61-90', '90+'] as AgedBucket[]).map((bucket) => ({ bucket, amountMur: agedBuckets[bucket] })),
        expenseByCategory,
        fxRates,
      }
    },
  })
}
