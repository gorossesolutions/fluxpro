import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, DunningStage } from '@/types/supabase'

export const DUNNING_STAGES: DunningStage[] = ['j1', 'j7', 'j15', 'j30']
export const DUNNING_STAGE_DAYS: Record<DunningStage, number> = { j1: 1, j7: 7, j15: 15, j30: 30 }
export const DUNNING_STAGE_LABELS: Record<DunningStage, string> = { j1: 'J+1', j7: 'J+7', j15: 'J+15', j30: 'J+30' }

/** Every stage whose threshold has been reached by `daysOverdue`, in order — an invoice at
 * 20 days overdue has reached J+1, J+7 and J+15 (each deserves its own reminder), not just the
 * latest one. */
export function reachedStages(daysOverdue: number): DunningStage[] {
  return DUNNING_STAGES.filter((stage) => daysOverdue >= DUNNING_STAGE_DAYS[stage])
}

export interface OverdueInvoice {
  id: string
  number: string | null
  client_snapshot: Record<string, unknown>
  due_date: string
  total: number
  currency: string
  fx_rate_to_mur: number
  daysOverdue: number
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Migrated invoices whose source CSV had a blank "Échéance" cell have due_date = null
 * (scripts/lib/csv-source.ts) — falling back to issue_date + payment_terms mirrors how
 * due_date gets computed for every invoice created in the app itself (InvoiceEditorPage),
 * so those rows still show up here instead of being silently excluded forever. */
export function useOverdueInvoices() {
  return useQuery({
    queryKey: ['rappels', 'overdue-invoices'],
    queryFn: async (): Promise<OverdueInvoice[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('invoices')
        .select('id, number, client_snapshot, due_date, issue_date, payment_terms, total, currency, fx_rate_to_mur')
        .in('status', ['issued', 'overdue'])
      if (error) throw error

      return data
        .map((inv) => {
          const effectiveDueDate = inv.due_date ?? addDaysIso(inv.issue_date, inv.payment_terms)
          return {
            ...inv,
            due_date: effectiveDueDate,
            daysOverdue: Math.floor((Date.now() - new Date(effectiveDueDate).getTime()) / 86_400_000),
          }
        })
        .filter((inv) => inv.due_date < today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
    },
  })
}

export type SentReminders = Map<string, Set<DunningStage>>

export function useSentReminders() {
  return useQuery({
    queryKey: ['rappels', 'sent-reminders'],
    queryFn: async (): Promise<SentReminders> => {
      const { data, error } = await supabase.from('dunning_reminders').select('invoice_id, stage')
      if (error) throw error
      const map: SentReminders = new Map()
      for (const row of data) {
        if (!map.has(row.invoice_id)) map.set(row.invoice_id, new Set())
        map.get(row.invoice_id)!.add(row.stage)
      }
      return map
    },
  })
}

type DunningReminderInsert = Database['public']['Tables']['dunning_reminders']['Insert']

export function useMarkReminderSent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, stage }: { invoiceId: string; stage: DunningStage }): Promise<void> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const payload: DunningReminderInsert = { user_id: userData.user.id, invoice_id: invoiceId, stage }
      const { error } = await supabase.from('dunning_reminders').upsert(payload, { onConflict: 'invoice_id,stage', ignoreDuplicates: true })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rappels', 'sent-reminders'] })
    },
  })
}

export function useUnmarkReminderSent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, stage }: { invoiceId: string; stage: DunningStage }): Promise<void> => {
      const { error } = await supabase.from('dunning_reminders').delete().eq('invoice_id', invoiceId).eq('stage', stage)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rappels', 'sent-reminders'] })
    },
  })
}
