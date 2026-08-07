import { describe, expect, it } from 'vitest'
import {
  validateBic,
  validateBrnMu,
  validateBusinessId,
  validateCrnZa,
  validateGstHstCa,
  validateIban,
  validateIdentifier,
  validateQstCa,
  validateSarsZa,
  validateSiren,
  validateSiret,
  validateTrnAe,
  validateTvaIntracomBe,
  validateTvaIntracomFr,
  validateUidCh,
  validateVatZa,
} from './validators'

describe('validateSiren', () => {
  it('accepts a Luhn-valid 9-digit SIREN', () => {
    expect(validateSiren('100000009').valid).toBe(true)
  })

  it('rejects a Luhn-invalid SIREN', () => {
    expect(validateSiren('100000000').valid).toBe(false)
  })

  it('rejects the wrong length', () => {
    expect(validateSiren('12345').valid).toBe(false)
  })
})

describe('validateSiret', () => {
  it('accepts a Luhn-valid 14-digit SIRET with a valid embedded SIREN', () => {
    expect(validateSiret('10000000900009').valid).toBe(true)
  })

  it('rejects a Luhn-invalid SIRET', () => {
    expect(validateSiret('10000000900008').valid).toBe(false)
  })

  it('applies the La Poste digit-sum rule for SIREN 356000000 instead of Luhn', () => {
    expect(validateSiret('35600000000001').valid).toBe(true)
  })

  it('rejects the wrong length', () => {
    expect(validateSiret('123').valid).toBe(false)
  })
})

describe('validateTvaIntracomFr', () => {
  it('accepts a key correctly derived from the SIREN', () => {
    expect(validateTvaIntracomFr('FR88100000009').valid).toBe(true)
  })

  it('rejects an incorrect key', () => {
    expect(validateTvaIntracomFr('FR87100000009').valid).toBe(false)
  })

  it('rejects a malformed value', () => {
    expect(validateTvaIntracomFr('FR8100000009').valid).toBe(false)
  })
})

describe('validateTvaIntracomBe', () => {
  it('accepts BE + 10 digits starting with 0 or 1', () => {
    expect(validateTvaIntracomBe('BE0123456789').valid).toBe(true)
    expect(validateTvaIntracomBe('BE1123456789').valid).toBe(true)
  })

  it('rejects a leading digit other than 0 or 1', () => {
    expect(validateTvaIntracomBe('BE2123456789').valid).toBe(false)
  })
})

describe('validateUidCh', () => {
  it('accepts a MOD11-valid UID with dots', () => {
    expect(validateUidCh('CHE-100.000.006').valid).toBe(true)
  })

  it('accepts the same UID with an MWST suffix', () => {
    expect(validateUidCh('CHE-100.000.006 MWST').valid).toBe(true)
  })

  it('rejects a wrong check digit', () => {
    expect(validateUidCh('CHE-100.000.007').valid).toBe(false)
  })
})

describe('validateTrnAe', () => {
  it('accepts 15 digits starting with 100', () => {
    expect(validateTrnAe('100123456789012').valid).toBe(true)
  })

  it('rejects a value not starting with 100', () => {
    expect(validateTrnAe('200123456789012').valid).toBe(false)
  })
})

describe('validateGstHstCa / validateQstCa', () => {
  it('accepts the GST/HST BN shape', () => {
    expect(validateGstHstCa('123456789RT0001').valid).toBe(true)
  })

  it('accepts the QST shape', () => {
    expect(validateQstCa('1234567890TQ0001').valid).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(validateGstHstCa('123456789RT001').valid).toBe(false)
    expect(validateQstCa('123456789TQ0001').valid).toBe(false)
  })
})

describe('validateVatZa / validateSarsZa / validateCrnZa', () => {
  it('accepts a VAT number starting with 4', () => {
    expect(validateVatZa('4123456789').valid).toBe(true)
  })

  it('rejects a VAT number not starting with 4', () => {
    expect(validateVatZa('5123456789').valid).toBe(false)
  })

  it('accepts SARS tax refs starting with 0-3 or 9', () => {
    expect(validateSarsZa('0123456789').valid).toBe(true)
    expect(validateSarsZa('9123456789').valid).toBe(true)
  })

  it('rejects SARS tax refs starting with 4-8', () => {
    expect(validateSarsZa('5123456789').valid).toBe(false)
  })

  it('accepts the CIPC CRN shape', () => {
    expect(validateCrnZa('2019/123456/07').valid).toBe(true)
  })
})

describe('validateBrnMu', () => {
  it('accepts I/C/P prefixes', () => {
    expect(validateBrnMu('I24007518').valid).toBe(true)
    expect(validateBrnMu('C24007518').valid).toBe(true)
    expect(validateBrnMu('P24007518').valid).toBe(true)
  })

  it('accepts a purely numeric BRN with no letter prefix (real-world variant)', () => {
    expect(validateBrnMu('122007720').valid).toBe(true)
  })

  it('rejects an unrecognised prefix', () => {
    expect(validateBrnMu('X24007518').valid).toBe(false)
  })
})

describe('validateBusinessId', () => {
  it('accepts any non-empty value as the generic fallback', () => {
    expect(validateBusinessId('ANYTHING-123').valid).toBe(true)
  })

  it('rejects an empty value', () => {
    expect(validateBusinessId('').valid).toBe(false)
  })
})

describe('validateIban', () => {
  it('accepts a well-known valid test IBAN (GB)', () => {
    expect(validateIban('GB82 WEST 1234 5698 7654 32').valid).toBe(true)
  })

  it('accepts a well-known valid test IBAN (FR)', () => {
    expect(validateIban('FR76 3000 6000 0112 3456 7890 189').valid).toBe(true)
  })

  it('accepts GR AdLab\'s real MCB IBAN, including the trailing currency segment', () => {
    expect(validateIban('MU47 MCBL 0901 0004 5294 0982 000 EUR').valid).toBe(true)
  })

  it('rejects a corrupted IBAN', () => {
    expect(validateIban('GB82 WEST 1234 5698 7654 33').valid).toBe(false)
  })
})

describe('validateBic', () => {
  it('accepts an 8-character BIC', () => {
    expect(validateBic('MCBLMUMU').valid).toBe(true)
  })

  it("accepts GR AdLab's real 11-character BIC", () => {
    expect(validateBic('MCBLMUMUXXX').valid).toBe(true)
  })

  it('rejects an invalid length', () => {
    expect(validateBic('MCBLMU').valid).toBe(false)
  })
})

describe('validateIdentifier', () => {
  it('dispatches to the correct validator by identifier type', () => {
    expect(validateIdentifier('SIREN', '100000009').valid).toBe(true)
    expect(validateIdentifier('BRN', 'I24007518').valid).toBe(true)
    expect(validateIdentifier('VAT_ZA', '4123456789').valid).toBe(true)
  })

  it('treats an empty value as valid — optional at draft time, never blocks saving', () => {
    expect(validateIdentifier('SIREN', '').valid).toBe(true)
  })
})
