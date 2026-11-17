import { describe, expect, it } from 'vitest'
import { computeSelfEmployedCsg, computeCsgSchedule, fiscalYearMonths } from './calculations'
import { toMinorUnits, type MinorUnits } from '@/lib/money'

const csg = (net: number) => computeSelfEmployedCsg(toMinorUnits(net)) / 100

describe('computeSelfEmployedCsg (MRA self-employed bands)', () => {
  it('is a flat Rs 150 up to Rs 10,000, including a loss month', () => {
    expect(csg(0)).toBe(150)
    expect(csg(-5000)).toBe(150)
    expect(csg(10_000)).toBe(150)
  })

  it('is 1.5% of 90% between Rs 10,000 and Rs 50,000, with a Rs 150 minimum', () => {
    expect(csg(10_000.01)).toBe(150) // 135.00 → floored up to the minimum
    expect(csg(30_000)).toBe(405)
    expect(csg(50_000)).toBe(675)
  })

  it('is 3% of 90% above Rs 50,000', () => {
    expect(csg(50_000.01)).toBe(1350)
    expect(csg(80_000)).toBe(2160)
  })
})

describe('fiscalYearMonths', () => {
  it('runs July → June', () => {
    const months = fiscalYearMonths('2025-07-01')
    expect(months[0]).toBe('2025-07')
    expect(months[5]).toBe('2025-12')
    expect(months[6]).toBe('2026-01')
    expect(months[11]).toBe('2026-06')
  })
})

describe('computeCsgSchedule', () => {
  const monthly: Record<string, MinorUnits> = {
    '2026-07': toMinorUnits(80_000),
    '2026-08': toMinorUnits(30_000),
    '2026-09': toMinorUnits(-2_000),
  }

  it('actual mode: each month on its own net, stops at the current month', () => {
    const s = computeCsgSchedule('2026-07-01', 'actual', monthly, 0 as MinorUnits, '2026-10')
    expect(s.months.slice(0, 4).map((m) => (m.csgMinor ?? 0) / 100)).toEqual([2160, 405, 150, 150])
    expect(s.months[4]).toEqual({ month: '2026-11', baseMinor: null, csgMinor: null })
    expect(s.monthsComputed).toBe(4)
    expect(s.totalMinor / 100).toBe(2865)
  })

  it('previous-year mode: 1/12 of last year for all 12 months (MRA example: Rs 120,000 → Rs 1,800/yr)', () => {
    const s = computeCsgSchedule('2026-07-01', 'previous_year', {}, toMinorUnits(120_000), '2026-10')
    expect(s.monthsComputed).toBe(12)
    expect(s.totalMinor / 100).toBe(1800)
  })

  it('previous-year mode at Rs 960,000/yr → Rs 80,000/month → Rs 2,160/month', () => {
    const s = computeCsgSchedule('2026-07-01', 'previous_year', {}, toMinorUnits(960_000), '2026-07')
    expect(s.months[0]?.csgMinor).toBe(216_000)
    expect(s.totalMinor / 100).toBe(25_920)
  })
})
