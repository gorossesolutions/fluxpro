import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { DatePicker } from '@/components/ui/DatePicker'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { fromMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useRecordPayment, type Invoice } from './api'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  invoice: Invoice
  outstandingMinor: bigint | number
}

/** Records a payment — supports partial payments (spec §16.1); invoice status is derived
 * server-side from the sum of payments, never typed by hand. */
export function PaymentModal({ open, onClose, invoice, outstandingMinor }: PaymentModalProps) {
  const [amount, setAmount] = useState(fromMinorUnits(Number(outstandingMinor)))
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const recordPayment = useRecordPayment()
  const { push } = useToast()

  const handleSubmit = async () => {
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: Number(amount),
        currency: invoice.currency,
        fxRateToMur: invoice.fx_rate_to_mur,
        paymentDate,
        method: method || undefined,
        reference: reference || undefined,
      })
      push('success', 'Paiement enregistré')
      onClose()
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={recordPayment.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="pay_amount" className="mb-1 block text-sm font-medium text-slate">Montant</label>
          <NumberInput id="pay_amount" value={amount} onChange={(e) => setAmount(e.target.value)} suffix={invoice.currency} />
        </div>
        <div>
          <label htmlFor="pay_date" className="mb-1 block text-sm font-medium text-slate">Date du paiement</label>
          <DatePicker id="pay_date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pay_method" className="mb-1 block text-sm font-medium text-slate">Méthode</label>
          <Input id="pay_method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Virement, carte, PayPal…" />
        </div>
        <div>
          <label htmlFor="pay_reference" className="mb-1 block text-sm font-medium text-slate">Référence</label>
          <Input id="pay_reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
