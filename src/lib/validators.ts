/**
 * Identifier/IBAN/BIC validators (spec §14). Local format/checksum checks only — no online
 * existence lookups. A failed check is always advisory: callers must let the user save
 * regardless (these are third-party-issued numbers we can't authoritatively verify).
 */

export interface ValidationResult {
  valid: boolean
  message?: string
}

function ok(): ValidationResult {
  return { valid: true }
}

function fail(message: string): ValidationResult {
  return { valid: false, message }
}

function luhnValid(digits: string): boolean {
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number.parseInt(digits[i]!, 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/** SIREN (FR): 9 digits, valid Luhn. */
export function validateSiren(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '')
  if (!/^\d{9}$/.test(digits)) return fail('Le SIREN doit contenir exactement 9 chiffres.')
  if (!luhnValid(digits)) return fail('Le SIREN ne respecte pas la clé de contrôle (Luhn).')
  return ok()
}

const LA_POSTE_SIREN = '356000000'

/** SIRET (FR): 14 digits (SIREN + 5-digit NIC), valid Luhn, and its SIREN valid.
 * La Poste (SIREN 356000000) uses digit-sum-multiple-of-5 instead of Luhn. */
export function validateSiret(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '')
  if (!/^\d{14}$/.test(digits)) return fail('Le SIRET doit contenir exactement 14 chiffres.')

  const siren = digits.slice(0, 9)
  const sirenCheck = validateSiren(siren)
  if (!sirenCheck.valid) return fail('Le SIREN contenu dans le SIRET est invalide.')

  if (siren === LA_POSTE_SIREN) {
    const digitSum = digits.split('').reduce((sum, d) => sum + Number.parseInt(d, 10), 0)
    if (digitSum % 5 !== 0) return fail('SIRET La Poste invalide (somme des chiffres non multiple de 5).')
    return ok()
  }

  if (!luhnValid(digits)) return fail('Le SIRET ne respecte pas la clé de contrôle (Luhn).')
  return ok()
}

/** TVA intracommunautaire FR: FR + 2-char key + 9-digit SIREN. Key = (12 + 3*(SIREN mod 97)) mod 97. */
export function validateTvaIntracomFr(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  const match = /^FR([0-9A-Z]{2})(\d{9})$/.exec(cleaned)
  if (!match) return fail('Format attendu : FR + 2 caractères + 9 chiffres (SIREN).')
  const [, key, siren] = match as unknown as [string, string, string]

  if (!/^\d{2}$/.test(key)) {
    // Letter-containing keys are valid for certain SIRENs but not independently verifiable here.
    return ok()
  }
  const expectedKey = (12 + 3 * (Number.parseInt(siren, 10) % 97)) % 97
  if (Number.parseInt(key, 10) !== expectedKey) {
    return fail('La clé de contrôle ne correspond pas au SIREN fourni.')
  }
  return ok()
}

/** TVA intracommunautaire BE: BE + 10 digits (leading 0 or 1). */
export function validateTvaIntracomBe(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  if (!/^BE[01]\d{9}$/.test(cleaned)) {
    return fail('Format attendu : BE + 10 chiffres (commençant par 0 ou 1).')
  }
  return ok()
}

/** UID/TVA CH: CHE-XXX.XXX.XXX with an optional MWST/TVA/IVA suffix, MOD11 check digit.
 * Only the MWST/TVA/IVA suffix means the entity is actually VAT-registered. */
export function validateUidCh(value: string): ValidationResult {
  const cleaned = value.trim().toUpperCase()
  const match = /^CHE-?(\d{3})\.?(\d{3})\.?(\d{3})(\s?(MWST|TVA|IVA))?$/.exec(cleaned)
  if (!match) return fail('Format attendu : CHE-XXX.XXX.XXX, avec suffixe MWST/TVA/IVA optionnel.')

  const digits = `${match[1]}${match[2]}${match[3]}`
  const weights = [5, 4, 3, 2, 7, 6, 5, 4]
  const sum = digits
    .slice(0, 8)
    .split('')
    .reduce((acc, d, i) => acc + Number.parseInt(d, 10) * weights[i]!, 0)
  const remainder = 11 - (sum % 11)
  const expectedCheckDigit = remainder === 11 ? 0 : remainder === 10 ? null : remainder
  const actualCheckDigit = Number.parseInt(digits[8]!, 10)

  if (expectedCheckDigit === null || expectedCheckDigit !== actualCheckDigit) {
    return fail('Le chiffre de contrôle CHE (MOD11) est invalide.')
  }
  return ok()
}

