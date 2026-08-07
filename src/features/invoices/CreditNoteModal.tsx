import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { LineItemsEditor, computeSubtotal, type EditableLine } from '@/features/documents/LineItemsEditor'
import { addMoney, fromMinorUnits, mulMoney, toMinorUnits } from '@/lib/money'
import { formatMoney } from '@/lib/format'
import { useCreateCreditNote, type InvoiceWithLines } from './api'

interface CreditNoteModalProps {
  open: boolean
  onClose: () => void
  invoice: InvoiceWithLines
}

/** Corrections/cancellations happen exclusively via credit notes (spec §3.5) — a mandatory
 * reason, its own AV-YYYY-NNN sequence, linked to the parent invoice. Never a plain delete. */
export function CreditNoteModal({ open, onClose, invoice }: CreditNoteModalProps) {
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<EditableLine[]>(
    invoice.invoice_lines.map((l) => ({
      title: l.title,
      description: l.description ?? '',
      quantity: String(l.quantity),
      unit_price: String(l.unit_price),
    })),
  )
  const createCreditNote = useCreateCreditNote()
  const { push } = useToast()

  const subtotal = computeSubtotal(lines)
  const subtotalMinor = toMinorUnits(subtotal)
  const taxAmountMinor = mulMoney(subtotalMinor, invoice.tax_rate / 100)
  const totalMinor = addMoney(subtotalMinor, taxAmountMinor)

  const handleSubmit = async () => {
    if (!reason.trim()) {
      push('error', 'Un motif est requis pour créer un avoir')
      return
    }
    try {
      await createCreditNote.mutateAsync({
        parentInvoiceId: invoice.id,
        reason,
        lines: lines.map((l) => ({
          title: l.title,
          description: l.description || null,
          quantity: Number.parseFloat(l.quantity || '0'),
          unit_price: Number(l.unit_price || '0'),
          line_total: Number(fromMinorUnits(mulMoney(toMinorUnits(l.unit_price || '0'), Number.parseFloat(l.quantity || '0')))),
        })),
        subtotal: Number(subtotal),
        taxRate: invoice.tax_rate,
        taxAmount: Number(fromMinorUnits(taxAmountMinor)),
        total: Number(fromMinorUnits(totalMinor)),
        currency: invoice.currency,
        fxRateToMur: invoice.fx_rate_to_mur,
      })
      push('success', 'Avoir créé')
      onClose()
    } catch (err) {
      push('error', `Échec : ${(err as Error).message}`)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Créer un avoir pour ${invoice.number}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={createCreditNote.isPending}>
            Émettre l'avoir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Motif *</label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison de l'avoir…" />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate">Lignes (préremplies depuis la facture, ajustables)</h3>
          <LineItemsEditor lines={lines} onChange={setLines} currency={invoice.currency} />
        </div>
        <div className="rounded-lg bg-canvas p-3 text-right text-sm">
          <p className="tabular-nums font-semibold text-ink">Total de l'avoir : {formatMoney(totalMinor, invoice.currency)}</p>
        </div>
      </div>
    </Sheet>
  )
}
