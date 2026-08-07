import { describe, expect, it } from 'vitest'
import {
  computeTaxAmounts,
  generateExpenseOccurrences,
  inferCountryCode,
  inferSupplyTreatment,
  mapExpenseCategoryLabel,
  mapInvoiceLines,
  mapInvoiceStatus,
  mapRecurrence,
  normalizeClientKey,
} from './mappers'

describe('normalizeClientKey', () => {
  it('is case- and whitespace-insensitive', () => {
    expect(normalizeClientKey('Acme SARL', 'Contact@Acme.fr')).toBe(
      normalizeClientKey('  acme sarl  ', '  contact@acme.fr  '),
    )
  })

  it('treats a missing email as empty, not null-ish garbage', () => {
    expect(normalizeClientKey('Acme SARL', null)).toBe('acme sarl|')
  })
})

describe('inferCountryCode', () => {
  it('matches known country keywords in free-text addresses', () => {
    expect(inferCountryCode('12 Rue de la Paix, 75002 Paris, France')).toBe('FR')
    expect(inferCountryCode('Rue du Rhône, 1204 Genève, Suisse')).toBe('CH')
    expect(inferCountryCode('Sheikh Zayed Road, Dubai, UAE')).toBe('AE')
    expect(inferCountryCode('123 Main St, Toronto, Ontario, Canada')).toBe('CA')
    expect(inferCountryCode('Sandton, Johannesburg, South Africa')).toBe('ZA')
    expect(inferCountryCode('Ebène, Maurice')).toBe('MU')
  })

  it('returns null when nothing matches (flagged "à compléter" downstream)', () => {
    expect(inferCountryCode('123 Somewhere Street')).toBeNull()
    expect(inferCountryCode(null)).toBeNull()
  })
})

describe('inferSupplyTreatment', () => {
  it('is domestic only for Mauritius, zero-rated export otherwise (including unknown)', () => {
    expect(inferSupplyTreatment('MU')).toBe('domestic')
    expect(inferSupplyTreatment('FR')).toBe('zero_rated_export')
    expect(inferSupplyTreatment(null)).toBe('zero_rated_export')
  })
})

describe('mapInvoiceStatus', () => {
  it('maps payée to paid, everything else to issued (overdue is derived later)', () => {
    expect(mapInvoiceStatus('payée')).toBe('paid')
    expect(mapInvoiceStatus('en attente')).toBe('issued')
    expect(mapInvoiceStatus('en retard')).toBe('issued')
  })

  it('throws on an unrecognised status rather than silently guessing', () => {
    expect(() => mapInvoiceStatus('brouillon')).toThrow(/Unrecognised invoice status/)
  })
})

describe('mapExpenseCategoryLabel', () => {
  it('maps the CSV category labels used in this migration to their taxonomy keys', () => {
    expect(mapExpenseCategoryLabel('Logiciels/Abonnements')).toBe('software_subscriptions')
    expect(mapExpenseCategoryLabel('Marketing')).toBe('advertising')
    expect(mapExpenseCategoryLabel('Matériel')).toBe('hardware')
  })

  it('defaults a missing category to "other"', () => {
    expect(mapExpenseCategoryLabel(null)).toBe('other')
  })

  it('throws on an unmapped label rather than silently bucketing it into "other"', () => {
    expect(() => mapExpenseCategoryLabel('Voyages')).toThrow(/Unrecognised expense category label/)
  })
})

describe('mapRecurrence', () => {
  it('maps the three V1 recurrence values and null', () => {
    expect(mapRecurrence('mensuelle')).toBe('monthly')
    expect(mapRecurrence('trimestrielle')).toBe('quarterly')
    expect(mapRecurrence('annuelle')).toBe('yearly')
    expect(mapRecurrence(null)).toBe('none')
  })

  it('throws on an unrecognised recurrence value', () => {
    expect(() => mapRecurrence('hebdomadaire-typo')).toThrow(/Unrecognised recurrence/)
  })
})

describe('mapInvoiceLines', () => {
  it('defaults to a single line with the detail folded into the description', () => {
    const lines = mapInvoiceLines('Gestion de campagnes', 'Mars 2024 — Meta + Google', 1000, false)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      title: 'Gestion de campagnes',
      description: 'Mars 2024 — Meta + Google',
      unit_price: '1000.00',
      line_total: '1000.00',
    })
  })

  it('has no description when detail is empty', () => {
    const lines = mapInvoiceLines('Gestion de campagnes', null, 1000, false)
    expect(lines[0]?.description).toBeNull()
  })

  it('splits "- " prefixed detail lines when splitDetails is true', () => {
    const lines = mapInvoiceLines('Prestations mars', '- Setup Meta Ads\n- Rapport mensuel', 1500, true)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ title: 'Prestations mars', unit_price: '1500.00' })
    expect(lines[1]).toMatchObject({ title: 'Setup Meta Ads', unit_price: '0.00' })
    expect(lines[2]).toMatchObject({ title: 'Rapport mensuel', unit_price: '0.00' })
  })

  it('falls back to a single line when splitDetails is true but no "- " lines exist', () => {
    const lines = mapInvoiceLines('Prestations mars', 'Un simple paragraphe sans tirets', 1500, true)
    expect(lines).toHaveLength(1)
  })
})

describe('computeTaxAmounts', () => {
  it('computes subtotal/tax/total without float drift', () => {
    expect(computeTaxAmounts(1000, 15)).toEqual({ subtotal: '1000.00', taxAmount: '150.00', total: '1150.00' })
  })

  it('rounds the tax amount half-up to the cent on an awkward subtotal', () => {
    // 10.01 * 0.15 = 1.5015 -> rounds to 1.50
    expect(computeTaxAmounts(10.01, 15)).toEqual({ subtotal: '10.01', taxAmount: '1.50', total: '11.51' })
  })

  it('handles a zero tax rate (unregistered / zero-rated export)', () => {
    expect(computeTaxAmounts(500, 0)).toEqual({ subtotal: '500.00', taxAmount: '0.00', total: '500.00' })
  })
})

describe('generateExpenseOccurrences', () => {
  it('produces exactly one occurrence for a non-recurring expense', () => {
    const occurrences = generateExpenseOccurrences(
      new Date('2024-03-12'),
      null,
      'none',
      100,
      45,
      new Date('2026-08-07'),
    )
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toEqual({ occurrence_date: '2024-03-12', amount: '100.00', amount_mur: '4500.00' })
  })

  it('backfills monthly occurrences from start date up to today', () => {
    const occurrences = generateExpenseOccurrences(
      new Date('2026-01-01'),
      null,
      'monthly',
      50,
      45,
      new Date('2026-04-01'),
    )
    expect(occurrences.map((o) => o.occurrence_date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
  })

  it('stops at recurrence_end_date when that comes before today', () => {
    const occurrences = generateExpenseOccurrences(
      new Date('2026-01-01'),
      new Date('2026-02-15'),
      'monthly',
      50,
      45,
      new Date('2026-08-07'),
    )
    expect(occurrences.map((o) => o.occurrence_date)).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('steps quarterly and yearly correctly', () => {
    const quarterly = generateExpenseOccurrences(new Date('2026-01-01'), null, 'quarterly', 10, 45, new Date('2026-08-07'))
    expect(quarterly.map((o) => o.occurrence_date)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01'])

    const yearly = generateExpenseOccurrences(new Date('2023-01-01'), null, 'yearly', 10, 45, new Date('2026-08-07'))
    expect(yearly.map((o) => o.occurrence_date)).toEqual(['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'])
  })
})
