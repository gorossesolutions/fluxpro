import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, FileText } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterBar } from '@/components/ui/FilterBar'
import { Select } from '@/components/ui/Select'
import { Badge, type SemanticState } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Card } from '@/components/ui/Card'
import { toMinorUnits } from '@/lib/money'
import { useInvoices, type Invoice } from './api'

const STATUS_LABELS: Record<string, { label: string; state: SemanticState }> = {
  draft: { label: 'Brouillon', state: 'neutral' },
  issued: { label: 'En attente', state: 'pending' },
  paid: { label: 'Payée', state: 'paid' },
  overdue: { label: 'En retard', state: 'overdue' },
  cancelled: { label: 'Annulée', state: 'neutral' },
}

interface InvoicesListPageProps {
  clientId?: string
  embedded?: boolean
}

export function InvoicesListPage({ clientId, embedded }: InvoicesListPageProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const { data: invoices = [], isLoading, error } = useInvoices({ clientId, search, status })

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: 'N°',
        cell: ({ row }) => (
          <button onClick={() => navigate(`/factures/${row.original.id}`)} className="font-medium text-ink hover:text-blue">
            {row.original.number ?? 'Brouillon'}
          </button>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Montant',
        cell: ({ row }) => <CurrencyDisplay amount={toMinorUnits(String(row.original.total))} currency={row.original.currency} />,
      },
      { accessorKey: 'currency', header: 'Devise' },
      {
        accessorKey: 'issue_date',
        header: 'Date',
        cell: ({ row }) => <DateDisplay date={row.original.issue_date} />,
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
    [navigate],
  )

  const content = (
    <>
      <FilterBar>
        <SearchInput placeholder="Rechercher un numéro…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
          <option value="all">Toutes</option>
          <option value="draft">Brouillons</option>
          <option value="issued">En attente</option>
          <option value="paid">Payées</option>
          <option value="overdue">En retard</option>
          <option value="cancelled">Annulées</option>
        </Select>
      </FilterBar>

      <Card className="p-0">
        <DataTable
          columns={columns}
          data={invoices}
          loading={isLoading}
          error={error}
          emptyTitle="Aucune facture pour l'instant"
          emptyDescription="Crée ta première facture."
          emptyAction={<Button onClick={() => navigate(clientId ? `/factures/nouvelle?client=${clientId}` : '/factures/nouvelle')}>Créer une facture</Button>}
          getRowRibbonClassName={(row) => `ribbon-${STATUS_LABELS[row.status]?.state ?? 'neutral'}`}
          renderMobileCard={(invoice) => {
            const s = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.draft!
            return (
              <Card className="cursor-pointer" onClick={() => navigate(`/factures/${invoice.id}`)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{invoice.number ?? 'Brouillon'}</span>
                  <Badge state={s.state} label={s.label} />
                </div>
                <div className="mt-1 flex items-center justify-between text-sm text-slate">
                  <DateDisplay date={invoice.issue_date} />
                  <CurrencyDisplay amount={toMinorUnits(String(invoice.total))} currency={invoice.currency} />
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
        <h1 className="text-xl font-semibold text-ink">Factures</h1>
        <Button onClick={() => navigate('/factures/nouvelle')}>
          <Plus className="h-4 w-4" />
          Nouvelle facture
        </Button>
      </div>
      {content}
    </div>
  )
}

export function InvoicesIcon() {
  return <FileText className="h-5 w-5" />
}
