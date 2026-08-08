import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, ArrowRightCircle, Download, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge, type SemanticState } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { toMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useBusinessIdentity, getLogoDataUrl } from '@/features/parametres/api'
import { useBankAccounts } from '@/features/reference/api'
import type { PdfParty, PdfBankAccount } from '@/lib/pdf/generateDocumentPdf'
import { useQuote, useAcceptQuote, useRefuseQuote, useConvertQuoteToInvoice, useUpdateQuoteMutableFields } from './api'
import { QuoteEditorPage } from './QuoteEditorPage'

const STATUS_LABELS: Record<string, { label: string; state: SemanticState }> = {
  draft: { label: 'Brouillon', state: 'neutral' },
  sent: { label: 'Envoyé', state: 'pending' },
  accepted: { label: 'Accepté', state: 'paid' },
  refused: { label: 'Refusé', state: 'overdue' },
  expired: { label: 'Expiré', state: 'neutral' },
}

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { push } = useToast()
  const { data: quote, isLoading } = useQuote(id)
  const { data: businessIdentity } = useBusinessIdentity()
  const { data: bankAccounts = [] } = useBankAccounts()
  const acceptQuote = useAcceptQuote()
  const refuseQuote = useRefuseQuote()
  const convertToInvoice = useConvertQuoteToInvoice()
  const updateMutableFields = useUpdateQuoteMutableFields()
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [acceptanceNote, setAcceptanceNote] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editValidUntil, setEditValidUntil] = useState('')
  const [editNotes, setEditNotes] = useState('')

  if (isLoading || !quote) return <Skeleton className="h-96 w-full" />

  if (quote.status === 'draft') return <QuoteEditorPage />

  const statusInfo = STATUS_LABELS[quote.status] ?? STATUS_LABELS.draft!
  const totalMinor = toMinorUnits(String(quote.total))

  const handleOpenEdit = () => {
    setEditValidUntil(quote.valid_until ?? '')
    setEditNotes(quote.notes ?? '')
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    try {
      await updateMutableFields.mutateAsync({ id: quote.id, valid_until: editValidUntil || null, notes: editNotes || null })
      setEditOpen(false)
      push('success', 'Devis mis à jour')
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  const handleConvert = async () => {
    try {
      const { invoiceId } = await convertToInvoice.mutateAsync(quote)
      push('success', 'Devis converti en facture (brouillon)')
      navigate(`/factures/${invoiceId}`)
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  const handleDownloadPdf = async () => {
    if (!businessIdentity) {
      push('error', "Complète d'abord l'identité de l'entreprise dans Paramètres avant d'exporter un PDF.")
      return
    }
    const issuerParty: PdfParty = {
      name: businessIdentity.name,
      identifierLabel: businessIdentity.identifier_type,
      identifierValue: businessIdentity.identifier_value,
      email: businessIdentity.email,
      phone: businessIdentity.phone,
      addressLines: [businessIdentity.address_line1, businessIdentity.address_line2, [businessIdentity.postal_code, businessIdentity.city].filter(Boolean).join(' ')],
    }
    const client = quote.client_snapshot as { name?: string; email?: string; address?: string; identifier_label?: string; identifier_value?: string }
    const bankAccount = bankAccounts.find((a) => a.id === quote.bank_account_id)
    const pdfBank: PdfBankAccount | null = bankAccount
      ? {
          bankName: bankAccount.bank_name,
          bankAddress: bankAccount.bank_address,
          beneficiary: bankAccount.beneficiary,
          accountNumber: bankAccount.account_number,
          iban: bankAccount.iban,
          bicSwift: bankAccount.bic_swift,
          paypalAlias: bankAccount.paypal_alias,
        }
      : null

    let logoDataUrl: string | null = null
    if (businessIdentity.logo_path) {
      try {
        logoDataUrl = await getLogoDataUrl(businessIdentity.logo_path)
      } catch {
        // Best-effort: a broken/expired signed URL shouldn't block the PDF itself.
      }
    }

    const { downloadDocumentPdf } = await import('@/lib/pdf/generateDocumentPdf')
    downloadDocumentPdf({
      documentTypeLabel: 'DEVIS',
      logoDataUrl,
      number: quote.number ?? 'BROUILLON',
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      issuer: issuerParty,
      client: {
        name: client.name ?? 'Client',
        email: client.email,
        addressLines: [client.address],
        identifierLabel: client.identifier_label,
        identifierValue: client.identifier_value,
      },
      lines: quote.quote_lines.map((l) => ({ title: l.title, description: l.description, quantity: l.quantity, unitPrice: l.unit_price, lineTotal: l.line_total })),
      currency: quote.currency,
      subtotal: quote.subtotal,
      taxRate: quote.tax_rate,
      taxAmount: quote.tax_amount,
      total: quote.total,
      fxRateToMur: quote.fx_rate_to_mur,
      fxRateDate: quote.fx_rate_date,
      fxSource: quote.fx_source,
      countryMention: quote.country_mention,
      supplyTreatment: quote.supply_treatment,
      paymentTerms: quote.payment_terms,
      bankAccount: pdfBank,
      notes: quote.notes,
      legalMentions: businessIdentity.legal_mentions,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/devis')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{quote.number}</h1>
              <Badge state={statusInfo.state} label={statusInfo.label} />
            </div>
            <p className="text-sm text-slate">{(quote.client_snapshot as { name?: string })?.name}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate">
              <span>
                Émis le <DateDisplay date={quote.issue_date} />
              </span>
              <span>
                Valide jusqu'au {quote.valid_until ? <DateDisplay date={quote.valid_until} /> : '—'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quote.status === 'sent' && (
            <>
              <Button variant="secondary" onClick={() => setAcceptOpen(true)}>
                <CheckCircle2 className="h-4 w-4" />
                Accepter
              </Button>
              <Button variant="secondary" onClick={() => refuseQuote.mutate(quote.id)}>
                <XCircle className="h-4 w-4" />
                Refuser
              </Button>
            </>
          )}
          {quote.status === 'accepted' && !quote.converted_invoice_id && (
            <Button onClick={handleConvert} disabled={convertToInvoice.isPending}>
              <ArrowRightCircle className="h-4 w-4" />
              Convertir en facture
            </Button>
          )}
          {quote.converted_invoice_id && (
            <Button variant="secondary" onClick={() => navigate(`/factures/${quote.converted_invoice_id}`)}>
              Voir la facture
            </Button>
          )}
          <Button variant="secondary" onClick={handleOpenEdit}>
            <Pencil className="h-4 w-4" />
            Modifier
          </Button>
          <Button variant="secondary" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4" />
            Télécharger PDF
          </Button>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Lignes de prestation</h2>

        {/* Mobile: card list — a 4-column table has no room to breathe under 640px. */}
        <ul className="flex flex-col gap-3 sm:hidden">
          {quote.quote_lines.map((line) => (
            <li key={line.id} className="border-b border-border pb-3 last:border-0">
              <p className="text-ink">{line.title}</p>
              {line.description && <p className="text-xs text-slate">{line.description}</p>}
              <div className="mt-1 flex items-center justify-between text-sm text-slate">
                <span>
                  {line.quantity} × <CurrencyDisplay amount={toMinorUnits(String(line.unit_price))} currency={quote.currency} />
                </span>
                <span className="tabular-nums font-medium text-ink">
                  <CurrencyDisplay amount={toMinorUnits(String(line.line_total))} currency={quote.currency} />
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Tablet+: table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-slate">
                <th className="pb-2">Titre</th>
                <th className="pb-2 text-right">Qté</th>
                <th className="pb-2 text-right">P.U.</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.quote_lines.map((line) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="py-2">
                    <p className="text-ink">{line.title}</p>
                    {line.description && <p className="text-xs text-slate">{line.description}</p>}
                  </td>
                  <td className="tabular-nums py-2 text-right">{line.quantity}</td>
                  <td className="tabular-nums py-2 text-right">
                    <CurrencyDisplay amount={toMinorUnits(String(line.unit_price))} currency={quote.currency} />
                  </td>
                  <td className="tabular-nums py-2 text-right">
                    <CurrencyDisplay amount={toMinorUnits(String(line.line_total))} currency={quote.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <p>
            Sous-total: <CurrencyDisplay amount={toMinorUnits(String(quote.subtotal))} currency={quote.currency} />
          </p>
          <p>
            Taxe ({quote.tax_rate}%): <CurrencyDisplay amount={toMinorUnits(String(quote.tax_amount))} currency={quote.currency} />
          </p>
          <p className="text-base font-semibold text-ink">
            Total: <CurrencyDisplay amount={totalMinor} currency={quote.currency} />
          </p>
        </div>

        {quote.country_mention && (
          <p className="mt-4 rounded-lg bg-canvas p-3 text-xs text-slate">{quote.country_mention}</p>
        )}
        {quote.currency !== 'MUR' && (
          <p className="mt-2 text-xs text-slate">
            1 {quote.currency} = {quote.fx_rate_to_mur} Rs au <DateDisplay date={quote.fx_rate_date ?? quote.issue_date} /> (
            {quote.fx_source})
          </p>
        )}
        {quote.notes && (
          <div className="mt-4">
            <h3 className="mb-1 text-sm font-semibold text-slate">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-ink">{quote.notes}</p>
          </div>
        )}
        {quote.acceptance_note && (
          <p className="mt-4 rounded-lg bg-blue-pale p-3 text-sm text-blue">Note d'acceptation : {quote.acceptance_note}</p>
        )}
      </Card>

      <Modal
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title="Accepter le devis"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAcceptOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={async () => {
                await acceptQuote.mutateAsync({ id: quote.id, acceptanceNote })
                setAcceptOpen(false)
                push('success', 'Devis marqué comme accepté')
              }}
            >
              Confirmer l'acceptation
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-sm font-medium text-slate">Note / référence bon de commande (optionnel)</label>
        <Textarea rows={3} value={acceptanceNote} onChange={(e) => setAcceptanceNote(e.target.value)} />
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifier le devis"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutableFields.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate">
            Un devis envoyé est verrouillé : seuls la validité et les notes restent modifiables.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Valide jusqu'au</label>
            <DatePicker value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Notes</label>
            <Textarea rows={4} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
