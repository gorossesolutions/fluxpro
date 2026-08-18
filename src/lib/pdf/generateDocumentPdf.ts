import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { pdfMake } from './pdfSetup'
import { formatMoney } from '@/lib/format'
import { formatDate } from '@/lib/format'
import { toMinorUnits } from '@/lib/money'

/**
 * `Intl.NumberFormat('fr-FR')` (used by formatMoney, and by anything a user typed after
 * copy-pasting from a spreadsheet or Word) groups thousands with U+202F NARROW NO-BREAK SPACE,
 * not a plain space — invisible in a browser, but pdfmake's bundled Roboto subset has no glyph
 * for it, so it rendered as a visible tofu box ("Rs 70▯ 000,00") on a real generated PDF.
 * Same fix for U+00A0 NO-BREAK SPACE, which shows up wherever fr-FR formatting pairs a number
 * with a unit/currency symbol. Applied to every dynamic string that reaches pdfmake, not just
 * money, since free-text fields (notes, legal mentions, addresses) can carry the same
 * characters from pasted content.
 */
function pdfSafe(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, ' ')
}

/** Walks the whole pdfmake Content tree and applies pdfSafe to every string leaf — every
 * `text` value, at any depth, in one pass — rather than relying on each call site below to
 * remember to wrap its own strings, which is exactly the kind of thing that's easy to miss
 * one of. Functions (the table `layout` callbacks) and non-string primitives pass through
 * untouched. */
function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') return pdfSafe(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeDeep(v)
    }
    return result as T
  }
  return value
}

export interface PdfParty {
  name: string
  identifierLabel?: string
  identifierValue?: string | null
  email?: string | null
  phone?: string | null
  addressLines?: (string | null | undefined)[]
}

