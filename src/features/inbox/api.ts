import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import type { Database, MatchedEntityType } from '@/types/supabase'

export type InboxDocument = Database['public']['Tables']['documents']['Row']

export interface DocumentListFilters {
  status?: 'all' | 'unmatched' | 'matched'
  showArchived?: boolean
}

export function useDocuments(filters: DocumentListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.documents.list(filters),
    queryFn: async (): Promise<InboxDocument[]> => {
      let query = supabase.from('documents').select('*')
      query = filters.showArchived ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Documents matched to any of this client's invoices (spec: the Client detail page's own
 * "Documents" tab) — resolved via the client's invoice ids first, matched_entity_type/
 * matched_entity_id being a loose polymorphic reference rather than a real FK (see
 * docs/SCHEMA.md's reconciliation section). */
export function useClientMatchedDocuments(clientId: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'client', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<InboxDocument[]> => {
      const { data: invoices, error: invoicesError } = await supabase.from('invoices').select('id').eq('client_id', clientId!)
      if (invoicesError) throw invoicesError
      if (invoices.length === 0) return []

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('matched_entity_type', 'invoice')
        .in(
          'matched_entity_id',
          invoices.map((i) => i.id),
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Lightweight count for the "À classer" tab badge — a head-only request, never fetches rows,
 * so it's cheap to run alongside whichever tab's own full query is active. */
export function useUnmatchedDocumentCount() {
  return useQuery({
    queryKey: [...queryKeys.documents.all, 'unmatched-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'unmatched')
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Signed URL, resolved on demand (not pre-fetched per row) — the bucket is private (spec §3.8),
 * and generating a working link for every row on every list render would leak more short-lived
 * access than any one viewer actually needs. */
export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 60)
  if (error) throw error
  return data.signedUrl
}

/** Capture-first upload (spec §10): each file lands in Storage and gets an `unmatched` row
 * immediately, with no OCR/classification blocking the upload itself — classification (detected
 * amount/date, then a match) is a separate step the user drives afterwards. */
export function useUploadDocuments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]): Promise<InboxDocument[]> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const userId = userData.user.id

      const uploaded: InboxDocument[] = []
      for (const file of files) {
        const path = `${userId}/${crypto.randomUUID()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(path, file, { contentType: file.type || undefined })
        if (uploadError) throw uploadError

        const { data, error } = await supabase
          .from('documents')
          .insert({ user_id: userId, storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size })
          .select()
          .single()
        if (error) throw error
        uploaded.push(data)
      }
      return uploaded
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

export function useUpdateDocumentDetails() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      detectedAmount,
      detectedDate,
    }: {
      id: string
      detectedAmount: number | null
      detectedDate: string | null
    }): Promise<InboxDocument> => {
      const { data, error } = await supabase
        .from('documents')
        .update({ detected_amount: detectedAmount, detected_date: detectedDate })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

export function useConfirmMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      entityType,
      entityId,
    }: {
      id: string
      entityType: MatchedEntityType
      entityId: string
    }): Promise<InboxDocument> => {
      const { data, error } = await supabase
        .from('documents')
        .update({ matched_entity_type: entityType, matched_entity_id: entityId, status: 'matched' })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

export function useUnmatchDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('documents')
        .update({ matched_entity_type: null, matched_entity_id: null, status: 'unmatched' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

export function useArchiveDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

export function useRestoreDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('documents').update({ deleted_at: null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

/** Hard delete, unlike archive (deleted_at) — for the genuinely irrelevant/wrong upload, not
 * something anyone will want back. Removes the storage object first (best-effort: a storage
 * failure shouldn't block clearing the row if the file is already gone) then the row itself. */
export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (doc: Pick<InboxDocument, 'id' | 'storage_path'>): Promise<void> => {
      await supabase.storage.from('documents').remove([doc.storage_path])
      const { error } = await supabase.from('documents').delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
    },
  })
}

export interface MatchCandidate {
  entityType: MatchedEntityType
  entityId: string
  label: string
  amount: number
  currency: string
  date: string
  score: number
}

function scoreCandidate(amount: number, targetAmount: number, dateStr: string, targetDateMs: number): number {
  const amountDiff = Math.abs(amount - targetAmount)
  const amountScore = amountDiff < 0.01 ? 1 : Math.max(0, 1 - amountDiff / Math.max(targetAmount, 1))
  const dayDiff = Math.abs(new Date(dateStr).getTime() - targetDateMs) / 86_400_000
  const dateScore = Math.max(0, 1 - dayDiff / 14)
  return amountScore * 0.7 + dateScore * 0.3
}

/**
 * Suggestion-matching engine (spec §10): no OCR pipeline exists yet (that's an Edge Function
 * concern for a later build step), so this works off what the user enters manually — detected
 * amount + date — against expenses and invoices dated within 14 days either side, ranked by
 * amount closeness (weighted higher) then date proximity. Top 5 only; a confident exact-amount
 * match on the right day always sorts first.
 *
 * A recurring expense's own `expense_date` is frozen at whenever it was first created — it
 * never moves month to month — so matching only against that column made every occurrence
 * after the first invisible to a receipt dated for, say, this month's charge. The actual
 * per-period dates live in expense_occurrences, so recurring expenses are matched via their
 * occurrences instead; the match still links to the parent expense (documents.matched_entity_id
 * has no concept of "this specific occurrence" — see docs/SCHEMA.md).
 */
export function useMatchCandidates(doc: InboxDocument | null) {
  return useQuery({
    queryKey: ['documents', 'candidates', doc?.id, doc?.detected_amount, doc?.detected_date],
    enabled: Boolean(doc && doc.detected_amount != null && doc.detected_date),
    queryFn: async (): Promise<MatchCandidate[]> => {
      const targetAmount = doc!.detected_amount!
      const targetDateMs = new Date(doc!.detected_date!).getTime()
      const from = new Date(targetDateMs - 14 * 86_400_000).toISOString().slice(0, 10)
      const to = new Date(targetDateMs + 14 * 86_400_000).toISOString().slice(0, 10)

      const [expensesResult, occurrencesResult, invoicesResult] = await Promise.all([
        supabase.from('expenses').select('id, supplier, amount, currency, expense_date').is('deleted_at', null).gte('expense_date', from).lte('expense_date', to),
        supabase.from('expense_occurrences').select('expense_id, occurrence_date, amount').gte('occurrence_date', from).lte('occurrence_date', to),
        supabase.from('invoices').select('id, number, total, currency, issue_date').gte('issue_date', from).lte('issue_date', to),
      ])
      if (expensesResult.error) throw expensesResult.error
      if (occurrencesResult.error) throw occurrencesResult.error
      if (invoicesResult.error) throw invoicesResult.error

      const occurrenceExpenseIds = [...new Set(occurrencesResult.data.map((o) => o.expense_id))].filter(
        (id) => !expensesResult.data.some((e) => e.id === id),
      )
      const occurrenceExpensesResult =
        occurrenceExpenseIds.length > 0
          ? await supabase.from('expenses').select('id, supplier, currency').is('deleted_at', null).in('id', occurrenceExpenseIds)
          : { data: [], error: null }
      if (occurrenceExpensesResult.error) throw occurrenceExpensesResult.error
      const occurrenceExpensesById = new Map(occurrenceExpensesResult.data.map((e) => [e.id, e]))

      const candidatesByKey = new Map<string, MatchCandidate>()
      const upsertCandidate = (candidate: MatchCandidate) => {
        const key = `${candidate.entityType}:${candidate.entityId}`
        const existing = candidatesByKey.get(key)
        if (!existing || candidate.score > existing.score) candidatesByKey.set(key, candidate)
      }

      for (const e of expensesResult.data) {
        upsertCandidate({
          entityType: 'expense',
          entityId: e.id,
          label: e.supplier,
          amount: e.amount,
          currency: e.currency,
          date: e.expense_date,
          score: scoreCandidate(e.amount, targetAmount, e.expense_date, targetDateMs),
        })
      }

      for (const o of occurrencesResult.data) {
        const expense = expensesResult.data.find((e) => e.id === o.expense_id) ?? occurrenceExpensesById.get(o.expense_id)
        if (!expense) continue
        upsertCandidate({
          entityType: 'expense',
          entityId: o.expense_id,
          label: expense.supplier,
          amount: o.amount,
          currency: expense.currency,
          date: o.occurrence_date,
          score: scoreCandidate(o.amount, targetAmount, o.occurrence_date, targetDateMs),
        })
      }

      for (const i of invoicesResult.data) {
        upsertCandidate({
          entityType: 'invoice',
          entityId: i.id,
          label: i.number ?? 'Facture (brouillon)',
          amount: i.total,
          currency: i.currency,
          date: i.issue_date,
          score: scoreCandidate(i.total, targetAmount, i.issue_date, targetDateMs),
        })
      }

      return [...candidatesByKey.values()].sort((a, b) => b.score - a.score).slice(0, 5)
    },
  })
}
