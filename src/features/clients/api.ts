import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import type { Database } from '@/types/supabase'

export type Client = Database['public']['Tables']['clients']['Row']
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type ClientUpdate = Database['public']['Tables']['clients']['Update']

export interface ClientFinancials {
  client_id: string
  ca_total_mur: number
  encours_mur: number
  has_overdue: boolean
  invoice_count: number
  last_invoice_date: string | null
  /** Average days between issue and full payment across this client's paid invoices — the
   * payment-behaviour signal (spec §6.2). Null when they have no paid invoices yet. */
  avg_payment_delay_days: number | null
}

export type ClientWithFinancials = Client & { financials: ClientFinancials | null }

export interface ClientListFilters {
  search?: string
  countryCode?: string | null
  currency?: string | null
  showArchived?: boolean
  onlyWithOutstanding?: boolean
}

export function useClients(filters: ClientListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.clients.list(filters),
    queryFn: async (): Promise<ClientWithFinancials[]> => {
      let query = supabase.from('clients').select('*')

      if (filters.showArchived) {
        query = query.not('archived_at', 'is', null)
      } else {
        query = query.is('archived_at', null)
      }
      if (filters.countryCode) query = query.eq('country_code', filters.countryCode)
      if (filters.currency) query = query.eq('default_currency', filters.currency)
      if (filters.search) {
        const term = `%${filters.search}%`
        query = query.or(`name.ilike.${term},email.ilike.${term},identifier_value.ilike.${term}`)
      }

      const { data: clients, error } = await query.order('name')
      if (error) throw error

      const { data: financials, error: finError } = await supabase.from('v_client_financials').select('*')
      if (finError) throw finError

      const financialsByClient = new Map(financials.map((f) => [f.client_id, f as ClientFinancials]))
      let result: ClientWithFinancials[] = clients.map((c) => ({ ...c, financials: financialsByClient.get(c.id) ?? null }))

      if (filters.onlyWithOutstanding) {
        result = result.filter((c) => (c.financials?.encours_mur ?? 0) > 0)
      }

      return result
    },
  })
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clients.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ClientWithFinancials> => {
      const { data: client, error } = await supabase.from('clients').select('*').eq('id', id!).single()
      if (error) throw error
      const { data: financials } = await supabase.from('v_client_financials').select('*').eq('client_id', id!).maybeSingle()
      return { ...client, financials: (financials as ClientFinancials) ?? null }
    },
  })
}

/** Searchable client list for the invoice/quote combobox (spec §6.4) — active clients only. */
export function useClientSearch(search: string) {
  return useQuery({
    queryKey: queryKeys.clients.list({ search, combobox: true }),
    queryFn: async (): Promise<Client[]> => {
      let query = supabase.from('clients').select('*').is('archived_at', null).order('name').limit(20)
      if (search.trim()) {
        const term = `%${search.trim()}%`
        query = query.or(`name.ilike.${term},email.ilike.${term},identifier_value.ilike.${term}`)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<ClientInsert, 'user_id'>): Promise<Client> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...input, user_id: userData.user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all })
    },
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ClientUpdate }): Promise<Client> => {
      const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(variables.id) })
    },
  })
}

/** No hard delete when referenced by any document (spec §6.1) — archiving is the only path
 * from the client list/detail UI. An unreferenced client may still be hard-deleted separately. */
export function useArchiveClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(id) })
    },
  })
}

export function useUnarchiveClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('clients').update({ archived_at: null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(id) })
    },
  })
}

export interface MergeClientsInput {
  keepId: string
  mergeId: string
}

/** Merges a duplicate client into the one being kept — re-points every invoice/quote (even
 * issued/locked ones, spec-compliant per fn_merge_clients' own reasoning) and archives the
 * duplicate. Server-side, transactional, single RPC call (0009_merge_clients_function.sql). */
export function useMergeClients() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ keepId, mergeId }: MergeClientsInput): Promise<void> => {
      const { error } = await supabase.rpc('fn_merge_clients', { p_keep_id: keepId, p_merge_id: mergeId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })
    },
  })
}
