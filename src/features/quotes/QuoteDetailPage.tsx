import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, ArrowRightCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge, type SemanticState } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { toMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useQuote, useAcceptQuote, useRefuseQuote, useConvertQuoteToInvoice } from './api'
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
  const acceptQuote = useAcceptQuote()
  const refuseQuote = useRefuseQuote()
  const convertToInvoice = useConvertQuoteToInvoice()
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [acceptanceNote, setAcceptanceNote] = useState('')

  if (isLoading || !quote) return <Skeleton className="h-96 w-full" />

  if (quote.status === 'draft') return <QuoteEditorPage />

  const statusInfo = STATUS_LABELS[quote.status] ?? STATUS_LABELS.draft!
  const totalMinor = toMinorUnits(String(quote.total))

  const handleConvert = async () => {
    try {
      const { invoiceId } = await convertToInvoice.mutateAsync(quote)
      push('success', 'Devis converti en facture (brouillon)')
      navigate(`/factures/${invoiceId}`)
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
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
            <p className="text-sm text-slate">
              {(quote.client_snapshot as { name?: string })?.name} — <DateDisplay date={quote.issue_date} />
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
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Lignes de prestation</h2>
        <table className="w-full text-sm">
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
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <p className="text-base font-semibold text-ink">
            Total: <CurrencyDisplay amount={totalMinor} currency={quote.currency} />
          </p>
        </div>
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
    </div>
  )
}
