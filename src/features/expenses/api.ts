import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import { toMinorUnits, mulMoney, fromMinorUnits } from '@/lib/money'
import type { Database } from '@/types/supabase'

export type Expense = Database['public']['Tables']['expenses']['Row']
export type ExpenseUpdate = Database['public']['Tables']['expenses']['Update']
export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
export type ExpenseOccurrence = Database['public']['Tables']['expense_occurrences']['Row']

export type ExpenseWithCategory = Expense & { category: ExpenseCategory | null }

export function useExpenseCategories() {
  return useQuery({
    queryKey: queryKeys.expenseCategories.all,
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const { data, error } = await supabase.from('expense_categories').select('*').is('archived_at', null).order('label_fr')
      if (error) throw error
      return data
    },
    staleTime: 10 * 60 * 1000,
  })
}

export interface ExpenseListFilters {
  search?: string
  categoryId?: string | null
  showArchived?: boolean
}

export function useExpenses(filters: ExpenseListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.expenses.list(filters),
    queryFn: async (): Promise<ExpenseWithCategory[]> => {
      let query = supabase.from('expenses').select('*')
      query = filters.showArchived ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.search) query = query.ilike('supplier', `%${filters.search}%`)

      const { data: expenses, error } = await query.order('expense_date', { ascending: false })
      if (error) throw error

      const { data: categories, error: catError } = await supabase.from('expense_categories').select('*')
      if (catError) throw catError
      const categoriesById = new Map(categories.map((c) => [c.id, c]))

      return expenses.map((e) => ({ ...e, category: e.category_id ? (categoriesById.get(e.category_id) ?? null) : null }))
    },
  })
}

export function useExpenseOccurrences(expenseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.occurrences(expenseId ?? ''),
    enabled: Boolean(expenseId),
    queryFn: async (): Promise<ExpenseOccurrence[]> => {
      const { data, error } = await supabase
        .from('expense_occurrences')
        .select('*')
        .eq('expense_id', expenseId!)
        .order('occurrence_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export interface ExpenseDraftFields {
  supplier: string
  description: string | null
  category_id: string | null
  amount: number
  currency: string
  fx_rate_to_mur: number
  fx_rate_date: string | null
  fx_source: string | null
  expense_date: string
  recurrence: Expense['recurrence']
  recurrence_end_date: string | null
  is_deductible: boolean
  vat_amount: number
}

/** Creates the expense template row, then its first occurrence (spec §9: expense_occurrences
 * is the single source dashboards read from, so even a one-off expense needs a row there —
 * mirrors generateExpenseOccurrences' 'none' case in the migration script). Any future
 * occurrences for a recurring expense are topped up by fn_materialize_expense_occurrences,
 * called separately by the caller once this succeeds. */
export function useCreateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ExpenseDraftFields): Promise<Expense> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({ ...input, user_id: userData.user.id })
        .select()
        .single()
      if (error) throw error

      const amountMinor = toMinorUnits(String(input.amount))
      const amountMurMinor = mulMoney(amountMinor, input.fx_rate_to_mur)
      const { error: occError } = await supabase.from('expense_occurrences').insert({
        expense_id: expense.id,
        occurrence_date: input.expense_date,
        amount: Number(fromMinorUnits(amountMinor)),
        amount_mur: Number(fromMinorUnits(amountMurMinor)),
        is_generated: false,
      })
      if (occError) throw occError

      return expense
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
    },
  })
}

/** Updates only the expense template. Past occurrences are never rewritten retroactively —
 * an amount or category change here only affects future materialised occurrences, matching
 * standard accounting practice of not restating history. */
export function useUpdateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ExpenseUpdate }): Promise<Expense> => {
      const { data, error } = await supabase.from('expenses').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(variables.id) })
    },
  })
}

/** Soft delete only (spec: COMPLIANCE.md retention — nothing hard-deleted after issuance,
 * expenses/documents use deleted_at). Mirrors the client archive/unarchive pattern. */
export function useArchiveExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
    },
  })
}

export function useRestoreExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('expenses').update({ deleted_at: null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
    },
  })
}

/** Tops up expense_occurrences for every still-open recurring expense, up to today
 * (fn_materialize_expense_occurrences, 0011_expense_recurrence_engine.sql). Idempotent —
 * safe to call on every Dépenses page load. */
export function useMaterializeExpenseOccurrences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_materialize_expense_occurrences')
      if (error) throw error
      return data
    },
    onSuccess: (inserted) => {
      if (inserted > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
    },
  })
}
