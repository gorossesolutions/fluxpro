import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Users, Archive, ArchiveRestore, FileText, FileSignature, Pencil } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterBar } from '@/components/ui/FilterBar'
import { Badge } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { Card } from '@/components/ui/Card'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
  const [editingClient, setEditingClient] = useState<ClientWithFinancials | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ClientWithFinancials | null>(null)

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
            <Tooltip content="Modifier le client">
              <Button variant="ghost" size="sm" aria-label="Modifier le client" onClick={() => setEditingClient(row.original)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Nouvelle facture pour ce client">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Nouvelle facture pour ce client"
                onClick={() => navigate(`/factures/nouvelle?client=${row.original.id}`)}
              >
                <FileText className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Nouveau devis pour ce client">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Nouveau devis pour ce client"
                onClick={() => navigate(`/devis/nouveau?client=${row.original.id}`)}
              >
                <FileSignature className="h-4 w-4" />
              </Button>
            </Tooltip>
            {row.original.archived_at ? (
              <Tooltip content="Désarchiver le client">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Désarchiver le client"
                  onClick={() => unarchiveClient.mutate(row.original.id)}
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Archiver le client (réversible, aucune donnée supprimée)">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Archiver le client"
                  onClick={() => setArchiveTarget(row.original)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    [navigate, unarchiveClient],
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
          {showArchived ? 'Voir les clients actifs' : 'Voir les clients archivés'}
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
      <ClientFormSheet open={editingClient !== null} onClose={() => setEditingClient(null)} client={editingClient ?? undefined} />
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (!archiveTarget) return
          archiveClient.mutate(archiveTarget.id)
          push('success', `« ${archiveTarget.name} » archivé — rien n'a été supprimé, retrouvable via "Voir les clients archivés"`)
        }}
        title="Archiver ce client ?"
        description={`« ${archiveTarget?.name} » sera masqué de la liste active. Aucune donnée n'est supprimée — factures et devis existants restent intacts, et tu peux le désarchiver à tout moment.`}
        confirmLabel="Archiver"
      />
    </div>
  )
}

export function ClientsListIcon() {
  return <Users className="h-5 w-5" />
}
