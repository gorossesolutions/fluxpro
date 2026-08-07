import { describe, expect, it } from 'vitest'
import { buildDocumentPdfDefinition, type DocumentPdfInput } from './generateDocumentPdf'
import { pdfMake } from './pdfSetup'

const baseInput: DocumentPdfInput = {
  documentTypeLabel: 'FACTURE',
  number: 'FAC-2026-001',
  issueDate: '2026-08-01',
  dueDate: '2026-08-31',
  issuer: {
    name: 'GR AdLab',
    identifierLabel: 'BRN',
    identifierValue: '122007720',
    email: 'guillaume@gradlab.mu',
    addressLines: ['Sir William Newton Street', 'Port Louis'],
  },
  client: {
    name: 'Acme Corp',
    identifierLabel: 'SIRET',
    identifierValue: '12345678900012',
    email: 'client@acme.fr',
    addressLines: ['1 Rue de la Paix', 'Paris'],
  },
  lines: [
    { title: 'Gestion de campagnes', description: 'Août 2026', quantity: 1, unitPrice: 1500, lineTotal: 1500 },
    { title: 'Audit SEO', quantity: 2, unitPrice: 250, lineTotal: 500 },
  ],
  currency: 'EUR',
  subtotal: 2000,
  taxRate: 0,
  taxAmount: 0,
  total: 2000,
  fxRateToMur: 52.5,
  fxRateDate: '2026-08-01',
  fxSource: 'manual',
  countryMention: 'Autoliquidation — TVA due par le preneur (Article 283-2 du CGI)',
  supplyTreatment: 'zero_rated_export',
  paymentTerms: 30,
  bankAccount: {
    bankName: 'MCB',
    beneficiary: 'GR AdLab',
    accountNumber: '000123456789',
    iban: 'MU17BOMM0101101030300200000MUR',
    bicSwift: 'MCBLMUMU',
  },
  legalMentions: 'GR AdLab — Entreprise individuelle immatriculée à Maurice.',
}

describe('buildDocumentPdfDefinition', () => {
  it('builds a definition without throwing for a full invoice', () => {
    expect(() => buildDocumentPdfDefinition(baseInput)).not.toThrow()
  })

  it('renders to actual PDF bytes starting with the %PDF header', async () => {
    const definition = buildDocumentPdfDefinition(baseInput)
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      try {
        pdfMake.createPdf(definition).getBuffer((b: Buffer) => resolve(b))
      } catch (err) {
        reject(err as Error)
      }
    })
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('handles a minimal credit note with no bank account, FX, or mentions', () => {
    const definition = buildDocumentPdfDefinition({
      ...baseInput,
      documentTypeLabel: 'AVOIR',
      currency: 'MUR',
      fxRateToMur: null,
      bankAccount: null,
      countryMention: null,
      supplyTreatment: null,
      paymentTerms: null,
      legalMentions: null,
      reason: 'Erreur de facturation',
      parentDocumentNumber: 'FAC-2026-001',
    })
    expect(definition.content).toBeDefined()
  })

  it('handles a quote with a valid-until date and no due date', () => {
    const definition = buildDocumentPdfDefinition({ ...baseInput, documentTypeLabel: 'DEVIS', dueDate: null, validUntil: '2026-09-30' })
    expect(definition.content).toBeDefined()
  })
})
