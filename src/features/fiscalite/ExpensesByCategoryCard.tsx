import { Download, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useMoneyFormatter } from '@/lib/privacy'
import { fromMinorUnits, type MinorUnits } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { useExpensesByCategory, type ExpensesByCategoryResult } from './api'

interface ExpensesByCategoryCardProps {
  fiscalYearStart: string
  fiscalYears: string[]
  onFiscalYearChange: (fiscalYearStart: string) => void
  fiscalYearLabel: (fiscalYearStart: string) => string
}


/** "12345.60" → "12345,60" so a French Excel reads it as a number, not text. */
const csvAmount = (minor: MinorUnits) => fromMinorUnits(minor).replace('.', ',')

const csvCell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

function downloadCsv(result: ExpensesByCategoryResult, yearLabel: string) {
  const header = ['Catégorie', 'Code PCG', 'Nb', 'Déductible (MUR)', 'Non déductible (MUR)', 'Total (MUR)', 'dont TVA (MUR)']
  const lines = result.rows.map((r) =>
    [r.label, r.pcgCode ?? '', String(r.count), csvAmount(r.deductibleMinor), csvAmount(r.nonDeductibleMinor), csvAmount(r.totalMinor), csvAmount(r.vatMinor)]
      .map(csvCell)
      .join(';'),
  )
  const t = result.totals
  lines.push(['Total', '', String(t.count), csvAmount(t.deductibleMinor), csvAmount(t.nonDeductibleMinor), csvAmount(t.totalMinor), csvAmount(t.vatMinor)].join(';'))

  // BOM so Excel opens the accents correctly; ";" is the separator French Excel expects.
  const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `depenses-par-type-${yearLabel.replace('–', '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/** Fiscal-year expenses grouped by category, laid out to be copied line by line into the
 * expense section of the annual tax return. */
export function ExpensesByCategoryCard({ fiscalYearStart, fiscalYears, onFiscalYearChange, fiscalYearLabel }: ExpensesByCategoryCardProps) {
  const fmt = useMoneyFormatter()
  const mur = (minor: MinorUnits) => fmt(minor, 'MUR')
  const { data, isLoading, error } = useExpensesByCategory(fiscalYearStart)
  const yearLabel = fiscalYearLabel(fiscalYearStart)
  const years = fiscalYears.includes(fiscalYearStart) ? fiscalYears : [fiscalYearStart, ...fiscalYears]
  const uncategorised = data?.rows.find((r) => r.categoryId === null)

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate">Dépenses par type</h2>
          <p className="mt-0.5 text-xs text-slate">
            Exercice {yearLabel} (1er juillet → 30 juin), montants en MUR au taux figé de chaque dépense — à reporter dans la
            déclaration d'impôt.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="fisc_expenses_year" className="mb-1 block text-xs font-medium text-slate">Exercice</label>
            <Select id="fisc_expenses_year" value={fiscalYearStart} onChange={(e) => onFiscalYearChange(e.target.value)}>
              {years.map((fy) => (
                <option key={fy} value={fy}>
                  {fiscalYearLabel(fy)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" disabled={!data || data.rows.length === 0} onClick={() => data && downloadCsv(data, yearLabel)}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <p className="text-sm text-overdue">Impossible de charger les dépenses : {getErrorMessage(error)}</p>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title="Aucune dépense sur cet exercice"
          description="Les dépenses saisies dans l'onglet Dépenses apparaîtront ici, regroupées par catégorie."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-canvas">
                  <th className="px-3 py-2 text-left font-medium text-slate">Catégorie</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">Nb</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">Déductible</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">Non déductible</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">Total</th>
                  <th className="px-3 py-2 text-right font-medium text-slate">dont TVA</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.categoryId ?? 'none'} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-ink">
                      <span className={r.categoryId === null ? 'text-pending' : undefined}>{r.label}</span>
                      {r.pcgCode && <span className="ml-2 text-xs text-slate">PCG {r.pcgCode}</span>}
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-slate">{r.count}</td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{mur(r.deductibleMinor)}</td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-slate">{mur(r.nonDeductibleMinor)}</td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right font-medium text-ink">{mur(r.totalMinor)}</td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-slate">{mur(r.vatMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-canvas font-semibold">
                  <td className="px-3 py-2 text-ink">Total</td>
                  <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{data.totals.count}</td>
                  <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{mur(data.totals.deductibleMinor)}</td>
                  <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{mur(data.totals.nonDeductibleMinor)}</td>
                  <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{mur(data.totals.totalMinor)}</td>
                  <td className="tabular-nums whitespace-nowrap px-3 py-2 text-right text-ink">{mur(data.totals.vatMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {uncategorised && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-pending">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {uncategorised.count} dépense{uncategorised.count > 1 ? 's' : ''} sans catégorie — attribue-leur un type dans
              l'onglet Dépenses pour qu'elles tombent dans la bonne ligne de la déclaration.
            </p>
          )}
          <p className="mt-2 text-xs text-slate">
            « Déductible » reprend la case cochée sur chaque dépense : c'est une indication, pas un avis fiscal — à valider
            avec ton comptable avant de déposer la déclaration.
          </p>
        </>
      )}
    </Card>
  )
}