/** TRN (AE): 15 digits, starts with 100. */
export function validateTrnAe(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '')
  if (!/^100\d{12}$/.test(digits)) return fail('Format attendu : 15 chiffres commençant par 100.')
  return ok()
}

/** GST/HST Business Number (CA): 9 digits + RT + 4 digits. */
export function validateGstHstCa(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  if (!/^\d{9}RT\d{4}$/.test(cleaned)) return fail('Format attendu : 9 chiffres + RT + 4 chiffres.')
  return ok()
}

/** QST (CA, Québec): 10 digits + TQ + 4 digits. */
export function validateQstCa(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  if (!/^\d{10}TQ\d{4}$/.test(cleaned)) return fail('Format attendu : 10 chiffres + TQ + 4 chiffres.')
  return ok()
}

/** VAT (ZA): 4 followed by 9 digits. */
export function validateVatZa(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '')
  if (!/^4\d{9}$/.test(digits)) return fail('Format attendu : 10 chiffres commençant par 4.')
  return ok()
}

/** SARS tax reference (ZA): first digit 0-3 or 9, then 9 digits. */
export function validateSarsZa(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '')
  if (!/^[0-39]\d{9}$/.test(digits)) return fail('Format attendu : 10 chiffres, premier chiffre 0-3 ou 9.')
  return ok()
}

/** CIPC company registration number (ZA): YYYY/NNNNNN/NN. */
export function validateCrnZa(value: string): ValidationResult {
  const cleaned = value.trim()
  if (!/^\d{4}\/\d{6}\/\d{2}$/.test(cleaned)) return fail('Format attendu : AAAA/NNNNNN/NN.')
  return ok()
}

/** BRN (MU): alphanumeric, first letter I (individual) / C (company) / P (partnership).
 * No public checksum exists — format check only, always advisory. */
export function validateBrnMu(value: string): ValidationResult {
  const cleaned = value.trim().toUpperCase()
  if (!/^[ICP][A-Z0-9]{5,}$/.test(cleaned)) {
    return fail('Le BRN doit commencer par I (individuel), C (société) ou P (partenariat).')
  }
  return ok()
}

/** Generic fallback for countries with no specific identifier rule modelled yet. */
export function validateBusinessId(value: string): ValidationResult {
  if (value.trim().length === 0) return fail("Identifiant requis.")
  return ok()
}

/** IBAN: MOD-97 check per ISO 7064. */
export function validateIban(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) {
    return fail('Format IBAN invalide (2 lettres pays + 2 chiffres de contrôle + BBAN).')
  }
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55))

  // mod 97 over a very large numeric string, computed in chunks to stay within safe integers.
  let remainder = 0
  for (const chunk of numeric.match(/.{1,7}/g) ?? []) {
    remainder = Number.parseInt(`${remainder}${chunk}`, 10) % 97
  }

  if (remainder !== 1) return fail("L'IBAN ne respecte pas la clé de contrôle (MOD-97).")
  return ok()
}

/** BIC/SWIFT: 8 or 11 characters, standard structure. */
export function validateBic(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned)) {
    return fail('Format BIC/SWIFT invalide (8 ou 11 caractères).')
  }
  return ok()
}

export type IdentifierTypeValue =
  | 'BRN'
  | 'SIRET'
  | 'SIREN'
  | 'TVA_INTRACOM_FR'
  | 'TVA_INTRACOM_BE'
  | 'UID_CH'
  | 'TRN_AE'
  | 'GST_HST_CA'
  | 'QST_CA'
  | 'VAT_ZA'
  | 'SARS_ZA'
  | 'CRN_ZA'
  | 'BUSINESS_ID'

const VALIDATORS_BY_IDENTIFIER_TYPE: Record<IdentifierTypeValue, (value: string) => ValidationResult> = {
  BRN: validateBrnMu,
  SIRET: validateSiret,
  SIREN: validateSiren,
  TVA_INTRACOM_FR: validateTvaIntracomFr,
  TVA_INTRACOM_BE: validateTvaIntracomBe,
  UID_CH: validateUidCh,
  TRN_AE: validateTrnAe,
  GST_HST_CA: validateGstHstCa,
  QST_CA: validateQstCa,
  VAT_ZA: validateVatZa,
  SARS_ZA: validateSarsZa,
  CRN_ZA: validateCrnZa,
  BUSINESS_ID: validateBusinessId,
}

export function validateIdentifier(type: IdentifierTypeValue, value: string): ValidationResult {
  if (!value || value.trim().length === 0) return ok() // identifier is optional at draft time
  return VALIDATORS_BY_IDENTIFIER_TYPE[type](value)
}