export interface PdfLineItem {
  title: string
  description?: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface PdfBankAccount {
  bankName: string
  bankAddress?: string | null
  beneficiary: string
  accountNumber?: string | null
  iban?: string | null
  bicSwift?: string | null
  paypalAlias?: string | null
}

export interface DocumentPdfInput {
  /** e.g. 'FACTURE', 'DEVIS', 'AVOIR' — spec §3.6/§17: every mandatory mention has a field, no
   * hardcoded document-type string beyond this simple French label. */
  documentTypeLabel: string
  /** Data URL (data:image/png;base64,... or data:image/jpeg;...) — pdfmake needs the actual
   * image bytes inline, it cannot fetch a Supabase signed URL itself. Callers resolve the
   * business's logo_path to a signed URL and convert it before building this input. */
  logoDataUrl?: string | null
  number: string
  issueDate: string
  dueDate?: string | null
  validUntil?: string | null
  issuer: PdfParty
  client: PdfParty
  lines: PdfLineItem[]
  currency: string
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  fxRateToMur?: number | null
  fxRateDate?: string | null
  fxSource?: string | null
  countryMention?: string | null
  supplyTreatment?: 'domestic' | 'zero_rated_export' | null
  paymentTerms?: number | null
  bankAccount?: PdfBankAccount | null
  legalMentions?: string | null
  notes?: string | null
  /** Credit notes only. */
  reason?: string | null
  parentDocumentNumber?: string | null
}

function partyBlock(party: PdfParty): Content {
  const lines: string[] = [party.name]
  if (party.identifierLabel && party.identifierValue) {
    lines.push(`${party.identifierLabel} : ${party.identifierValue}`)
  }
  for (const line of party.addressLines ?? []) {
    if (line) lines.push(line)
  }
  if (party.email) lines.push(party.email)
  if (party.phone) lines.push(party.phone)
  return { stack: lines.map((text, i) => ({ text, style: i === 0 ? 'partyName' : 'partyDetail' })) }
}

/**
 * Builds the pdfmake document definition for an invoice, quote, or credit note. One shared
 * builder for all three document types (spec §17) — they carry the same mandatory mentions
 * (issuer/client identity, dates, line items, totals, currency, frozen FX rate + date, payment
 * terms, bank details, country mention, zero-rating, legal mentions — spec §3.6), just with a
 * different header label and a couple of type-specific fields (validUntil for quotes, reason
 * for credit notes).
 */
export function buildDocumentPdfDefinition(input: DocumentPdfInput): TDocumentDefinitions {
  const money = (amount: number) => formatMoney(toMinorUnits(amount.toFixed(2)), input.currency)

  const lineRow = (line: PdfLineItem): Content[] => [
    { text: [line.title, line.description ? `\n${line.description}` : ''].join(''), style: 'tableCell' },
    { text: String(line.quantity), style: 'tableCell', alignment: 'right' },
    { text: money(line.unitPrice), style: 'tableCell', alignment: 'right' },
    { text: money(line.lineTotal), style: 'tableCell', alignment: 'right' },
  ]

  const tableBody: Content[][] = [
    [
      { text: 'Description', style: 'tableHeader' },
      { text: 'Qté', style: 'tableHeader', alignment: 'right' },
      { text: 'P.U.', style: 'tableHeader', alignment: 'right' },
      { text: 'Total', style: 'tableHeader', alignment: 'right' },
    ],
    ...input.lines.map(lineRow),
  ]

  const bank = input.bankAccount
  const bankLines: string[] = []
  if (bank) {
    bankLines.push(bank.bankName)
    if (bank.bankAddress) bankLines.push(bank.bankAddress)
    bankLines.push(`Bénéficiaire : ${bank.beneficiary}`)
    if (bank.accountNumber) bankLines.push(`N° de compte : ${bank.accountNumber}`)
    if (bank.iban) bankLines.push(`IBAN : ${bank.iban}`)
    if (bank.bicSwift) bankLines.push(`BIC/SWIFT : ${bank.bicSwift}`)
    if (bank.paypalAlias) bankLines.push(`PayPal : ${bank.paypalAlias}`)
  }

  const content: Content[] = []

  if (input.logoDataUrl) {
    content.push({ image: input.logoDataUrl, fit: [140, 60], margin: [0, 0, 0, 12] })
  }

  content.push(
    {
      columns: [
        { text: input.documentTypeLabel, style: 'documentTitle', width: '*' },
        {
          width: 'auto',
          stack: [
            { text: input.number, style: 'documentNumber' },
            { text: `Date : ${formatDate(input.issueDate)}`, style: 'partyDetail' },
            input.dueDate ? { text: `Échéance : ${formatDate(input.dueDate)}`, style: 'partyDetail' } : null,
            input.validUntil ? { text: `Valide jusqu'au : ${formatDate(input.validUntil)}`, style: 'partyDetail' } : null,
          ].filter(Boolean) as Content[],
        },
      ],
      margin: [0, 0, 0, 24],
    },
    {
      columns: [
        { width: '*', stack: [{ text: 'Émetteur', style: 'sectionLabel' }, partyBlock(input.issuer)] },
        { width: '*', stack: [{ text: 'Client', style: 'sectionLabel' }, partyBlock(input.client)] },
      ],
      margin: [0, 0, 0, 24],
    },
  )

  if (input.parentDocumentNumber || input.reason) {
    content.push({
      stack: [
        input.parentDocumentNumber ? { text: `Se rapporte à : ${input.parentDocumentNumber}`, style: 'partyDetail' } : null,
        input.reason ? { text: `Motif : ${input.reason}`, style: 'partyDetail' } : null,
      ].filter(Boolean) as Content[],
      margin: [0, 0, 0, 12],
    })
  }

  content.push({
    table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: tableBody },
    layout: {
      hLineWidth: (i: number, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
      hLineColor: () => '#d1dae5',
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 12],
  })

  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 220,
        stack: [
          { columns: [{ text: 'Sous-total', style: 'totalsLabel' }, { text: money(input.subtotal), style: 'totalsValue', alignment: 'right' }] },
          {
            columns: [
              { text: `Taxe (${input.taxRate}%)`, style: 'totalsLabel' },
              { text: money(input.taxAmount), style: 'totalsValue', alignment: 'right' },
            ],
          },
          {
            columns: [
              { text: 'Total', style: 'totalsLabelBold' },
              { text: money(input.total), style: 'totalsValueBold', alignment: 'right' },
            ],
            margin: [0, 4, 0, 0],
          },
        ],
      },
    ],
    margin: [0, 0, 0, 16],
  })

  if (input.currency !== 'MUR' && input.fxRateToMur) {
    content.push({
      text: `1 ${input.currency} = ${input.fxRateToMur} MUR au ${formatDate(input.fxRateDate ?? input.issueDate)} (taux figé à l'émission — source : ${input.fxSource ?? 'n/a'})`,
      style: 'fxNote',
      margin: [0, 0, 0, 12],
    })
  }

  if (input.supplyTreatment === 'zero_rated_export') {
    content.push({ text: 'Zero-rated supply', style: 'mention', margin: [0, 0, 0, 4] })
  }
  if (input.countryMention) {
    content.push({ text: input.countryMention, style: 'mention', margin: [0, 0, 0, 12] })
  }

  if (input.paymentTerms != null || bankLines.length > 0) {
    content.push({
      columns: [
        input.paymentTerms != null
          ? {
              width: '*',
              stack: [
                { text: 'Conditions de paiement', style: 'sectionLabel' },
                { text: input.paymentTerms === 0 ? 'À réception' : `${input.paymentTerms} jours`, style: 'partyDetail' },
              ],
            }
          : { width: '*', text: '' },
        bankLines.length > 0
          ? { width: '*', stack: [{ text: 'Coordonnées bancaires', style: 'sectionLabel' }, ...bankLines.map((l) => ({ text: l, style: 'partyDetail' }))] }
          : { width: '*', text: '' },
      ],
      margin: [0, 0, 0, 16],
    })
  }

  if (input.notes) {
    content.push({ text: input.notes, style: 'partyDetail', margin: [0, 0, 0, 12] })
  }
  if (input.legalMentions) {
    content.push({ text: input.legalMentions, style: 'legalMentions' })
  }

  return {
    content: sanitizeDeep(content),
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { fontSize: 9, color: '#070614' },
    styles: {
      documentTitle: { fontSize: 20, bold: true },
      documentNumber: { fontSize: 12, bold: true, alignment: 'right' },
      sectionLabel: { fontSize: 8, bold: true, color: '#364151', margin: [0, 0, 0, 4] },
      partyName: { fontSize: 10, bold: true },
      partyDetail: { fontSize: 9, color: '#364151', margin: [0, 1, 0, 0] },
      tableHeader: { fontSize: 8, bold: true, color: '#364151' },
      tableCell: { fontSize: 9 },
      totalsLabel: { fontSize: 9, color: '#364151' },
      totalsValue: { fontSize: 9 },
      totalsLabelBold: { fontSize: 11, bold: true },
      totalsValueBold: { fontSize: 11, bold: true },
      fxNote: { fontSize: 8, color: '#364151', italics: true },
      mention: { fontSize: 9, bold: true },
      legalMentions: { fontSize: 7, color: '#64748b', margin: [0, 16, 0, 0] },
    },
  }
}

export function downloadDocumentPdf(input: DocumentPdfInput): void {
  const definition = buildDocumentPdfDefinition(input)
  pdfMake.createPdf(definition).download(`${input.number}.pdf`)
}
