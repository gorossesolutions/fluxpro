import { Landmark } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { GroupedBarChart } from '@/components/ui/GroupedBarChart'
import { MagnitudeBarList } from '@/components/ui/MagnitudeBarList'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { formatMoney } from '@/lib/format'
import { toMinorUnits, fromMinorUnits, type MinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useDashboardSummary, type AgedBucket } from './api'

const AGED_BUCKET_LABELS: Record<AgedBucket, string> = {
  '0-30': '0–30 jours',
  '31-60': '31–60 jours',
  '61-90': '61–90 jours',
  '90+': '90+ jours',
}

// Ordinal severity ramp, one hue (overdue red), increasing opacity per step — swapping the
// bucket order would change the meaning, so this is an ordinal scale, not four unrelated
// categories (dataviz skill: ordinal = one hue, monotone lightness/opacity steps).
const AGED_BUCKET_OPACITY: Record<AgedBucket, number> = { '0-30': 0.35, '31-60': 0.55, '61-90': 0.75, '90+': 1 }

function compactMur(minor: number): string {
  const value = Number.parseFloat(fromMinorUnits(minor as MinorUnits))
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardSummary()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-ink">Vue d'ensemble</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-ink">Vue d'ensemble</h1>
        <EmptyState title="Impossible de charger le tableau de bord" description={getErrorMessage(error)} />
      </div>
    )
  }

  const { kpis, monthly, agedReceivables, expenseByCategory, fxRates } = data
  const hasAnyActivity = monthly.some((m) => m.invoicedMur > 0 || m.collectedMur > 0 || m.expensesMur > 0)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Vue d'ensemble</h1>

      <Card className="border-blue/30 bg-blue-pale">
        <p className="text-sm font-medium text-blue">CA total</p>
        <p className="tabular-nums mt-1 text-3xl font-bold text-ink">{formatMoney(kpis.totalCaMur, 'MUR')}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="CA encaissé ce mois" value={formatMoney(kpis.collectedThisMonthMur, 'MUR')} state="paid" />
        <KpiCard label="En attente" value={formatMoney(kpis.pendingMur, 'MUR')} state="pending" />
        <KpiCard label="En retard" value={formatMoney(kpis.overdueMur, 'MUR')} state="overdue" />
        <KpiCard
          label="Résultat net ce mois"
          value={formatMoney(kpis.netThisMonthMur, 'MUR')}
          state={kpis.netThisMonthMur >= 0 ? 'paid' : 'overdue'}
        />
      </div>

      {fxRates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate">Taux de change</span>
          {fxRates.map((fx) => (
            <span key={fx.currency} className="flex items-baseline gap-1 text-sm">
              <span className="font-medium text-ink">
                1 {fx.currency} = {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(fx.rate)} MUR
              </span>
              <span className="text-xs text-slate">
                (<DateDisplay date={fx.asOfDate} />)
              </span>
            </span>
          ))}
        </div>
      )}

      {!hasAnyActivity ? (
        <EmptyState
          icon={<Landmark className="h-8 w-8" />}
          title="Rien à afficher pour l'instant"
          description="Le tableau de bord se remplit dès la première facture émise ou dépense enregistrée."
        />
      ) : (
        <>
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate">Encaissé vs Dépenses — 12 derniers mois</h2>
            <div className="overflow-x-auto">
              <GroupedBarChart
                categories={monthly.map((m) => (m.label.split(' ')[0] ?? '').slice(0, 3))}
                series={[
                  { label: 'Encaissé', color: 'var(--color-chart-1)', values: monthly.map((m) => Number(fromMinorUnits(m.collectedMur))) },
                  { label: 'Dépenses', color: 'var(--color-chart-2)', values: monthly.map((m) => Number(fromMinorUnits(m.expensesMur))) },
                ]}
                formatValue={(v) => compactMur(toMinorUnits(v.toFixed(2)))}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-slate">Créances agées</h2>
              {agedReceivables.every((b) => b.amountMur === 0) ? (
                <p className="text-sm text-slate">Aucune créance en retard.</p>
              ) : (
                <MagnitudeBarList
                  items={agedReceivables.map((b) => ({
                    label: AGED_BUCKET_LABELS[b.bucket],
                    value: Number(fromMinorUnits(b.amountMur)),
                    color: `color-mix(in oklab, var(--color-overdue) ${AGED_BUCKET_OPACITY[b.bucket] * 100}%, transparent)`,
                  }))}
                  formatValue={(v) => formatMoney(toMinorUnits(v.toFixed(2)), 'MUR')}
                />
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-slate">Dépenses par catégorie — 12 derniers mois</h2>
              {expenseByCategory.length === 0 ? (
                <p className="text-sm text-slate">Aucune dépense sur la période.</p>
              ) : (
                <MagnitudeBarList
                  items={expenseByCategory.slice(0, 7).map((c) => ({ label: c.label, value: Number(fromMinorUnits(c.amountMur)) }))}
                  formatValue={(v) => formatMoney(toMinorUnits(v.toFixed(2)), 'MUR')}
                />
              )}
            </Card>
          </div>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-canvas">
                    <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate">Mois</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate">Facturé</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate">Encaissé</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate">Dépenses</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate">Résultat net</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.key} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 capitalize text-ink">{m.label}</td>
                      <td className="px-4 py-3 text-right">
                        <CurrencyDisplay amount={m.invoicedMur} currency="MUR" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CurrencyDisplay amount={m.collectedMur} currency="MUR" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CurrencyDisplay amount={m.expensesMur} currency="MUR" />
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${m.netMur < 0 ? 'text-overdue' : 'text-paid'}`}>
                        <CurrencyDisplay amount={m.netMur} currency="MUR" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
