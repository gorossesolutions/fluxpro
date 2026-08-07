import { useNavigate } from 'react-router-dom'
import { BellRing, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { toMinorUnits, mulMoney } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import type { DunningStage } from '@/types/supabase'
import {
  useOverdueInvoices,
  useSentReminders,
  useMarkReminderSent,
  useUnmarkReminderSent,
  reachedStages,
  DUNNING_STAGES,
  DUNNING_STAGE_LABELS,
} from './api'

function clientLabel(snapshot: Record<string, unknown>): string {
  return typeof snapshot.name === 'string' && snapshot.name ? snapshot.name : 'Client'
}

export function RappelsPage() {
  const navigate = useNavigate()
  const { data: invoices = [], isLoading, error } = useOverdueInvoices()
  const { data: sentReminders = new Map() } = useSentReminders()
  const markSent = useMarkReminderSent()
  const unmarkSent = useUnmarkReminderSent()

  const needsActionCount = invoices.filter((inv) => {
    const sent = sentReminders.get(inv.id) ?? new Set()
    return reachedStages(inv.daysOverdue).some((stage) => !sent.has(stage))
  }).length

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink">Rappels</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink">Rappels</h1>
        <EmptyState title="Impossible de charger les rappels" description={getErrorMessage(error)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Rappels</h1>
        {needsActionCount > 0 && <Badge state="overdue" label={`${needsActionCount} à relancer`} />}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-8 w-8" />}
          title="Aucune facture en retard"
          description="Les factures dont l'échéance est dépassée apparaîtront ici, avec un calendrier de relance à J+1, J+7, J+15 et J+30."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => {
            const sent = sentReminders.get(inv.id) ?? new Set<DunningStage>()
            const reached = new Set(reachedStages(inv.daysOverdue))
            const totalMur = mulMoney(toMinorUnits(String(inv.total)), inv.fx_rate_to_mur)

            return (
              <Card key={inv.id} className="ribbon-left" style={{ ['--ribbon-color' as string]: 'var(--color-overdue)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <button onClick={() => navigate(`/factures/${inv.id}`)} className="font-medium text-ink hover:text-blue">
                      {inv.number ?? 'Facture'} — {clientLabel(inv.client_snapshot)}
                    </button>
                    <p className="text-sm text-slate">
                      <CurrencyDisplay amount={totalMur} currency="MUR" /> · {inv.daysOverdue} jour{inv.daysOverdue > 1 ? 's' : ''} de retard
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {DUNNING_STAGES.map((stage) => {
                      const isReached = reached.has(stage)
                      const isSent = sent.has(stage)
                      return (
                        <Tooltip
                          key={stage}
                          content={
                            !isReached
                              ? `Pas encore atteint (${DUNNING_STAGE_LABELS[stage]})`
                              : isSent
                                ? `Relance ${DUNNING_STAGE_LABELS[stage]} envoyée — cliquer pour annuler`
                                : `Marquer la relance ${DUNNING_STAGE_LABELS[stage]} comme envoyée`
                          }
                        >
                          <button
                            type="button"
                            disabled={!isReached || markSent.isPending || unmarkSent.isPending}
                            onClick={() =>
                              isSent
                                ? unmarkSent.mutate({ invoiceId: inv.id, stage })
                                : markSent.mutate({ invoiceId: inv.id, stage })
                            }
                            className={cn(
                              'flex h-9 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors duration-150',
                              !isReached && 'cursor-not-allowed border-border text-slate/40',
                              isReached && !isSent && 'border-overdue/40 text-overdue hover:bg-overdue/5',
                              isSent && 'border-paid bg-paid/10 text-paid',
                            )}
                          >
                            {isSent && <Check className="h-3.5 w-3.5" />}
                            {DUNNING_STAGE_LABELS[stage]}
                          </button>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function RappelsIcon() {
  return <BellRing className="h-5 w-5" />
}
