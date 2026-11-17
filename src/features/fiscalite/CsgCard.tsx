import { Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMoneyFormatter } from '@/lib/privacy'
import { getErrorMessage } from '@/lib/errors'
import type { MinorUnits } from '@/lib/money'
import type { CsgMode, CsgSchedule } from './calculations'

interface CsgCardProps {
  yearLabel: string
  previousYearLabel: string
  mode: CsgMode
  onModeChange: (mode: CsgMode) => void
  schedule: CsgSchedule | null
  previousYearNetMinor: MinorUnits | null
  isLoading: boolean
  error: unknown
}


const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const monthLabel = (yyyyMm: string) => monthFormatter.format(new Date(`${yyyyMm}-01T12:00:00`))

/** Self-employed CSG due per month for the selected fiscal year (MRA bands, see
 * computeSelfEmployedCsg). An estimate to prepare the CSG return — the MRA e-service remains the
 * place where the return is actually filed and paid. */
export function CsgCard({ yearLabel, previousYearLabel, mode, onModeChange, schedule, previousYearNetMinor, isLoading, error }: CsgCardProps) {
  const fmt = useMoneyFormatter()
  const mur = (minor: MinorUnits) => fmt(minor, 'MUR')
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate">CSG — travailleur indépendant</h2>
          <p className="mt-0.5 text-xs text-slate">
            Exercice {yearLabel}. Barème MRA : Rs 150 jusqu'à Rs 10 000 net/mois · 1,5 % de 90 % jusqu'à Rs 50 000 (min. Rs 150)
            · 3 % de 90 % au-delà.
          </p>
        </div>
        <div>
          <label htmlFor="csg_mode" className="mb-1 block text-xs font-medium text-slate">Base de calcul</label>
          <Select id="csg_mode" value={mode} onChange={(e) => onModeChange(e.target.value as CsgMode)}>
            <option value="previous_year">1/12 du net de l'exercice {previousYearLabel}</option>
            <option value="actual">Net réel de chaque mois</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <p className="text-sm text-overdue">Impossible de calculer la CSG : {getErrorMessage(error)}</p>
      ) : schedule ? (
        <>
          {mode === 'previous_year' && previousYearNetMinor != null && (
            <p className="mb-3 text-sm text-ink">
              Net de l'exercice {previousYearLabel} : <span className="tabular-nums font-medium">{mur(previousYearNetMinor)}</span>
              {' → '}base mensuelle{' '}
              <span className="tabular-nums font-medium">{mur(Math.round(previousYearNetMinor / 12) as MinorUnits)}</span>
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-canvas">
                  <th className="px-3 py-2 text-left font-medium text-slate">Mois</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">Revenu net (base)</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">CSG due</th>
                </tr>
              </thead>
              <tbody>
                {schedule.months.map((m) => (
                  <tr key={m.month} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 capitalize text-ink">{monthLabel(m.month)}</td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-slate">
                      {m.baseMinor == null ? 'à venir' : mur(m.baseMinor)}
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right font-medium text-ink">
                      {m.csgMinor == null ? '—' : mur(m.csgMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-canvas font-semibold">
                  <td className="px-3 py-2 text-ink" colSpan={2}>
                    Total {schedule.monthsComputed < 12 ? `(${schedule.monthsComputed} mois écoulés)` : "de l'exercice"}
                  </td>
                  <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{mur(schedule.totalMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-2 text-xs text-slate">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              « Net réel » = factures émises du mois (taux figé) moins dépenses déductibles du mois : c'est la règle pour une
              activité de moins de 12 mois. Au-delà, la MRA base chaque mois sur 1/12 du net de l'exercice précédent, payable
              chaque mois ou en une fois en début d'exercice. La CSG n'est pas déduite du revenu imposable (aucune disposition
              de l'Income Tax Act ne le prévoit) — à confirmer avec ton comptable. Pour suivre les paiements, enregistre-les
              dans Dépenses, catégorie « Taxes & cotisations », case « déductible » décochée.
            </p>
          </div>
        </>
      ) : null}
    </Card>
  )
}
