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
