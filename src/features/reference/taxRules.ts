import type { IdentifierType } from '@/types/supabase'
import type { CountryRule } from './api'

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

/** Standard Mauritian VAT rate (Fifth Schedule, VAT Act) — the general rate applied to
 * standard-rated domestic supplies once a business is VAT-registered. Exempt/zero-rated
 * categories exist but aren't distinguished here; a client's own default_tax_rate always
 * overrides this (see resolveDefaultTaxRate) for exactly that reason. */
export const MAURITIUS_STANDARD_VAT_RATE = 15

/** Fallback tax rate for a new invoice/quote line once a client has never had its own
 * default_tax_rate set: 15% on domestic (Mauritius) supplies once the business is
 * VAT-registered, 0% otherwise (export supplies are zero-rated regardless). A client's explicit
 * default_tax_rate always wins over this — e.g. an exempt domestic service, or a registered
 * business billing a MU client before switching this on. General rule, not a substitute for
 * confirming edge cases (exempt categories, partial exemption) with an accountant. */
export function resolveDefaultTaxRate(
  clientDefaultTaxRate: number | null,
  clientCountryCode: string | null,
  countryRules: CountryRule[],
  vatRegistered: boolean,
): number {
  if (clientDefaultTaxRate != null) return clientDefaultTaxRate
  const isDomestic = resolveCountryDefaults(countryRules, clientCountryCode)?.supplyTreatment === 'domestic'
  return vatRegistered && isDomestic ? MAURITIUS_STANDARD_VAT_RATE : 0
}
