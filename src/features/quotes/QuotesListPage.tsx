import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, FileSignature } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterBar } from '@/components/ui/FilterBar'
import { FilterPills, type FilterPillOption } from '@/components/ui/FilterPills'
import { Badge, type SemanticState } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Card } from '@/components/ui/Card'
import { toMinorUnits } from '@/lib/money'
import { useQuotes, type Quote } from './api'

const STATUS_LABELS: Record<string, { label: string; state: SemanticState }> = {
  draft: { label: 'Brouillon', state: 'neutral' },
  sent: { label: 'Envoyé', state: 'pending' },
  accepted: { label: 'Accepté', state: 'paid' },
  refused: { label: 'Refusé', state: 'overdue' },
  expired: { label: 'Expiré', state: 'neutral' },
}

// Deliberately distinct from InvoicesListPage's status set (draft/issued/paid/overdue/
// cancelled) — quotes have their own lifecycle (draft/sent/accepted/refused/expired), never
// invoice statuses, even though "accepted" and "paid" share the same green as a matter of
// pure colour choice.
const STATUS_FILTER_OPTIONS: FilterPillOption[] = [
  { value: 'all', label: 'Tous', state: 'all' },
  { value: 'draft', label: 'Brouillons', state: 'neutral' },
  { value: 'sent', label: 'Envoyés', state: 'pending' },
  { value: 'accepted', label: 'Acceptés', state: 'paid' },
  { value: 'refused', label: 'Refusés', state: 'overdue' },
  { value: 'expired', label: 'Expirés', state: 'neutral' },
]

interface QuotesListPageProps {
  clientId?: string
  embedded?: boolean
}

export function QuotesListPage({ clientId, embedded }: QuotesListPageProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const { data: quotes = [], isLoading, error } = useQuotes({ clientId, search, status })

  const columns = useMemo<ColumnDef<Quote, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: 'N°',
        cell: ({ row }) => (
          <button onClick={() => navigate(`/devis/${row.original.id}`)} className="font-medium text-ink hover:text-blue">
            {row.original.number ?? 'Brouillon'}
          </button>
        ),
      },
      // Redundant on a client's own "Devis" tab (embedded, clientId set) — every row is
      // already that one client, so the column would just repeat the same name down the list.
      ...(clientId
        ? []
        : [
            {
              id: 'client',
              header: 'Client',
              cell: ({ row }: { row: { original: Quote } }) => {
                const name = (row.original.client_snapshot as { name?: string })?.name
                return name ?? <span className="text-slate/60">—</span>
              },
            } as ColumnDef<Quote, unknown>,
          ]),
      {
        accessorKey: 'total',
        header: 'Montant',
        cell: ({ row }) => <CurrencyDisplay amount={toMinorUnits(String(row.original.total))} currency={row.original.currency} />,
      },
      { accessorKey: 'currency', header: 'Devise' },
      { accessorKey: 'issue_date', header: 'Date', cell: ({ row }) => <DateDisplay date={row.original.issue_date} /> },
      {
        accessorKey: 'valid_until',
        header: 'Validité',
        cell: ({ row }) => (row.original.valid_until ? <DateDisplay date={row.original.valid_until} /> : '—'),
      },
      {
        accessorKey: 'status',
        header: 'Statut',
        cell: ({ row }) => {
          const s = STATUS_LABELS[row.original.status] ?? STATUS_LABELS.draft!
          return <Badge state={s.state} label={s.label} />
        },
      },
    ],
    [navigate, clientId],
  )

  const content = (
    <>
      <FilterBar>
        <SearchInput placeholder="Rechercher un numéro…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </FilterBar>
      <FilterPills options={STATUS_FILTER_OPTIONS} value={status} onChange={setStatus} aria-label="Filtrer les devis par statut" />

      <Card className="p-0">
        <DataTable
          columns={columns}
          data={quotes}
          loading={isLoading}
          error={error}
          emptyTitle="Aucun devis pour l'instant"
          emptyDescription="Crée ton premier devis."
          emptyAction={<Button onClick={() => navigate(clientId ? `/devis/nouveau?client=${clientId}` : '/devis/nouveau')}>Créer un devis</Button>}
          getRowRibbonClassName={(row) => `ribbon-${STATUS_LABELS[row.status]?.state ?? 'neutral'}`}
          renderMobileCard={(quote) => {
            const s = STATUS_LABELS[quote.status] ?? STATUS_LABELS.draft!
            const clientName = (quote.client_snapshot as { name?: string })?.name
            return (
              <Card className="cursor-pointer" onClick={() => navigate(`/devis/${quote.id}`)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{quote.number ?? 'Brouillon'}</span>
                  <Badge state={s.state} label={s.label} />
                </div>
                {!clientId && clientName && <p className="mt-0.5 text-sm text-slate">{clientName}</p>}
                <div className="mt-1 flex items-center justify-between text-sm text-slate">
                  <DateDisplay date={quote.issue_date} />
                  <CurrencyDisplay amount={toMinorUnits(String(quote.total))} currency={quote.currency} />
                </div>
              </Card>
            )
          }}
        />
      </Card>
    </>
  )

  if (embedded) return <div className="flex flex-col gap-4">{content}</div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Devis</h1>
        <Button onClick={() => navigate('/devis/nouveau')}>
          <Plus className="h-4 w-4" />
          Nouveau devis
        </Button>
      </div>
      {content}
    </div>
  )
}

export function QuotesIcon() {
  return <FileSignature className="h-5 w-5" />
}
