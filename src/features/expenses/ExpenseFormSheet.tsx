import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { resolveFxRate } from '@/features/reference/api'
import { useCreateExpense, useUpdateExpense, useMaterializeExpenseOccurrences, type ExpenseWithCategory } from './api'
import { ExpenseForm } from './ExpenseForm'
import type { ExpenseFormValues } from './schema'

const FORM_ID = 'expense-form'

interface ExpenseFormSheetProps {
  open: boolean
  onClose: () => void
  expense?: ExpenseWithCategory
}

export function ExpenseFormSheet({ open, onClose, expense }: ExpenseFormSheetProps) {
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const materialize = useMaterializeExpenseOccurrences()
  const { push } = useToast()
  const submitting = createExpense.isPending || updateExpense.isPending

  const handleSubmit = async (values: ExpenseFormValues) => {
    try {
      // FX is resolved fresh on every save rather than only at first creation: an expense has
      // no draft/final distinction like invoices do, so each save is effectively "the creation
      // moment" for whatever currency/date is on the form at that point (spec §3.7's "frozen at
      // creation" still holds — it's just re-frozen if the user deliberately changes currency
      // or date on an edit, not silently drifted).
      const fx = values.currency === 'MUR' ? { rate: 1, source: 'identity' } : await resolveFxRate(values.currency, values.expense_date)
      if (!fx) {
        push('error', `Aucun taux ${values.currency}→MUR trouvé pour le ${values.expense_date}. Réessaie avec une autre date.`)
        return
      }

      const payload = {
        supplier: values.supplier,
        description: values.description || null,
        category_id: values.category_id || null,
        amount: values.amount,
        currency: values.currency,
        fx_rate_to_mur: fx.rate,
        fx_rate_date: values.expense_date,
        fx_source: fx.source,
        expense_date: values.expense_date,
        recurrence: values.recurrence,
        recurrence_end_date: values.recurrence_end_date || null,
        is_deductible: values.is_deductible,
        vat_amount: values.vat_amount,
      }

      if (expense) {
        await updateExpense.mutateAsync({ id: expense.id, updates: payload })
      } else {
        await createExpense.mutateAsync(payload)
        if (values.recurrence !== 'none') await materialize.mutateAsync()
      }
      push('success', expense ? 'Dépense mise à jour' : 'Dépense enregistrée')
      onClose()
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${(err as Error).message}`)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <ExpenseForm
        formId={FORM_ID}
        lockRecurrence={Boolean(expense)}
        onSubmit={handleSubmit}
        defaultValues={
          expense
            ? {
                ...expense,
                description: expense.description ?? undefined,
                recurrence_end_date: expense.recurrence_end_date ?? undefined,
              }
            : undefined
        }
      />
    </Sheet>
  )
}
