import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Receipt, Archive, ArchiveRestore, Pencil, Repeat } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterBar } from '@/components/ui/FilterBar'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Card } from '@/components/ui/Card'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { toMinorUnits } from '@/lib/money'
import {
  useExpenses,
  useExpenseCategories,
  useArchiveExpense,
  useRestoreExpense,
  useMaterializeExpenseOccurrences,
  type ExpenseWithCategory,
} from './api'
import { ExpenseFormSheet } from './ExpenseFormSheet'

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: 'Hebdo',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
}

export function ExpensesListPage() {
  const { push } = useToast()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ExpenseWithCategory | null>(null)

  const { data: categories = [] } = useExpenseCategories()
  const { data: expenses = [], isLoading, error } = useExpenses({ search, categoryId: categoryId || null, showArchived })
  const archiveExpense = useArchiveExpense()
  const restoreExpense = useRestoreExpense()
  const materialize = useMaterializeExpenseOccurrences()

  // Tops up any recurring expense's occurrences up to today the moment this page is opened —
  // idempotent (0011_expense_recurrence_engine.sql), so calling it on every mount is safe and
  // is what keeps expense_occurrences from ever silently falling behind (spec §9).
  useEffect(() => {
    materialize.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns = useMemo<ColumnDef<ExpenseWithCategory, unknown>[]>(
    () => [
      {
        accessorKey: 'expense_date',
        header: 'Date',
        cell: ({ row }) => <DateDisplay date={row.original.expense_date} />,
      },
      { accessorKey: 'supplier', header: 'Fournisseur' },
      {
        id: 'category',
        header: 'Catégorie',
        cell: ({ row }) => row.original.category?.label_fr ?? <span className="text-slate/60">—</span>,
      },
      {
        id: 'amount',
        header: 'Montant',
        cell: ({ row }) => <CurrencyDisplay amount={toMinorUnits(String(row.original.amount))} currency={row.original.currency} />,
      },
      {
        id: 'recurrence',
        header: 'Récurrence',
        cell: ({ row }) =>
          row.original.recurrence === 'none' ? (
            <span className="text-slate/60">—</span>
          ) : (
            <Badge state="pending" label={RECURRENCE_LABELS[row.original.recurrence]} />
          ),
      },
      {
        id: 'deductible',
        header: 'Déductible',
        cell: ({ row }) => (row.original.is_deductible ? 'Oui' : 'Non'),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end items-center gap-1">
            <Tooltip content="Modifier la dépense">
              <Button variant="ghost" size="sm" aria-label="Modifier la dépense" onClick={() => setEditingExpense(row.original)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
            {row.original.deleted_at ? (
              <Tooltip content="Restaurer la dépense">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Restaurer la dépense"
                  onClick={() => restoreExpense.mutate(row.original.id)}
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Archiver la dépense (réversible, aucune donnée supprimée)">
                <Button variant="ghost" size="sm" aria-label="Archiver la dépense" onClick={() => setArchiveTarget(row.original)}>
                  <Archive className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    [restoreExpense],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Dépenses</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle dépense
        </Button>
      </div>

      <FilterBar>
        <SearchInput
          placeholder="Rechercher par fournisseur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-[220px]">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label_fr}
            </option>
          ))}
        </Select>
        <Button variant={showArchived ? 'primary' : 'secondary'} size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Voir les dépenses actives' : 'Voir les dépenses archivées'}
        </Button>
      </FilterBar>

      <Card className="p-0">
        <DataTable
          columns={columns}
          data={expenses}
          loading={isLoading}
          error={error}
          emptyTitle="Aucune dépense pour l'instant"
          emptyDescription="Enregistre ta première dépense, ponctuelle ou récurrente."
          emptyAction={<Button onClick={() => setCreateOpen(true)}>Créer une dépense</Button>}
          renderMobileCard={(exp) => (
            <Card className="ribbon-left" style={{ ['--ribbon-color' as string]: 'var(--color-neutral-doc)' }}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{exp.supplier}</span>
                <CurrencyDisplay amount={toMinorUnits(String(exp.amount))} currency={exp.currency} />
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-slate">
                <DateDisplay date={exp.expense_date} />
                {exp.recurrence !== 'none' && (
                  <span className="flex items-center gap-1">
                    <Repeat className="h-3.5 w-3.5" />
                    {RECURRENCE_LABELS[exp.recurrence]}
                  </span>
                )}
              </div>
            </Card>
          )}
        />
      </Card>

      <ExpenseFormSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      <ExpenseFormSheet open={editingExpense !== null} onClose={() => setEditingExpense(null)} expense={editingExpense ?? undefined} />
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (!archiveTarget) return
          archiveExpense.mutate(archiveTarget.id)
          push('success', `« ${archiveTarget.supplier} » archivée — retrouvable via "Voir les dépenses archivées"`)
        }}
        title="Archiver cette dépense ?"
        description={`« ${archiveTarget?.supplier} » sera masquée de la liste active. Aucune donnée n'est supprimée, et tu peux la restaurer à tout moment.`}
        confirmLabel="Archiver"
      />
    </div>
  )
}

export function ExpensesListIcon() {
  return <Receipt className="h-5 w-5" />
}
