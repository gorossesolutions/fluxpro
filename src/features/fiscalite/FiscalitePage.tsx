import { useMemo, useState } from 'react'
import { AlertTriangle, X, Info, Wand2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { NumberInput } from '@/components/ui/NumberInput'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { formatMoney } from '@/lib/format'
import { toMinorUnits, fromMinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useNumberGaps } from '@/features/invoices/api'
import {
  useTaxBands,
  useTaxConfig,
  useSaveTaxHistory,
  useTaxHistory,
  useVatTurnoverWatch,
  useNetIncomeEstimate,
  currentFiscalYearStart,
  computeProgressiveTax,
  computeFsc,
} from './api'

function fiscalYearLabel(fiscalYearStart: string): string {
  const startYear = Number(fiscalYearStart.slice(0, 4))
  return `${startYear}–${startYear + 1}`
}

export function FiscalitePage() {
  const { push } = useToast()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [fiscalYearStart, setFiscalYearStart] = useState(currentFiscalYearStart())
  const [incomeInput, setIncomeInput] = useState('')

  const { data: allBands = [], isLoading: loadingBands, error: bandsError } = useTaxBands()
  const { data: configs = [] } = useTaxConfig()
  const { data: gaps = [] } = useNumberGaps()
  const { data: turnoverMur, isLoading: loadingTurnover } = useVatTurnoverWatch()
  const { data: history = [] } = useTaxHistory()
  const { data: netIncomeEstimateMur, isFetching: estimating } = useNetIncomeEstimate(fiscalYearStart)
  const saveTaxHistory = useSaveTaxHistory()

  const fiscalYears = useMemo(() => [...new Set(allBands.map((b) => b.fiscal_year_start))].sort().reverse(), [allBands])
  const bandsForYear = useMemo(() => allBands.filter((b) => b.fiscal_year_start === fiscalYearStart), [allBands, fiscalYearStart])
  const configForYear = configs.find((c) => c.fiscal_year_start === fiscalYearStart)

  const chargeableIncome = Number.parseFloat(incomeInput || '0') || 0
  const { bands: bandResults, totalTax } = useMemo(
    () => computeProgressiveTax(bandsForYear, chargeableIncome),
    [bandsForYear, chargeableIncome],
  )
  const fscAmount = useMemo(() => computeFsc(configForYear, chargeableIncome), [configForYear, chargeableIncome])
  const netTax = totalTax + fscAmount

  const vatThreshold = configForYear?.vat_registration_threshold ?? 3_000_000
  const turnoverValue = turnoverMur ? Number.parseFloat(fromMinorUnits(turnoverMur)) : 0
  const turnoverRatio = vatThreshold > 0 ? turnoverValue / vatThreshold : 0
  const turnoverSeverity: 'ok' | 'warning' | 'critical' = turnoverRatio >= 1 ? 'critical' : turnoverRatio >= 0.8 ? 'warning' : 'ok'
  const meterColor = { ok: 'var(--color-paid)', warning: 'var(--color-pending)', critical: 'var(--color-overdue)' }[turnoverSeverity]

  const handleSave = async () => {
    try {
      await saveTaxHistory.mutateAsync({ fiscalYearStart, chargeableIncome, taxAmount: totalTax, fscAmount })
      push('success', `Estimation enregistrée pour l'exercice ${fiscalYearLabel(fiscalYearStart)}`)
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${getErrorMessage(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Fiscalité</h1>

      {gaps.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-overdue/40 bg-overdue/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-overdue" />
          <div>
            <p className="text-sm font-medium text-overdue">
              {gaps.length} numéro{gaps.length > 1 ? 's' : ''} manquant{gaps.length > 1 ? 's' : ''} dans la séquence
            </p>
            <ul className="mt-1 text-sm text-overdue">
              {gaps.map((g) => (
                <li key={`${g.prefix}-${g.year}-${g.missing_number}`}>
                  {g.prefix}-{g.year}-{String(g.missing_number).padStart(3, '0')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!bannerDismissed && (
        <div className="flex items-start gap-2 rounded-xl border border-blue/30 bg-blue-pale px-4 py-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue" />
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">Budget 2026-2027 — proposition non promulguée</p>
            <p className="mt-1 text-sm text-slate">
              Une proposition de remplacer la Fair Share Contribution par une tranche marginale à 35% a été annoncée mais
              n'est pas encore promulguée. Ce calculateur applique uniquement le régime en vigueur (Finance Act 2025).
            </p>
          </div>
          <button onClick={() => setBannerDismissed(true)} aria-label="Fermer" className="text-slate hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate">Suivi du seuil d'immatriculation TVA</h2>
          <span className="text-xs text-slate">12 derniers mois</span>
        </div>
        {loadingTurnover ? (
          <Skeleton className="mt-3 h-6 w-full" />
        ) : (
          <>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${Math.min(100, turnoverRatio * 100)}%`, backgroundColor: meterColor }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-ink">
                {formatMoney(toMinorUnits(turnoverValue.toFixed(2)), 'MUR')} / {formatMoney(toMinorUnits(String(vatThreshold)), 'MUR')}
              </span>
              <span className="text-slate">{Math.round(turnoverRatio * 100)}%</span>
            </div>
            {turnoverSeverity !== 'ok' && (
              <p className={`mt-2 text-sm ${turnoverSeverity === 'critical' ? 'text-overdue' : 'text-pending'}`}>
                {turnoverSeverity === 'critical'
                  ? "Seuil d'immatriculation TVA dépassé (MUR 3,000,000) — vérifie ton obligation d'immatriculation."
                  : "Approche du seuil d'immatriculation TVA — anticipe la démarche si le rythme se maintient."}
              </p>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate">Calculateur d'impôt progressif</h2>
        {loadingBands ? (
          <Skeleton className="h-48 w-full" />
        ) : bandsError ? (
          <p className="text-sm text-overdue">Impossible de charger les tranches d'imposition : {getErrorMessage(bandsError)}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="fisc_year_start" className="mb-1 block text-sm font-medium text-slate">Exercice fiscal</label>
                <Select id="fisc_year_start" value={fiscalYearStart} onChange={(e) => setFiscalYearStart(e.target.value)}>
                  {fiscalYears.map((fy) => (
                    <option key={fy} value={fy}>
                      {fiscalYearLabel(fy)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="fisc_income" className="mb-1 block text-sm font-medium text-slate">Revenu imposable annuel (MUR)</label>
                <NumberInput id="fisc_income" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} placeholder="0" />
                <button
                  type="button"
                  onClick={() => netIncomeEstimateMur != null && setIncomeInput(fromMinorUnits(netIncomeEstimateMur))}
                  disabled={netIncomeEstimateMur == null || estimating}
                  className="mt-1 flex items-center gap-1 text-xs text-blue hover:underline disabled:cursor-not-allowed disabled:text-slate/60 disabled:no-underline"
                >
                  <Wand2 className="h-3 w-3" />
                  {estimating
                    ? 'Calcul de l\'estimation…'
                    : netIncomeEstimateMur != null
                      ? `Pré-remplir avec une estimation (${formatMoney(netIncomeEstimateMur, 'MUR')}) — revenu facturé moins dépenses déductibles sur l'exercice, à vérifier`
                      : 'Estimation indisponible'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-canvas">
                    <th className="px-3 py-2 text-left font-medium text-slate">Tranche</th>
                    <th className="px-3 py-2 text-right font-medium text-slate">Taux</th>
                    <th className="px-3 py-2 text-right font-medium text-slate">Base imposable</th>
                    <th className="px-3 py-2 text-right font-medium text-slate">Impôt</th>
                  </tr>
                </thead>
                <tbody>
                  {bandResults.map((b) => (
                    <tr key={b.bandOrder} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-ink">
                        {new Intl.NumberFormat('fr-FR').format(b.lowerBound)} –{' '}
                        {b.upperBound ? new Intl.NumberFormat('fr-FR').format(b.upperBound) : '∞'}
                      </td>
                      <td className="px-3 py-2 text-right text-ink">{b.ratePct}%</td>
                      <td className="px-3 py-2 text-right">
                        <span className="tabular-nums">{formatMoney(toMinorUnits(b.taxableInBand.toFixed(2)), 'MUR')}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="tabular-nums">{formatMoney(toMinorUnits(b.taxForBand.toFixed(2)), 'MUR')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-1 rounded-lg bg-canvas p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate">Impôt progressif</span>
                <span className="tabular-nums font-medium text-ink">{formatMoney(toMinorUnits(totalTax.toFixed(2)), 'MUR')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate">
                  Fair Share Contribution {configForYear?.fsc_active ? `(15% au-delà de MUR ${new Intl.NumberFormat('fr-FR').format(configForYear.fsc_threshold)})` : '(inactive)'}
                </span>
                <span className="tabular-nums font-medium text-ink">{formatMoney(toMinorUnits(fscAmount.toFixed(2)), 'MUR')}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                <span className="font-medium text-ink">Total estimé</span>
                <span className="tabular-nums text-base font-semibold text-ink">{formatMoney(toMinorUnits(netTax.toFixed(2)), 'MUR')}</span>
              </div>
            </div>

            {fscAmount > 0 && (
              <p className="text-xs text-slate">
                ⚠ La FSC est calculée ici sur le revenu imposable (base des tranches), en l'absence de confirmation comptable
                que le « revenu prélevable » (base légale de la FSC) est identique — à vérifier avant de s'y fier pour un
                exercice où le revenu approche MUR 12M (docs/COMPLIANCE.md §3.1).
              </p>
            )}

            <Button onClick={() => void handleSave()} disabled={saveTaxHistory.isPending || chargeableIncome <= 0} className="self-start">
              {saveTaxHistory.isPending ? 'Enregistrement…' : 'Enregistrer cette estimation'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate">Estimations enregistrées</h2>
        {history.length === 0 ? (
          <EmptyState
            title="Aucune estimation enregistrée"
            description="Les estimations enregistrées ci-dessus apparaîtront ici, classées par exercice fiscal."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">{fiscalYearLabel(h.fiscal_year_start)}</p>
                  <p className="text-xs text-slate">
                    Revenu imposable : {h.chargeable_income != null ? formatMoney(toMinorUnits(h.chargeable_income.toFixed(2)), 'MUR') : '—'}
                    {' · '}Total :{' '}
                    {h.tax_amount != null && h.fsc_amount != null
                      ? formatMoney(toMinorUnits((h.tax_amount + h.fsc_amount).toFixed(2)), 'MUR')
                      : '—'}
                    {' · '}
                    <DateDisplay date={h.computed_at} />
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFiscalYearStart(h.fiscal_year_start)
                    setIncomeInput(h.chargeable_income != null ? String(h.chargeable_income) : '')
                  }}
                >
                  Charger
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
