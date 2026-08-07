import { useState } from 'react'
import { CheckCircle2, FileText, Receipt } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { DatePicker } from '@/components/ui/DatePicker'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { useToast } from '@/components/ui/Toast'
import { toMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useUpdateDocumentDetails, useConfirmMatch, useMatchCandidates, type InboxDocument } from './api'

interface DocumentMatchModalProps {
  document: InboxDocument | null
  onClose: () => void
}

/** Classify-then-match flow (spec §10): the user enters what the receipt says (amount, date) —
 * standing in for OCR, which isn't built yet — and the suggestion engine ranks the likeliest
 * expense/invoice for it. Confirming writes the match; nothing here ever creates or edits the
 * expense/invoice itself. */
export function DocumentMatchModal({ document, onClose }: DocumentMatchModalProps) {
  const { push } = useToast()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const updateDetails = useUpdateDocumentDetails()
  const confirmMatch = useConfirmMatch()

  const effectiveDoc: InboxDocument | null = document
    ? {
        ...document,
        detected_amount: amount ? Number.parseFloat(amount) : document.detected_amount,
        detected_date: date || document.detected_date,
      }
    : null
  const { data: candidates = [], isFetching } = useMatchCandidates(effectiveDoc)

  if (!document) return null

  const handleSaveDetails = async () => {
    try {
      await updateDetails.mutateAsync({
        id: document.id,
        detectedAmount: amount ? Number.parseFloat(amount) : document.detected_amount,
        detectedDate: date || document.detected_date,
      })
      push('success', 'Détails enregistrés')
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  const handleConfirm = async (candidate: (typeof candidates)[number]) => {
    try {
      await confirmMatch.mutateAsync({ id: document.id, entityType: candidate.entityType, entityId: candidate.entityId })
      push('success', 'Document rapproché')
      onClose()
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  return (
    <Modal open={Boolean(document)} onClose={onClose} title={document.file_name} className="max-w-xl">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate">Ce que dit le justificatif</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate">Montant</label>
              <NumberInput
                value={amount || (document.detected_amount != null ? String(document.detected_amount) : '')}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate">Date</label>
              <DatePicker value={date || document.detected_date || ''} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSaveDetails} disabled={updateDetails.isPending} className="self-start">
            Enregistrer les détails
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate">Correspondances suggérées</h3>
          {!effectiveDoc?.detected_amount || !effectiveDoc?.detected_date ? (
            <p className="text-sm text-slate">Renseigne un montant et une date pour voir des suggestions.</p>
          ) : isFetching ? (
            <p className="text-sm text-slate">Recherche…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate">Aucune correspondance trouvée à ± 14 jours de cette date.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => (
                <li key={`${c.entityType}-${c.entityId}`} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {c.entityType === 'expense' ? (
                      <Receipt className="h-4 w-4 shrink-0 text-slate" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-slate" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-ink">{c.label}</p>
                      <p className="text-xs text-slate">
                        <DateDisplay date={c.date} /> · <CurrencyDisplay amount={toMinorUnits(String(c.amount))} currency={c.currency} />
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => void handleConfirm(c)} disabled={confirmMatch.isPending}>
                    <CheckCircle2 className="h-4 w-4" />
                    Rapprocher
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
