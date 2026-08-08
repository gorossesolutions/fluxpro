import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { toMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useExpenseOccurrences, type ExpenseWithCategory } from './api'

interface ExpenseOccurrencesModalProps {
  expense: ExpenseWithCategory | null
  onClose: () => void
}

/** One recurring expense generates a row in expense_occurrences per period
 * (fn_materialize_expense_occurrences, 0011_expense_recurrence_engine.sql) — these already feed
 * the Dashboard's totals, but until now there was no way to actually see the generated dates
 * from the UI, only trust the aggregate was right. */
export function ExpenseOccurrencesModal({ expense, onClose }: ExpenseOccurrencesModalProps) {
  const { data: occurrences = [], isLoading, error } = useExpenseOccurrences(expense?.id)

  return (
    <Modal open={expense !== null} onClose={onClose} title={expense ? `Occurrences — ${expense.supplier}` : 'Occurrences'}>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <EmptyState title="Impossible de charger les occurrences" description={getErrorMessage(error)} />
      ) : occurrences.length === 0 ? (
        <EmptyState
          title="Aucune occurrence générée pour l'instant"
          description="Les occurrences futures sont générées automatiquement à chaque ouverture de la page Dépenses."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {occurrences.map((occ) => (
            <li key={occ.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <DateDisplay date={occ.occurrence_date} />
              <div className="text-right">
                <p className="text-ink">
                  <CurrencyDisplay amount={toMinorUnits(String(occ.amount))} currency={expense?.currency ?? 'MUR'} />
                </p>
                {expense?.currency !== 'MUR' && (
                  <p className="text-xs text-slate">
                    <CurrencyDisplay amount={toMinorUnits(String(occ.amount_mur))} currency="MUR" />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
