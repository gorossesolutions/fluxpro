import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import type { Database } from '@/types/supabase'
import type { BankAccountFormValues, BusinessIdentityFormValues } from './schema'

export type BusinessIdentity = Database['public']['Tables']['business_identity']['Row']
export type BankAccount = Database['public']['Tables']['bank_accounts']['Row']
export type AppSettings = Database['public']['Tables']['app_settings']['Row']

export function useBusinessIdentity() {
  return useQuery({
    queryKey: queryKeys.businessIdentity.all,
    queryFn: async (): Promise<BusinessIdentity | null> => {
      const { data, error } = await supabase.from('business_identity').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** business_identity is keyed on user_id, not a separate id, and isn't bootstrapped on signup
 * (unlike profiles/app_settings) — an upsert on user_id handles both "never set up" and
 * "editing an existing row" in one call without the page needing to know which case it's in. */
export function useSaveBusinessIdentity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BusinessIdentityFormValues): Promise<BusinessIdentity> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('business_identity')
        .upsert({ ...input, user_id: userData.user.id }, { onConflict: 'user_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.businessIdentity.all })
    },
  })
}

export function useUploadLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const path = `${userData.user.id}/logo-${Date.now()}.${file.name.split('.').pop()}`
      const { error: uploadError } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type, upsert: true })
      if (uploadError) throw uploadError
      const { error } = await supabase.from('business_identity').update({ logo_path: path }).eq('user_id', userData.user.id)
      if (error) throw error
      return path
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.businessIdentity.all })
    },
  })
}

export async function getLogoSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('logos').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BankAccountFormValues): Promise<BankAccount> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { data, error } = await supabase.from('bank_accounts').insert({ ...input, user_id: userData.user.id }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts.all })
    },
  })
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: BankAccountFormValues }): Promise<BankAccount> => {
      const { data, error } = await supabase.from('bank_accounts').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts.all })
    },
  })
}

/** Deleting a bank account is a plain hard delete (unlike clients/expenses) — every reference
 * to it (invoices.bank_account_id, clients.default_bank_account_id) is `on delete set null`, so
 * nothing is left dangling; the caller is warned in the UI that already-issued documents will
 * show no bank details rather than the deleted account's, since that FK is live, not a frozen
 * snapshot. */
export function useDeleteBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts.all })
    },
  })
}

/** Atomic swap via fn_set_default_bank_account (0014) — never two sequential client-side
 * UPDATEs, which would leave a moment with zero or two defaults. */
export function useSetDefaultBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('fn_set_default_bank_account', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts.all })
    },
  })
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: async (): Promise<AppSettings | null> => {
      const { data, error } = await supabase.from('app_settings').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Partial<Pick<AppSettings, 'theme' | 'density' | 'keepalive_interval_days'>>): Promise<AppSettings> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { data, error } = await supabase.from('app_settings').update(updates).eq('user_id', userData.user.id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-settings'] })
    },
  })
}
