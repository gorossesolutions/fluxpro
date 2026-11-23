import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import type { Database } from '@/types/supabase'
import { isMissingRpc } from '@/lib/errors'

export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']
export type InvoiceLine = Database['public']['Tables']['invoice_lines']['Row']
export type InvoiceLineInsert = Database['public']['Tables']['invoice_lines']['Insert']
export type Payment = Database['public']['Tables']['payments']['Row']
export type CreditNote = Database['public']['Tables']['credit_notes']['Row']
export type CreditNoteLine = Database['public']['Tables']['credit_note_lines']['Row']

export interface InvoiceListFilters {
  clientId?: string
  /** Empty/omitted = no status filter ("Toutes"); multiple values OR together (spec: pills
   * are multi-select, e.g. "Payées" + "Brouillons" at once). */
  statuses?: string[]
  search?: string
  /** 'active' (default): everything except cancelled invoices, which live in their own view.
   * 'cancelled': only cancelled invoices (statuses is ignored). */
  view?: 'active' | 'cancelled'
}

export function useInvoices(filters: InvoiceListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.invoices.list(filters),
    queryFn: async (): Promise<Invoice[]> => {
      let query = supabase.from('invoices').select('*')
      if (filters.clientId) query = query.eq('client_id', filters.clientId)
      if (filters.view === 'cancelled') query = query.eq('status', 'cancelled')
      else if (filters.statuses && filters.statuses.length > 0) query = query.in('status', filters.statuses as Invoice['status'][])
      else query = query.neq('status', 'cancelled')
      if (filters.search) {
        query = query.or(`number.ilike.%${filters.search}%`)
      }
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export interface InvoiceWithLines extends Invoice {
  invoice_lines: InvoiceLine[]
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<InvoiceWithLines> => {
      const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', id!).single()
      if (error) throw error
      const { data: lines, error: linesError } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', id!)
        .order('position')
      if (linesError) throw linesError
      return { ...invoice, invoice_lines: lines }
    },
  })
}

export function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['payments', invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase.from('payments').select('*').eq('invoice_id', invoiceId!).order('payment_date')
      if (error) throw error
      return data
    },
  })
}

export interface ClientPayment extends Payment {
  invoice_number: string | null
}

/** Payments don't carry client_id directly (only invoice_id) — resolved via the client's own
 * invoices first, same two-step pattern as useCreditNotesForInvoice below. */
export function useClientPayments(clientId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'client', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientPayment[]> => {
      const { data: invoices, error: invoicesError } = await supabase.from('invoices').select('id, number').eq('client_id', clientId!)
      if (invoicesError) throw invoicesError
      if (invoices.length === 0) return []

      const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .in(
          'invoice_id',
          invoices.map((i) => i.id),
        )
        .order('payment_date', { ascending: false })
      if (error) throw error

      const numberByInvoiceId = new Map(invoices.map((i) => [i.id, i.number]))
      return payments.map((p) => ({ ...p, invoice_number: numberByInvoiceId.get(p.invoice_id) ?? null }))
    },
  })
}

export interface CreditNoteWithLines extends CreditNote {
  credit_note_lines: CreditNoteLine[]
}

export function useCreditNotesForInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['credit-notes', invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async (): Promise<CreditNoteWithLines[]> => {
      const { data: creditNotes, error } = await supabase
        .from('credit_notes')
        .select('*')
        .eq('parent_invoice_id', invoiceId!)
        .order('issued_at', { ascending: false })
      if (error) throw error
      if (creditNotes.length === 0) return []

      const { data: lines, error: linesError } = await supabase
        .from('credit_note_lines')
        .select('*')
        .in(
          'credit_note_id',
          creditNotes.map((c) => c.id),
        )
        .order('position')
      if (linesError) throw linesError

      const linesByNote = new Map<string, CreditNoteLine[]>()
      for (const line of lines) {
        if (!linesByNote.has(line.credit_note_id)) linesByNote.set(line.credit_note_id, [])
        linesByNote.get(line.credit_note_id)!.push(line)
      }
      return creditNotes.map((c) => ({ ...c, credit_note_lines: linesByNote.get(c.id) ?? [] }))
    },
  })
}

export interface SaveInvoiceInput {
  invoice: InvoiceDraftFields
  lines: DraftLineInput[]
}

/** Plain, concrete field set for a draft save — deliberately not a union of the generated
 * Insert/Update types, which lose exactness across TS's spread-of-a-union inference once
 * `id` becomes optional. Money fields are `number` here (matching what the real Supabase type
 * generator produces for `numeric` columns and what PostgREST expects on the wire); callers
 * convert from money.ts's decimal-string output with Number(...) at this boundary only —
 * money.ts itself remains the sole place arithmetic happens. */
