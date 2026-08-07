/**
 * Shape of the JSON config file that carries everything the CSV exports don't: business
 * identity, bank account, FX rates, and the handful of explicit human decisions made during
 * migration prep (see docs/MIGRATION.md "CSV import path") that shouldn't be guessed by code —
 * the skipped BLEAU'DECOR devis row, the quote→invoice links, and the two client
 * country/supply-treatment overrides (Ipedis = domestic MU, Olivier Francis = export CA).
 *
 * This file's contents (real bank details, real client data) must never be committed to the
 * repo — it lives outside version control, passed to the script via --config.
 */
export interface BusinessConfig {
  businessIdentity: {
    name: string
    identifierType: string
    identifierValue: string
    email: string
    phone: string
    addressLine1: string
    city: string
    countryCode: string
    vatRegistered: boolean
    legalMentions: string
  }
  bankAccount: {
    bankName: string
    bankAddress: string
    beneficiary: string
    accountNumber: string
    iban: string
    bicSwift: string
    paypalAlias: string
    currency: string
  }
  /** Currency code -> rate to MUR. MUR itself is implicitly 1. */
  fxRates: Record<string, number>
  /** Keyed by exact client name as it appears in the CSV (case-insensitive). */
  clientOverrides: Record<string, { countryCode: string; supplyTreatment: 'domestic' | 'zero_rated_export' }>
  /** Quote numbers to skip entirely (data-quality anomalies in the source export). */
  skipQuoteNumbers: string[]
  /** Quote number -> the invoice number it was converted into. */
  quoteInvoiceLinks: Record<string, string>
}

export function findClientOverride(
  config: BusinessConfig,
  clientName: string,
): { countryCode: string; supplyTreatment: 'domestic' | 'zero_rated_export' } | null {
  const normalized = clientName.trim().toLowerCase()
  for (const [name, override] of Object.entries(config.clientOverrides)) {
    if (name.trim().toLowerCase() === normalized) return override
  }
  return null
}
