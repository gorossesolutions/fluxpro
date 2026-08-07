import { describe, expect, it } from 'vitest'
import { addMoney, fromMinorUnits, mulMoney, roundHalfUp, subMoney, sumMoney, toMinorUnits } from './money'

describe('money', () => {
  it('parses decimal strings to minor units', () => {
    expect(toMinorUnits('1234.56')).toBe(123456)
    expect(toMinorUnits('0.05')).toBe(5)
    expect(toMinorUnits('-10.00')).toBe(-1000)
    expect(toMinorUnits('10')).toBe(1000)
  })

  it('formats minor units back to decimal strings', () => {
    expect(fromMinorUnits(123456)).toBe('1234.56')
    expect(fromMinorUnits(5)).toBe('0.05')
    expect(fromMinorUnits(-1000)).toBe('-10.00')
  })

  it('adds and subtracts without float drift', () => {
    const a = toMinorUnits('0.10')
    const b = toMinorUnits('0.20')
    expect(fromMinorUnits(addMoney(a, b))).toBe('0.30')
    expect(fromMinorUnits(subMoney(b, a))).toBe('0.10')
  })

  it('rounds half up, not banker\'s rounding', () => {
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-2.5)).toBe(-3)
    expect(roundHalfUp(0.5)).toBe(1)
  })

  it('applies a tax rate with half-up rounding to the cent', () => {
    const subtotal = toMinorUnits('10.00')
    expect(fromMinorUnits(mulMoney(subtotal, 0.15))).toBe('1.50')

    const oddSubtotal = toMinorUnits('10.01')
    // 10.01 * 0.15 = 1.5015 -> rounds to 1.50
    expect(fromMinorUnits(mulMoney(oddSubtotal, 0.15))).toBe('1.50')
  })

  it('sums a list of amounts', () => {
    const amounts = [toMinorUnits('1.10'), toMinorUnits('2.20'), toMinorUnits('3.30')]
    expect(fromMinorUnits(sumMoney(amounts))).toBe('6.60')
  })
})
