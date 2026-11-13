import { describe, expect, it } from 'vitest'
import { parseDecimal, sanitizeDecimalInput } from './decimalInput'

describe('sanitizeDecimalInput', () => {
  it('keeps a valid decimal untouched', () => {
    expect(sanitizeDecimalInput('1250.50')).toEqual({ value: '1250.50', rejected: false })
  })

  it('turns the French comma into a dot', () => {
    expect(sanitizeDecimalInput('12,5')).toEqual({ value: '12.5', rejected: false })
  })

  it('drops thousands-separator spaces, including NBSP / narrow NBSP from fr-FR formatting', () => {
    expect(sanitizeDecimalInput('1 000 000 ,25')).toEqual({ value: '1000000.25', rejected: false })
  })

  it('drops letters and flags the keystroke as rejected', () => {
    expect(sanitizeDecimalInput('12a')).toEqual({ value: '12', rejected: true })
    expect(sanitizeDecimalInput('abc')).toEqual({ value: '', rejected: true })
    expect(sanitizeDecimalInput('1e5')).toEqual({ value: '15', rejected: true })
  })

  it('keeps only the first decimal separator', () => {
    expect(sanitizeDecimalInput('1.2.3')).toEqual({ value: '1.23', rejected: true })
    expect(sanitizeDecimalInput('1,2.3', 3)).toEqual({ value: '1.23', rejected: true })
  })

  it('caps decimals', () => {
    expect(sanitizeDecimalInput('10.999')).toEqual({ value: '10.99', rejected: true })
    expect(sanitizeDecimalInput('52.123456', 6)).toEqual({ value: '52.123456', rejected: false })
  })

  it('allows integers only when decimals = 0', () => {
    expect(sanitizeDecimalInput('30.5', 0)).toEqual({ value: '305', rejected: true })
  })

  it('rejects the minus sign', () => {
    expect(sanitizeDecimalInput('-5')).toEqual({ value: '5', rejected: true })
  })

  it('keeps an in-progress value like "12." or "."', () => {
    expect(sanitizeDecimalInput('12.').value).toBe('12.')
    expect(sanitizeDecimalInput('.').value).toBe('.')
  })
})

describe('parseDecimal', () => {
  it('never returns NaN', () => {
    expect(parseDecimal('')).toBe(0)
    expect(parseDecimal('.')).toBe(0)
    expect(parseDecimal('abc')).toBe(0)
    expect(parseDecimal(null)).toBe(0)
  })

  it('parses comma decimals', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
  })
})
