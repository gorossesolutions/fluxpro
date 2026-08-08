import { describe, expect, it } from 'vitest'
import { resolveCountryDefaults, resolveDefaultTaxRate, MAURITIUS_STANDARD_VAT_RATE } from './taxRules'
import type { CountryRule } from './api'

const countryRules: CountryRule[] = [
  {
    country_code: 'MU',
    country_label_fr: 'Maurice',
    mention_fr: null,
    mention_en: null,
    reverse_charge: false,
    identifier_label: 'BRN',
    identifier_regex: null,
    default_identifier_type: 'BRN',
  },
  {
    country_code: 'FR',
    country_label_fr: 'France',
    mention_fr: 'Autoliquidation',
    mention_en: 'Reverse charge',
    reverse_charge: true,
    identifier_label: 'SIRET',
    identifier_regex: '^\\d{14}$',
    default_identifier_type: 'SIRET',
  },
]

describe('resolveCountryDefaults', () => {
  it('marks MU as domestic', () => {
    expect(resolveCountryDefaults(countryRules, 'MU')?.supplyTreatment).toBe('domestic')
  })

  it('marks any other country as zero-rated export', () => {
    expect(resolveCountryDefaults(countryRules, 'FR')?.supplyTreatment).toBe('zero_rated_export')
  })

  it('returns null for an unknown or missing country code', () => {
    expect(resolveCountryDefaults(countryRules, null)).toBeNull()
    expect(resolveCountryDefaults(countryRules, 'ZZ')).toBeNull()
  })
})

describe('resolveDefaultTaxRate', () => {
  it('always defers to an explicit client default_tax_rate, VAT-registered or not', () => {
    expect(resolveDefaultTaxRate(0, 'MU', countryRules, true)).toBe(0)
    expect(resolveDefaultTaxRate(20, 'FR', countryRules, false)).toBe(20)
  })

  it('applies the standard Mauritian VAT rate to a domestic client once VAT-registered', () => {
    expect(resolveDefaultTaxRate(null, 'MU', countryRules, true)).toBe(MAURITIUS_STANDARD_VAT_RATE)
  })

  it('stays at 0% for a domestic client before VAT registration', () => {
    expect(resolveDefaultTaxRate(null, 'MU', countryRules, false)).toBe(0)
  })

  it('never applies VAT to an export (non-MU) client, registered or not', () => {
    expect(resolveDefaultTaxRate(null, 'FR', countryRules, true)).toBe(0)
    expect(resolveDefaultTaxRate(null, 'FR', countryRules, false)).toBe(0)
  })

  it('falls back to 0% for a client with no country code set', () => {
    expect(resolveDefaultTaxRate(null, null, countryRules, true)).toBe(0)
  })
})