export interface InvoiceDraftFields {
  id?: string
  client_id: string | null
  client_snapshot: Record<string, unknown>
  issue_date: string
  due_date: string | null
  currency: string
  tax_rate: number
  subtotal: number
  tax_amount: number
  total: number
  supply_treatment: Invoice['supply_treatment']
  country_mention: string | null
  bank_account_id: string | null
  payment_terms: number
  notes: string | null
}

export interface DraftLineInput {
  title: string
  description: string | null
  quantity: number
  unit_price: number
  line_total: number
}

/** Saves a draft (create or update). Only ever touches draft rows — issuance is a separate,
 * explicit action (fn_allocate_document_number + lock), never implicit in a save. */
export function useSaveInvoiceDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoice, lines }: SaveInvoiceInput): Promise<Invoice> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')

      let invoiceRow: Invoice
      if (invoice.id) {
        const { id, ...updates } = invoice
        const { data, error } = await supabase.from('invoices').update(updates).eq('id', id).select().single()
        if (error) throw error
        invoiceRow = data
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert({ ...invoice, user_id: userData.user.id, status: 'draft' })
          .select()
          .single()
        if (error) throw error
        invoiceRow = data
      }

      // Single RPC (one transaction) rather than a separate delete-then-insert: two
      // independently-committed REST calls left a window where a fast double-tap could fire
      // this mutation twice and have both inserts land, doubling every line (0020_atomic_line_replace.sql).
      const { error: linesError } = await supabase.rpc('fn_replace_invoice_lines', {
        p_invoice_id: invoiceRow.id,
        p_lines: lines,
      })
      if (linesError) throw linesError

      return invoiceRow
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
    },
  })
}

export interface IssueInvoiceInput {
  id: string
  fxRateToMur: number
  fxRateDate: string
  fxSource: string
}

/** Issuance (spec §3.5, §7): allocates the number at this moment (never at draft creation),
 * freezes the FX rate, then locks the row — all in one transaction (fn_issue_invoice,
 * 0024_atomic_document_issuance.sql), so a failure can no longer burn a number. */
export function useIssueInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fxRateToMur, fxRateDate, fxSource }: IssueInvoiceInput): Promise<Invoice> => {
      const year = new Date().getFullYear()
      const { data: issued, error: issueError } = await supabase.rpc('fn_issue_invoice', {
        p_invoice_id: id,
        p_year: year,
        p_fx_rate_to_mur: fxRateToMur,
        p_fx_rate_date: fxRateDate,
        p_fx_source: fxSource,
      })
      if (!issueError) return issued
      if (!isMissingRpc(issueError)) throw issueError

      // Legacy two-step path, only until migration 0024 is applied.
      const { data: number, error: numberError } = await supabase.rpc('fn_allocate_document_number', {
        p_prefix: 'FAC',
        p_year: year,
      })
      if (numberError) throw numberError

      const { data, error } = await supabase
        .from('invoices')
        .update({
          number,
          status: 'issued',
          locked: true,
          issued_at: new Date().toISOString(),
          fx_rate_to_mur: fxRateToMur,
          fx_rate_date: fxRateDate,
          fx_source: fxSource,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
    },
  })
}

export interface UpdateInvoiceMutableFieldsInput {
  id: string
  due_date: string | null
  notes: string | null
  payment_terms: number
}

/** Locked invoices reject writes to their financial/identity fields (trg_invoice_lines_immutability
 * + fn_guard_invoice_immutability, 0003_functions.sql) — but due_date, notes and payment_terms
 * are explicitly whitelisted as still-mutable even once locked (payment_terms is purely
 * informational display text, not one of the guarded totals). This touches only the invoice
 * row, never invoice_lines, so it works on both draft and locked invoices unlike
 * useSaveInvoiceDraft (which always deletes+reinserts every line and would be rejected on a
 * locked document). */
export function useUpdateInvoiceMutableFields() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, due_date, notes, payment_terms }: UpdateInvoiceMutableFieldsInput): Promise<Invoice> => {
      const { data, error } = await supabase.from('invoices').update({ due_date, notes, payment_terms }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.id) })
    },
  })
}

/** Sets status to 'cancelled' — the one status transition still allowed on a locked invoice
 * (status is explicitly whitelisted alongside due_date/notes in fn_guard_invoice_immutability,
 * 0003_functions.sql). An issued invoice can never be deleted or have its financial fields
 * changed (issue a credit note instead) — cancelling is the closest thing to "undo" that stays
 * within that constraint, for e.g. an invoice raised by mistake that a client never paid. */
export function useCancelInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<Invoice> => {
      const { data, error } = await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) })
    },
  })
}

export function useDeleteInvoiceDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
    },
  })
}

