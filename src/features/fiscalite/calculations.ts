import type { TaxBand, TaxConfig } from './api'

/** Mauritian fiscal year runs 1 July → 30 June (spec §3.1) — never calendar year. */
export function currentFiscalYearStart(today: Date = new Date()): string {
  const year = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-07-01`
}

export interface TaxBandResult {
  bandOrder: number
  lowerBound: number
  upperBound: number | null
  ratePct: number
  taxableInBand: number
  taxForBand: number
}

export interface ProgressiveTaxResult {
  bands: TaxBandResult[]
  totalTax: number
}

/** Marginal band-by-band computation (spec §3.1) — never a flat rate on the whole income.
 * Rates are read from tax_bands, never hardcoded. */
export function computeProgressiveTax(bands: TaxBand[], chargeableIncome: number): ProgressiveTaxResult {
  const sorted = [...bands].sort((a, b) => a.band_order - b.band_order)
  let totalTax = 0
  const results: TaxBandResult[] = sorted.map((band) => {
    const lower = band.lower_bound
    const upper = band.upper_bound
    const bandCeiling = upper ?? Infinity
    const taxableInBand = Math.max(0, Math.min(chargeableIncome, bandCeiling) - lower)
    const taxForBand = taxableInBand > 0 ? (taxableInBand * band.rate_pct) / 100 : 0
    totalTax += taxForBand
    return { bandOrder: band.band_order, lowerBound: lower, upperBound: upper, ratePct: band.rate_pct, taxableInBand, taxForBand }
  })
  return { bands: results, totalTax }
}

/**
 * Fair Share Contribution: 15% on leviable income above MUR 12M (spec §3.1).
 * ⚠ Open item (docs/COMPLIANCE.md §3.1): FSC's statutory base is "leviable income," which may
 * differ from "chargeable income" used for the progressive bands. This applies FSC to the same
 * chargeable-income figure until an accountant confirms otherwise — flagged in the UI, not just
 * here.
 */
export function computeFsc(config: TaxConfig | undefined, chargeableIncome: number): number {
  if (!config || !config.fsc_active) return 0
  if (chargeableIncome <= config.fsc_threshold) return 0
  return ((chargeableIncome - config.fsc_threshold) * config.fsc_rate) / 100
}
