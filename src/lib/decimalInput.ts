/**
 * Keystroke-level cleanup for numeric text inputs (NumberInput). Runs on every change event so a
 * field can never hold a string the money helpers can't parse: a stray letter typed into a
 * unit price used to reach toMinorUnits() during render, throw, and take the whole invoice/quote
 * editor down with it (losing everything typed so far).
 *
 * - accepts the French decimal comma ("12,50" → "12.50") and ignores whitespace used as a
 *   thousands separator ("1 000" → "1000"); the regex \s also covers the NBSP / narrow NBSP that
 *   fr-FR number formatting emits, so a pasted formatted amount works too
 * - keeps only digits and the first decimal separator; everything else is dropped
 * - caps the number of decimals (2 by default, matching numeric(14,2) / numeric(12,2))
 * - no minus sign: no field in the app takes a negative amount (credit notes are their own flow)
 */
export interface SanitizedDecimal {
  value: string
  /** true when characters had to be dropped (not counting comma→dot / whitespace normalisation) */
  rejected: boolean
}

export function sanitizeDecimalInput(raw: string, decimals = 2): SanitizedDecimal {
  const normalised = raw.replace(/\s/g, '').replace(/,/g, '.')
  let out = ''
  let seenSeparator = false
  let decimalsSoFar = 0
  let rejected = false

  for (const char of normalised) {
    if (char >= '0' && char <= '9') {
      if (seenSeparator) {
        if (decimalsSoFar >= decimals) {
          rejected = true
          continue
        }
        decimalsSoFar++
      }
      out += char
    } else if (char === '.' && !seenSeparator && decimals > 0) {
      seenSeparator = true
      out += char
    } else {
      rejected = true
    }
  }

  return { value: out, rejected }
}

/** Lenient parse for values that may still be mid-typing ("", ".", "12."). Never NaN. */
export function parseDecimal(value: string | null | undefined): number {
  const parsed = Number.parseFloat(sanitizeDecimalInput(value ?? '', 20).value)
  return Number.isFinite(parsed) ? parsed : 0
}
