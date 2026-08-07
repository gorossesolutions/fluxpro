import { describe, expect, it } from 'vitest'
import { computeProgressiveTax, computeFsc, currentFiscalYearStart } from './calculations'
import type { TaxBand, TaxConfig } from './api'

const BANDS: TaxBand[] = [
  { id: '1', fiscal_year_start: '2026-07-01', band_order: 1, lower_bound: 0, upper_bound: 500000, rate_pct: 0 },
  { id: '2', fiscal_year_start: '2026-07-01', band_order: 2, lower_bound: 500001, upper_bound: 1000000, rate_pct: 10 },
  { id: '3', fiscal_year_start: '2026-07-01', band_order: 3, lower_bound: 1000001, upper_bound: null, rate_pct: 20 },
]

const CONFIG: TaxConfig = {
  fiscal_year_start: '2026-07-01',
  fsc_threshold: 12_000_000,
  fsc_rate: 15,
  fsc_active: true,
  vat_registration_threshold: 3_000_000,
  currency: 'MUR',
}

describe('computeProgressiveTax', () => {
  it('charges nothing within the 0% band', () => {
    const { totalTax } = computeProgressiveTax(BANDS, 300_000)
    expect(totalTax).toBe(0)
  })

  it('taxes only the portion inside the second band', () => {
    const { bands, totalTax } = computeProgressiveTax(BANDS, 700_000)
    expect(bands[0]?.taxForBand).toBe(0)
    expect(bands[1]?.taxableInBand).toBeCloseTo(199_999, 5)
    expect(totalTax).toBeCloseTo(19_999.9, 5)
  })

  it('applies marginal rates band by band, never flat on the whole income', () => {
    const { bands, totalTax } = computeProgressiveTax(BANDS, 2_000_000)
    expect(bands[0]?.taxForBand).toBe(0)
    expect(bands[1]?.taxableInBand).toBeCloseTo(499_999, 5)
    expect(bands[2]?.taxableInBand).toBeCloseTo(999_999, 5)
    // 499_999 * 10% + 999_999 * 20%
    expect(totalTax).toBeCloseTo(49_999.9 + 199_999.8, 3)
  })

  it('handles zero income', () => {
    const { totalTax } = computeProgressiveTax(BANDS, 0)
    expect(totalTax).toBe(0)
  })
})

describe('computeFsc', () => {
  it('is zero below the threshold', () => {
    expect(computeFsc(CONFIG, 5_000_000)).toBe(0)
  })

  it('is zero when inactive even above the threshold', () => {
    expect(computeFsc({ ...CONFIG, fsc_active: false }, 20_000_000)).toBe(0)
  })

  it('applies 15% only to the excess above threshold', () => {
    expect(computeFsc(CONFIG, 13_000_000)).toBeCloseTo(150_000, 5)
  })

  it('is zero when config is undefined', () => {
    expect(computeFsc(undefined, 20_000_000)).toBe(0)
  })
})

describe('currentFiscalYearStart', () => {
  it('resolves to the same-year 1 July when today is in H2 of the calendar year', () => {
    expect(currentFiscalYearStart(new Date(2026, 7, 7))).toBe('2026-07-01') // 7 Aug 2026
  })

  it('resolves to the prior-year 1 July when today is in H1 of the calendar year', () => {
    expect(currentFiscalYearStart(new Date(2026, 2, 15))).toBe('2025-07-01') // 15 Mar 2026
  })
})
