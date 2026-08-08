import { useEffect, useRef } from 'react'
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

/** Scoped update for just this one field — used by the VAT auto-registration watch (see
 * useAutoVatRegistration below) so a background flip can't clobber the rest of the identity form
 * the way reusing useSaveBusinessIdentity's full-row upsert would risk. */
export function useSetVatRegistered() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vatRegistered: boolean): Promise<void> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { error } = await supabase.from('business_identity').update({ vat_registered: vatRegistered }).eq('user_id', userData.user.id)
      if (error) throw error
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

/** pdfmake needs the logo's actual bytes inline (a signed URL isn't something it can fetch
 * itself) — resolves the storage path straight to a data: URL ready to drop into a PDF. */
export async function getLogoDataUrl(path: string): Promise<string> {
  const signedUrl = await getLogoSignedUrl(path)
  const res = await fetch(signedUrl)
  if (!res.ok) throw new Error(`Impossible de récupérer le logo (HTTP ${res.status})`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du logo échouée'))
    reader.readAsDataURL(blob)
  })
}

/** Backs the Paramètres logo preview (and anything else that wants to just render the current
 * logo) — re-signs on a shorter cadence than the URL's own 300s validity so the <img> never sits
 * on an expired link. */
export function useLogoUrl(logoPath: string | null | undefined) {
  return useQuery({
    queryKey: ['logo-url', logoPath],
    queryFn: () => getLogoSignedUrl(logoPath!),
    enabled: Boolean(logoPath),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
  })
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
    mutationFn: async (
      updates: Partial<Pick<AppSettings, 'theme' | 'density' | 'keepalive_interval_days' | 'exchangerate_api_key'>>,
    ): Promise<AppSettings> => {
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

/** Matches V1's own "Taux de change" widget exactly (EUR/USD/GBP only) — a deliberately
 * simpler, client-side alternative to the fx-snapshot Edge Function (0010_...): the user's own
 * ExchangeRate-API key lives in app_settings and every fetch happens straight from the
 * browser, no server involved. Both mechanisms write into the same fx_rates table that
 * resolveFxRate() reads from, so either one (or both) keeps invoice/quote FX resolution fed. */
export const CLIENT_FX_CURRENCIES = ['EUR', 'USD', 'GBP'] as const
export type ClientFxCurrency = (typeof CLIENT_FX_CURRENCIES)[number]

/** Three plain GETs (v6.exchangerate-api.com/v6/{key}/latest/{base}), one per tracked
 * currency — same shape of call the fx-snapshot Edge Function makes server-side, just run
 * here instead. Throws with a message safe to show directly in a toast (never leaks the key
 * itself back into an error string). */
export async function fetchClientExchangeRates(apiKey: string): Promise<Record<ClientFxCurrency, number>> {
  const entries = await Promise.all(
    CLIENT_FX_CURRENCIES.map(async (currency) => {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${currency}`)
      if (!res.ok) throw new Error(`${currency} : requête échouée (HTTP ${res.status}) — vérifie la clé API`)
      const json = await res.json()
      if (json?.result === 'error') {
        throw new Error(`${currency} : ${json['error-type'] ?? 'erreur inconnue'} — vérifie la clé API`)
      }
      const rate = json?.conversion_rates?.MUR
      if (typeof rate !== 'number') throw new Error(`${currency} : aucun taux MUR dans la réponse`)
      return [currency, rate] as const
    }),
  )
  return Object.fromEntries(entries) as Record<ClientFxCurrency, number>
}

export function useTodayFxRates() {
  return useQuery({
    queryKey: ['fx-rates', 'today'],
    queryFn: async (): Promise<Partial<Record<ClientFxCurrency, number>>> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('fx_rates')
        .select('base_currency, rate')
        .eq('quote_currency', 'MUR')
        .eq('rate_date', today)
        .in('base_currency', CLIENT_FX_CURRENCIES as unknown as string[])
      if (error) throw error
      return Object.fromEntries(data.map((r) => [r.base_currency, r.rate]))
    },
  })
}

export function useSaveFxRates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rates: Partial<Record<ClientFxCurrency, number>>): Promise<void> => {
      const today = new Date().toISOString().slice(0, 10)
      const rows = Object.entries(rates)
        .filter((entry): entry is [ClientFxCurrency, number] => entry[1] != null)
        .map(([currency, rate]) => ({
          rate_date: today,
          base_currency: currency,
          quote_currency: 'MUR',
          rate,
          source: 'exchangerate-api-manual',
        }))
      if (rows.length === 0) return
      const { error } = await supabase.from('fx_rates').upsert(rows, { onConflict: 'rate_date,base_currency,quote_currency' })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fx-rates'] })
    },
  })
}

/** Runs once per authenticated session (mounted in AppLayout): if today's EUR/USD/GBP → MUR
 * rates aren't in fx_rates yet and an API key is configured, fetches and saves them silently —
 * so resolveFxRate() has a same-day rate to offer whether or not anyone visits Paramètres first.
 * This only keeps the *source* data fresh; invoice/quote issuance still freezes whatever rate
 * was resolved onto the document at that moment (fx_rate_to_mur/fx_rate_date/fx_source), same as
 * always — a later refresh here never touches an already-issued document. */
export function useAutoRefreshFxRates() {
  const { data: settings } = useAppSettings()
  const { data: todayRates } = useTodayFxRates()
  const saveFxRates = useSaveFxRates()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    if (!settings?.exchangerate_api_key || !todayRates) return
    const hasAllRates = CLIENT_FX_CURRENCIES.every((c) => todayRates[c] != null)
    if (hasAllRates) return
    attempted.current = true
    void fetchClientExchangeRates(settings.exchangerate_api_key)
      .then((rates) => saveFxRates.mutateAsync(rates))
      .catch(() => {
        // Silent by design: Paramètres' "Tester la clé" surfaces the same errors explicitly
        // when the user is actually looking at that screen; a background refresh failing
        // shouldn't interrupt whatever page they're on.
      })
  }, [settings, todayRates, saveFxRates])
}
