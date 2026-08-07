/**
 * Money is never handled as floating point. Every amount is stored and passed
 * around as an integer number of minor units (cents), matching Postgres numeric(14,2).
 * Conversion to/from display strings happens only at the UI boundary.
 */

export type MinorUnits = number & { readonly __brand: 'MinorUnits' }

const CENTS_PER_UNIT = 100

export function toMinorUnits(amount: string | number): MinorUnits {
  const asString = typeof amount === 'number' ? amount.toFixed(2) : amount.trim()
  const negative = asString.startsWith('-')
  const [wholeRaw = '', fracRaw = ''] = asString.replace('-', '').split('.')
  const whole = wholeRaw === '' ? 0 : Number.parseInt(wholeRaw, 10)
  const frac = Number.parseInt((fracRaw + '00').slice(0, 2), 10)
  if (Number.isNaN(whole) || Number.isNaN(frac)) {
    throw new Error(`Invalid money string: "${amount}"`)
  }
  const value = whole * CENTS_PER_UNIT + frac
  return (negative ? -value : value) as MinorUnits
}

export function fromMinorUnits(minor: MinorUnits | number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const whole = Math.trunc(abs / CENTS_PER_UNIT)
  const frac = abs % CENTS_PER_UNIT
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`
}

export function addMoney(a: MinorUnits, b: MinorUnits): MinorUnits {
  return (a + b) as MinorUnits
}

export function subMoney(a: MinorUnits, b: MinorUnits): MinorUnits {
  return (a - b) as MinorUnits
}

/**
 * Multiplies a minor-units amount by a decimal factor (e.g. a tax rate as 0.15,
 * or an FX rate), rounding half-up to the nearest cent — never banker's rounding,
 * to match standard accounting convention.
 */
export function mulMoney(minor: MinorUnits, factor: number): MinorUnits {
  const result = minor * factor
  return roundHalfUp(result) as MinorUnits
}

export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5)
}

export function sumMoney(amounts: MinorUnits[]): MinorUnits {
  return amounts.reduce((acc, v) => addMoney(acc, v), 0 as MinorUnits)
}

export function isZero(minor: MinorUnits): boolean {
  return minor === 0
}

export function compareMoney(a: MinorUnits, b: MinorUnits): -1 | 0 | 1 {
  if (a === b) return 0
  return a < b ? -1 : 1
}