export interface RecordPaymentInput {
  invoiceId: string
  amount: number
  currency: string
  fxRateToMur: number
  paymentDate: string
  method?: string
  reference?: string
}

export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecordPaymentInput): Promise<Payment> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('payments')
        .insert({
          user_id: userData.user.id,
          invoice_id: input.invoiceId,
          amount: input.amount,
          currency: input.currency,
          fx_rate_to_mur: input.fxRateToMur,
          payment_date: input.paymentDate,
          method: input.method ?? null,
          reference: input.reference ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.invoiceId) })
      void queryClient.invalidateQueries({ queryKey: ['payments', variables.invoiceId] })
    },
  })
}

export interface CreateCreditNoteInput {
  parentInvoiceId: string
  reason: string
  lines: { title: string; description: string | null; quantity: number; unit_price: number; line_total: number }[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currency: string
  fxRateToMur: number
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCreditNoteInput): Promise<CreditNote> => {
      const year = new Date().getFullYear()
      // Credit note + number + lines in one transaction (fn_create_credit_note, 0024).
      const { data: created, error: createError } = await supabase.rpc('fn_create_credit_note', {
        p_parent_invoice_id: input.parentInvoiceId,
        p_year: year,
        p_reason: input.reason,
        p_currency: input.currency,
        p_fx_rate_to_mur: input.fxRateToMur,
        p_subtotal: input.subtotal,
        p_tax_rate: input.taxRate,
        p_tax_amount: input.taxAmount,
        p_total: input.total,
        p_lines: input.lines,
      })
      if (!createError) return created
      if (!isMissingRpc(createError)) throw createError

      // Legacy multi-step path, only until migration 0024 is applied.
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')

      const { data: parentInvoice, error: parentError } = await supabase
        .from('invoices')
        .select('client_snapshot')
        .eq('id', input.parentInvoiceId)
        .single()
      if (parentError) throw parentError

      const { data: number, error: numberError } = await supabase.rpc('fn_allocate_document_number', {
        p_prefix: 'AV',
        p_year: year,
      })
      if (numberError) throw numberError

      const { data: creditNote, error } = await supabase
        .from('credit_notes')
        .insert({
          user_id: userData.user.id,
          number,
          parent_invoice_id: input.parentInvoiceId,
          reason: input.reason,
          client_snapshot: parentInvoice.client_snapshot,
          currency: input.currency,
          fx_rate_to_mur: input.fxRateToMur,
          subtotal: input.subtotal,
          tax_rate: input.taxRate,
          tax_amount: input.taxAmount,
          total: input.total,
          locked: true,
          issued_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error

      if (input.lines.length > 0) {
        const { error: linesError } = await supabase
          .from('credit_note_lines')
          .insert(input.lines.map((line, i) => ({ ...line, credit_note_id: creditNote.id, position: i + 1 })))
        if (linesError) throw linesError
      }

      return creditNote
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.parentInvoiceId) })
      void queryClient.invalidateQueries({ queryKey: ['credit-notes', variables.parentInvoiceId] })
    },
  })
}

export function useNumberGaps() {
  return useQuery({
    queryKey: queryKeys.invoices.gaps(),
    queryFn: async () => {
      const { data, error } = await supabase.from('v_number_gaps').select('*')
      if (error) throw error
      return data
    },
  })
}

/** Number of cancelled invoices (optionally for one client) — shown on the "Annulées" tab. */
export function useCancelledInvoiceCount(clientId?: string) {
  return useQuery({
    queryKey: [...queryKeys.invoices.list({ clientId, view: 'cancelled' }), 'count'],
    queryFn: async (): Promise<number> => {
      let query = supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'cancelled')
      if (clientId) query = query.eq('client_id', clientId)
      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    },
  })
}

const STATUS_REFRESH_KEY = 'invoice-status-refresh'

/**
 * Flips the signed-in user's own `issued` invoices whose due date has passed to `overdue` (and
 * back, if a due date was pushed out) — fn_refresh_my_invoice_statuses, 0022. Runs once per app
 * session per calendar day from AppLayout, so the stored status (list filter "En retard",
 * badges, client "encours" colour) matches the dashboard's date-based figure without relying on
 * a scheduled job. Best-effort: a failure (e.g. migration not applied yet) is logged and ignored.
 */
export function useRefreshInvoiceStatuses() {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  return useQuery({
    // Deliberately outside the 'invoices' key space, so invalidating invoices never re-runs it.
    queryKey: [STATUS_REFRESH_KEY, today],
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_refresh_my_invoice_statuses')
      if (error) {
        console.warn('Invoice status refresh skipped:', error.message)
        return 0
      }
      if (data > 0) {
        void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== STATUS_REFRESH_KEY })
      }
      return data
    },
  })
}
