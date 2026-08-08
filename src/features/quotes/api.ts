import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import type { Database } from '@/types/supabase'
import type { DraftLineInput } from '@/features/invoices/api'

export type Quote = Database['public']['Tables']['quotes']['Row']
export type QuoteLine = Database['public']['Tables']['quote_lines']['Row']

export interface QuoteListFilters {
  clientId?: string
  status?: string
  search?: string
}

export function useQuotes(filters: QuoteListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.quotes.list(filters),
    queryFn: async (): Promise<Quote[]> => {
      let query = supabase.from('quotes').select('*')
      if (filters.clientId) query = query.eq('client_id', filters.clientId)
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status as Quote['status'])
      if (filters.search) query = query.or(`number.ilike.%${filters.search}%`)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/**
 * Of every quote actually sent out (drafts are excluded — nobody ever decided on those),
 * what fraction were accepted. Null when the client has no decided quotes yet, so the KPI can
 * render "—" instead of a misleading 0%.
 */
export function useQuoteAcceptanceRate(clientId: string | undefined) {
  return useQuery({
    queryKey: ['quotes', 'acceptance-rate', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.from('quotes').select('status').eq('client_id', clientId!).neq('status', 'draft')
      if (error) throw error
      if (data.length === 0) return null
      const accepted = data.filter((q) => q.status === 'accepted').length
      return accepted / data.length
    },
  })
}

export interface QuoteWithLines extends Quote {
  quote_lines: QuoteLine[]
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.quotes.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<QuoteWithLines> => {
      const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', id!).single()
      if (error) throw error
      const { data: lines, error: linesError } = await supabase.from('quote_lines').select('*').eq('quote_id', id!).order('position')
      if (linesError) throw linesError
      return { ...quote, quote_lines: lines }
    },
  })
}

export interface QuoteDraftFields {
  id?: string
  client_id: string | null
  client_snapshot: Record<string, unknown>
  issue_date: string
  valid_until: string | null
  currency: string
  tax_rate: number
  subtotal: number
  tax_amount: number
  total: number
  supply_treatment: Quote['supply_treatment']
  country_mention: string | null
  bank_account_id: string | null
  payment_terms: number
  notes: string | null
}

export interface SaveQuoteInput {
  quote: QuoteDraftFields
  lines: DraftLineInput[]
}

export function useSaveQuoteDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ quote, lines }: SaveQuoteInput): Promise<Quote> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')

      let quoteRow: Quote
      if (quote.id) {
        const { id, ...updates } = quote
        const { data, error } = await supabase.from('quotes').update(updates).eq('id', id).select().single()
        if (error) throw error
        quoteRow = data
        await supabase.from('quote_lines').delete().eq('quote_id', quoteRow.id)
      } else {
        const { data, error } = await supabase
          .from('quotes')
          .insert({ ...quote, user_id: userData.user.id, status: 'draft' })
          .select()
          .single()
        if (error) throw error
        quoteRow = data
      }

      if (lines.length > 0) {
        const { error: linesError } = await supabase
          .from('quote_lines')
          .insert(lines.map((line, i) => ({ ...line, quote_id: quoteRow.id, position: i + 1 })))
        if (linesError) throw linesError
      }

      return quoteRow
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })
    },
  })
}

export interface IssueQuoteInput {
  id: string
}

/** "Issuing" a quote (sent, not accepted) allocates its DEV-YYYY-NNN number and locks it —
 * mirrors invoice issuance (spec §3.5's numbering discipline applies equally). */
export function useIssueQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: IssueQuoteInput): Promise<Quote> => {
      const year = new Date().getFullYear()
      const { data: number, error: numberError } = await supabase.rpc('fn_allocate_document_number', {
        p_prefix: 'DEV',
        p_year: year,
      })
      if (numberError) throw numberError

      const { data, error } = await supabase
        .from('quotes')
        .update({ number, status: 'sent', locked: true, issued_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })
    },
  })
}

export interface AcceptQuoteInput {
  id: string
  acceptanceNote?: string
}

export function useAcceptQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, acceptanceNote }: AcceptQuoteInput): Promise<Quote> => {
      const { data, error } = await supabase
        .from('quotes')
        .update({ status: 'accepted', accepted_at: new Date().toISOString(), acceptance_note: acceptanceNote ?? null })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })
    },
  })
}

export function useRefuseQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<Quote> => {
      const { data, error } = await supabase.from('quotes').update({ status: 'refused' }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })
    },
  })
}

/**
 * "Convertir en facture" (spec §8): copies client, lines, currency, tax into a new invoice
 * draft, links both ways (source_quote_id / converted_invoice_id). Deleting the resulting
 * invoice must never delete the quote and vice versa — enforced by ON DELETE SET NULL on both
 * foreign keys at the schema level (0001_schema.sql), not by application logic.
 */
export function useConvertQuoteToInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (quote: QuoteWithLines): Promise<{ invoiceId: string }> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          user_id: userData.user.id,
          client_id: quote.client_id,
          client_snapshot: quote.client_snapshot,
          currency: quote.currency,
          tax_rate: quote.tax_rate,
          subtotal: quote.subtotal,
          tax_amount: quote.tax_amount,
          total: quote.total,
          supply_treatment: quote.supply_treatment,
          country_mention: quote.country_mention,
          bank_account_id: quote.bank_account_id,
          payment_terms: quote.payment_terms,
          notes: quote.notes,
          status: 'draft',
          source_quote_id: quote.id,
        })
        .select()
        .single()
      if (error) throw error

      if (quote.quote_lines.length > 0) {
        const { error: linesError } = await supabase.from('invoice_lines').insert(
          quote.quote_lines.map((l) => ({
            invoice_id: invoice.id,
            position: l.position,
            title: l.title,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            line_total: l.line_total,
          })),
        )
        if (linesError) throw linesError
      }

      const { error: updateError } = await supabase
        .from('quotes')
        .update({ converted_invoice_id: invoice.id })
        .eq('id', quote.id)
      if (updateError) throw updateError

      return { invoiceId: invoice.id }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
    },
  })
}
