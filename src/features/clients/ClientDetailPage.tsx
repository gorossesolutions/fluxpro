import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, FileText, FileSignature, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { KpiCard } from '@/components/ui/KpiCard'
import { Tabs } from '@/components/ui/Tabs'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { toMinorUnits } from '@/lib/money'
import { formatMoney } from '@/lib/format'
import { useClient, useUpdateClient } from './api'
import { ClientFormSheet } from './ClientFormSheet'
import { InvoicesListPage } from '@/features/invoices/InvoicesListPage'
import { QuotesListPage } from '@/features/quotes/QuotesListPage'

const TABS = [
  { id: 'factures', label: 'Factures' },
  { id: 'devis', label: 'Devis' },
  { id: 'paiements', label: 'Paiements' },
  { id: 'documents', label: 'Documents' },
  { id: 'notes', label: 'Notes' },
]

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading } = useClient(id)
  const updateClient = useUpdateClient()
  const [activeTab, setActiveTab] = useState('factures')
  const [editOpen, setEditOpen] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)

  if (isLoading || !client) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const financials = client.financials
  const acceptanceRate = null // wired once quotes stats are available

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{client.name}</h1>
              <Badge state={client.archived_at ? 'neutral' : 'paid'} label={client.archived_at ? 'Archivé' : 'Actif'} />
            </div>
            <p className="flex items-center gap-1 text-sm text-slate">
              {client.country_code ? (
                <>
                  <MapPin className="h-3.5 w-3.5" /> {client.country_code} — {client.identifier_value ?? 'identifiant à compléter'}
                </>
              ) : (
                'Pays et identifiant à compléter'
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate(`/devis/nouveau?client=${client.id}`)}>
            <FileSignature className="h-4 w-4" />
            Nouveau devis
          </Button>
          <Button onClick={() => navigate(`/factures/nouvelle?client=${client.id}`)}>
            <FileText className="h-4 w-4" />
            Nouvelle facture
          </Button>
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Modifier
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="CA total" value={formatMoney(toMinorUnits(String(financials?.ca_total_mur ?? 0)), 'MUR')} state="paid" />
        <KpiCard
          label="Encours"
          value={formatMoney(toMinorUnits(String(financials?.encours_mur ?? 0)), 'MUR')}
          state={financials?.has_overdue ? 'overdue' : 'pending'}
        />
        <KpiCard label="Documents" value={String(financials?.invoice_count ?? 0)} state="neutral" />
        <KpiCard label="Taux d'acceptation devis" value={acceptanceRate ?? '—'} state="neutral" />
      </div>

      <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />

      {activeTab === 'factures' && <InvoicesListPage clientId={client.id} embedded />}
      {activeTab === 'devis' && <QuotesListPage clientId={client.id} embedded />}
      {activeTab === 'paiements' && (
        <EmptyState title="Historique des paiements" description="S'affichera ici une fois les factures de ce client réglées." />
      )}
      {activeTab === 'documents' && (
        <EmptyState title="Justificatifs liés" description="Les documents rattachés aux factures de ce client apparaîtront ici." />
      )}
      {activeTab === 'notes' && (
        <Card>
          <Textarea
            rows={6}
            defaultValue={client.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes internes sur ce client…"
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              disabled={notes === null || updateClient.isPending}
              onClick={() => notes !== null && updateClient.mutate({ id: client.id, updates: { notes } })}
            >
              Enregistrer les notes
            </Button>
          </div>
        </Card>
      )}

      <ClientFormSheet open={editOpen} onClose={() => setEditOpen(false)} client={client} />
    </div>
  )
}
