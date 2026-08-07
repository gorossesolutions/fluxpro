import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CreditCard, Copy, FileMinus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge, type SemanticState } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { useToast } from '@/components/ui/Toast'
import { subMoney, sumMoney, toMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useInvoice, useInvoicePayments, useSaveInvoiceDraft } from './api'
import { InvoiceEditorPage } from './InvoiceEditorPage'
import { PaymentModal } from './PaymentModal'
import { CreditNoteModal } from './CreditNoteModal'

const STATUS_LABELS: Record<string, { label: string; state: SemanticState }> = {
  draft: { label: 'Brouillon', state: 'neutral' },
  issued: { label: 'En attente', state: 'pending' },
  paid: { label: 'Payée', state: 'paid' },
  overdue: { label: 'En retard', state: 'overdue' },
  cancelled: { label: 'Annulée', state: 'neutral' },
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { push } = useToast()
  const { data: invoice, isLoading } = useInvoice(id)
  const { data: payments = [] } = useInvoicePayments(id)
  const saveDraft = useSaveInvoiceDraft()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [creditNoteOpen, setCreditNoteOpen] = useState(false)

  if (isLoading || !invoice) {
    return <Skeleton className="h-96 w-full" />
  }

  // Drafts are still fully editable via the editor.
  if (invoice.status === 'draft') {
    return <InvoiceEditorPage />
  }

  const totalMinor = toMinorUnits(String(invoice.total))
  const paidMinor = sumMoney(payments.map((p) => toMinorUnits(String(p.amount))))
  const outstandingMinor = subMoney(totalMinor, paidMinor)
  const statusInfo = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.draft!

  const handleMarkPaid = async () => {
    // "Marquer comme payée" quick action = a full payment for the outstanding balance.
    setPaymentOpen(true)
  }

  const handleDuplicate = async () => {
    try {
      const saved = await saveDraft.mutateAsync({
        invoice: {
          client_id: invoice.client_id,
          client_snapshot: invoice.client_snapshot,
          issue_date: new Date().toISOString().slice(0, 10),
          due_date: null,
          currency: invoice.currency,
          tax_rate: invoice.tax_rate,
          subtotal: invoice.subtotal,
          tax_amount: invoice.tax_amount,
          total: invoice.total,
          supply_treatment: invoice.supply_treatment,
          country_mention: invoice.country_mention,
          bank_account_id: invoice.bank_account_id,
          payment_terms: invoice.payment_terms,
          notes: invoice.notes,
        },
        lines: invoice.invoice_lines.map((l) => ({
          title: l.title,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
        })),
      })
      push('success', 'Facture dupliquée en brouillon')
      navigate(`/factures/${saved.id}`)
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/factures')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{invoice.number}</h1>
              <Badge state={statusInfo.state} label={statusInfo.label} />
            </div>
            <p className="text-sm text-slate">
              {(invoice.client_snapshot as { name?: string })?.name} — <DateDisplay date={invoice.issue_date} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <>
              <Button variant="secondary" onClick={handleMarkPaid}>
                <CheckCircle2 className="h-4 w-4" />
                Marquer comme payée
              </Button>
              <Button variant="secondary" onClick={() => setPaymentOpen(true)}>
                <CreditCard className="h-4 w-4" />
                Paiement partiel
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={handleDuplicate}>
            <Copy className="h-4 w-4" />
            Dupliquer
          </Button>
          <Button variant="secondary" onClick={() => setCreditNoteOpen(true)}>
            <FileMinus className="h-4 w-4" />
            Créer un avoir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
              {invoice.invoice_lines.map((line) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="py-2">
                    <p className="text-ink">{line.title}</p>
                    {line.description && <p className="text-xs text-slate">{line.description}</p>}
                  </td>
                  <td className="tabular-nums py-2 text-right">{line.quantity}</td>
                  <td className="tabular-nums py-2 text-right">
                    <CurrencyDisplay amount={toMinorUnits(String(line.unit_price))} currency={invoice.currency} />
                  </td>
                  <td className="tabular-nums py-2 text-right">
                    <CurrencyDisplay amount={toMinorUnits(String(line.line_total))} currency={invoice.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <p>
              Sous-total: <CurrencyDisplay amount={toMinorUnits(String(invoice.subtotal))} currency={invoice.currency} />
            </p>
            <p>
              Taxe ({invoice.tax_rate}%): <CurrencyDisplay amount={toMinorUnits(String(invoice.tax_amount))} currency={invoice.currency} />
            </p>
            <p className="text-base font-semibold text-ink">
              Total: <CurrencyDisplay amount={totalMinor} currency={invoice.currency} />
            </p>
          </div>

          {invoice.country_mention && (
            <p className="mt-4 rounded-lg bg-canvas p-3 text-xs text-slate">{invoice.country_mention}</p>
          )}
          {invoice.currency !== 'MUR' && (
            <p className="mt-2 text-xs text-slate">
              1 {invoice.currency} = {invoice.fx_rate_to_mur} Rs au <DateDisplay date={invoice.fx_rate_date ?? invoice.issue_date} /> (
              {invoice.fx_source})
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate">Paiements</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-slate">Aucun paiement enregistré.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                    <div>
                      <p className="text-ink">
                        <CurrencyDisplay amount={toMinorUnits(String(p.amount))} currency={p.currency} />
                      </p>
                      <p className="text-xs text-slate">
                        <DateDisplay date={p.payment_date} /> {p.method && `— ${p.method}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {outstandingMinor > 0 && (
              <p className="mt-2 text-sm font-medium text-pending">
                Restant dû : <CurrencyDisplay amount={outstandingMinor} currency={invoice.currency} />
              </p>
            )}
          </Card>
        </div>
      </div>

      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} invoice={invoice} outstandingMinor={outstandingMinor} />
      <CreditNoteModal open={creditNoteOpen} onClose={() => setCreditNoteOpen(false)} invoice={invoice} />
    </div>
  )
}
