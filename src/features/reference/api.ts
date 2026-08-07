import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import type { Database, IdentifierType } from '@/types/supabase'

export type CountryRule = Database['public']['Tables']['country_rules']['Row']
export type BankAccount = Database['public']['Tables']['bank_accounts']['Row']

/** Reference data changes essentially never at runtime — long staleTime avoids refetch churn. */
const REFERENCE_STALE_TIME = 10 * 60 * 1000

export function useCountryRules() {
  return useQuery({
    queryKey: queryKeys.countryRules.all,
    queryFn: async (): Promise<CountryRule[]> => {
      const { data, error } = await supabase.from('country_rules').select('*').order('country_label_fr')
      if (error) throw error
      return data
    },
    staleTime: REFERENCE_STALE_TIME,
  })
}

export interface CountryDefaults {
  identifierType: IdentifierType
  identifierLabel: string
  identifierRegex: string | null
  supplyTreatment: 'domestic' | 'zero_rated_export'
  countryMention: string | null
}

/** Country-driven defaults for a client record (spec §6.3): identifier type/label, supply
 * treatment, and the mandatory mention — all resolved from country_rules, never hardcoded. */
export function resolveCountryDefaults(rules: CountryRule[], countryCode: string | null): CountryDefaults | null {
  if (!countryCode) return null
  const rule = rules.find((r) => r.country_code === countryCode)
  if (!rule) return null
  return {
    identifierType: rule.default_identifier_type,
    identifierLabel: rule.identifier_label,
    identifierRegex: rule.identifier_regex,
    supplyTreatment: countryCode === 'MU' ? 'domestic' : 'zero_rated_export',
    countryMention: rule.reverse_charge ? rule.mention_fr : null,
  }
}

export interface ResolvedFxRate {
  rate: number
  source: string
  approximate: boolean
}

/**
 * FX rate resolution per spec §11's three-layer strategy, layers (a)+(b): exact date in
 * fx_rates, else nearest prior date within 7 days (flagged approximate). Layer (c) — the
 * ExchangeRate-API historical endpoint via a Pro key — is an Edge Function concern (build step
 * 8), not implemented client-side. Layer (d), manual entry, is always available in the
 * calling form regardless of what this returns; a null return means "nothing found, ask the
 * user."
 */
export async function resolveFxRate(currency: string, date: string): Promise<ResolvedFxRate | null> {
  if (currency === 'MUR') return { rate: 1, source: 'identity', approximate: false }

  const { data: exact } = await supabase
    .from('fx_rates')
    .select('rate, source')
    .eq('base_currency', currency)
    .eq('quote_currency', 'MUR')
    .eq('rate_date', date)
    .maybeSingle()
  if (exact) return { rate: exact.rate, source: exact.source, approximate: false }

  const sevenDaysBefore = new Date(date)
  sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7)

  const { data: nearest } = await supabase
    .from('fx_rates')
    .select('rate, source')
    .eq('base_currency', currency)
    .eq('quote_currency', 'MUR')
    .lte('rate_date', date)
    .gte('rate_date', sevenDaysBefore.toISOString().slice(0, 10))
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (nearest) return { rate: nearest.rate, source: nearest.source, approximate: true }

  return null
}

export function useBankAccounts() {
  return useQuery({
    queryKey: queryKeys.bankAccounts.all,
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase.from('bank_accounts').select('*').order('sort_order')
      if (error) throw error
      return data
    },
    staleTime: REFERENCE_STALE_TIME,
  })
}
