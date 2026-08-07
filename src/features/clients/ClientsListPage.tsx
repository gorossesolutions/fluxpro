import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Users, Archive, ArchiveRestore, FileText, FileSignature } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterBar } from '@/components/ui/FilterBar'
import { Badge } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { toMinorUnits } from '@/lib/money'
import { useClients, useArchiveClient, useUnarchiveClient, type ClientWithFinancials } from './api'
import { ClientFormSheet } from './ClientFormSheet'

export function ClientsListPage() {
  const navigate = useNavigate()
  const { push } = useToast()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: clients = [], isLoading, error } = useClients({ search, showArchived })
  const archiveClient = useArchiveClient()
  const unarchiveClient = useUnarchiveClient()

  const columns = useMemo<ColumnDef<ClientWithFinancials, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nom / Société',
        cell: ({ row }) => (
          <button onClick={() => navigate(`/clients/${row.original.id}`)} className="font-medium text-ink hover:text-blue">
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: 'country_code',
        header: 'Pays',
        cell: ({ row }) => row.original.country_code ?? <span className="text-slate/60">à compléter</span>,
      },
      {
        accessorKey: 'identifier_value',
        header: 'Identifiant',
        cell: ({ row }) => row.original.identifier_value ?? <span className="text-slate/60">—</span>,
      },
      { accessorKey: 'email', header: 'Email' },
      { accessorKey: 'default_currency', header: 'Devise' },
      {
        id: 'ca_total',
        header: 'CA total',
        cell: ({ row }) => (
          <CurrencyDisplay amount={toMinorUnits(String(row.original.financials?.ca_total_mur ?? 0))} currency="MUR" />
        ),
      },
      {
        id: 'encours',
        header: 'Encours',
        cell: ({ row }) => {
          const encours = row.original.financials?.encours_mur ?? 0
          const overdue = row.original.financials?.has_overdue
          if (encours === 0) return <span className="text-slate/60">—</span>
          return (
            <Badge state={overdue ? 'overdue' : 'pending'} label={`${new Intl.NumberFormat('fr-FR').format(encours)} Rs`} />
          )
        },
      },
      {
        id: 'last_invoice',
        header: 'Dernier document',
        cell: ({ row }) =>
          row.original.financials?.last_invoice_date ? <DateDisplay date={row.original.financials.last_invoice_date} /> : '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/factures/nouvelle?client=${row.original.id}`)}>
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/devis/nouveau?client=${row.original.id}`)}>
              <FileSignature className="h-4 w-4" />
            </Button>
            {row.original.archived_at ? (
              <Button variant="ghost" size="sm" onClick={() => unarchiveClient.mutate(row.original.id)}>
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  archiveClient.mutate(row.original.id)
                  push('success', 'Client archivé')
                }}
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [navigate, archiveClient, unarchiveClient, push],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Clients</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouveau client
        </Button>
      </div>

      <FilterBar>
        <SearchInput
          placeholder="Rechercher par nom, email, identifiant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button variant={showArchived ? 'primary' : 'secondary'} size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Archivés' : 'Actifs'}
        </Button>
      </FilterBar>

      <Card className="p-0">
        <DataTable
          columns={columns}
          data={clients}
          loading={isLoading}
          error={error}
          emptyTitle="Aucun client pour l'instant"
          emptyDescription="Crée ton premier client, ou laisse-le se créer automatiquement depuis une facture."
          emptyAction={<Button onClick={() => setCreateOpen(true)}>Créer un client</Button>}
          renderMobileCard={(client) => (
            <Card
              className="ribbon-left cursor-pointer"
              style={{ ['--ribbon-color' as string]: client.financials?.has_overdue ? 'var(--color-overdue)' : 'var(--color-neutral-doc)' }}
              onClick={() => navigate(`/clients/${client.id}`)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{client.name}</span>
                <span className="text-sm text-slate">{client.country_code ?? 'à compléter'}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-slate">
                <span>{client.email}</span>
                <CurrencyDisplay amount={toMinorUnits(String(client.financials?.ca_total_mur ?? 0))} currency="MUR" />
              </div>
            </Card>
          )}
        />
      </Card>

      <ClientFormSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

export function ClientsListIcon() {
  return <Users className="h-5 w-5" />
}
