import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, FileText, FileSignature, MapPin, Merge, ExternalLink, Archive, ArchiveRestore, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { KpiCard } from '@/components/ui/KpiCard'
import { Tabs } from '@/components/ui/Tabs'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { toMinorUnits } from '@/lib/money'
import { formatMoney, formatPercent } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { useClient, useUpdateClient, useArchiveClient, useUnarchiveClient } from './api'
import { ClientFormSheet } from './ClientFormSheet'
import { MergeClientModal } from './MergeClientModal'
import { InvoicesListPage } from '@/features/invoices/InvoicesListPage'
import { QuotesListPage } from '@/features/quotes/QuotesListPage'
import { useQuoteAcceptanceRate } from '@/features/quotes/api'
import { useClientPayments } from '@/features/invoices/api'
import { useClientMatchedDocuments, getDocumentSignedUrl } from '@/features/inbox/api'

const TABS = [
  { id: 'factures', label: 'Factures' },
  { id: 'devis', label: 'Devis' },
  { id: 'paiements', label: 'Paiements' },
  { id: 'documents', label: 'Documents' },
  { id: 'notes', label: 'Notes' },
]

function ClientPaymentsTab({ clientId, navigate }: { clientId: string; navigate: (path: string) => void }) {
  const { data: payments = [], isLoading, error } = useClientPayments(clientId)

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (error) return <EmptyState title="Impossible de charger les paiements" description={getErrorMessage(error)} />
  if (payments.length === 0) {
    return <EmptyState title="Aucun paiement" description="S'affichera ici une fois les factures de ce client réglées." />
  }

  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <button onClick={() => navigate(`/factures/${p.invoice_id}`)} className="font-medium text-ink hover:text-blue">
                {p.invoice_number ?? 'Facture'}
              </button>
              <p className="text-xs text-slate">
                <DateDisplay date={p.payment_date} /> {p.method && `— ${p.method}`}
              </p>
            </div>
            <CurrencyDisplay amount={toMinorUnits(String(p.amount))} currency={p.currency} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ClientDocumentsTab({ clientId }: { clientId: string }) {
  const { push } = useToast()
  const { data: documents = [], isLoading, error } = useClientMatchedDocuments(clientId)

  const handlePreview = async (storagePath: string) => {
    try {
      const url = await getDocumentSignedUrl(storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      push('error', `Impossible d'ouvrir le fichier : ${getErrorMessage(err)}`)
    }
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (error) return <EmptyState title="Impossible de charger les documents" description={getErrorMessage(error)} />
  if (documents.length === 0) {
    return <EmptyState title="Aucun justificatif lié" description="Les documents rapprochés d'une facture de ce client apparaîtront ici." />
  }

  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <button onClick={() => void handlePreview(d.storage_path)} className="flex items-center gap-1.5 text-ink hover:text-blue">
              <span className="break-all">{d.file_name}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate" />
            </button>
            <DateDisplay date={d.created_at} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { push } = useToast()
  const { data: client, isLoading, error } = useClient(id)
  const { data: acceptanceRate } = useQuoteAcceptanceRate(id)
  const updateClient = useUpdateClient()
  const archiveClient = useArchiveClient()
  const unarchiveClient = useUnarchiveClient()
  const [activeTab, setActiveTab] = useState('factures')
  const [editOpen, setEditOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !client) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-overdue" />}
        title="Impossible de charger ce client"
        description={error ? getErrorMessage(error) : 'Ce client est introuvable.'}
      />
    )
  }

  const financials = client.financials

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
        <div className="flex flex-wrap gap-2">
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
          <Button variant="secondary" onClick={() => setMergeOpen(true)}>
            <Merge className="h-4 w-4" />
            Fusionner
          </Button>
          {client.archived_at ? (
            <Button variant="secondary" onClick={() => unarchiveClient.mutate(client.id)}>
              <ArchiveRestore className="h-4 w-4" />
              Désarchiver
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-4 w-4" />
              Archiver
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="CA total" value={formatMoney(toMinorUnits(String(financials?.ca_total_mur ?? 0)), 'MUR')} state="paid" />
        <KpiCard
          label="Encours"
          value={formatMoney(toMinorUnits(String(financials?.encours_mur ?? 0)), 'MUR')}
          state={financials?.has_overdue ? 'overdue' : 'pending'}
        />
        <KpiCard
          label="Délai de paiement moyen"
          value={financials?.avg_payment_delay_days != null ? `${Math.round(financials.avg_payment_delay_days)} j` : '—'}
          state={
            financials?.avg_payment_delay_days != null && financials.avg_payment_delay_days > 45
              ? 'overdue'
              : financials?.avg_payment_delay_days != null && financials.avg_payment_delay_days > 30
                ? 'pending'
                : 'neutral'
          }
        />
        <KpiCard label="Documents" value={String(financials?.invoice_count ?? 0)} state="neutral" />
        <KpiCard label="Taux d'acceptation devis" value={acceptanceRate != null ? formatPercent(acceptanceRate) : '—'} state="neutral" />
      </div>

      <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />

      {activeTab === 'factures' && <InvoicesListPage clientId={client.id} embedded />}
      {activeTab === 'devis' && <QuotesListPage clientId={client.id} embedded />}
      {activeTab === 'paiements' && <ClientPaymentsTab clientId={client.id} navigate={navigate} />}
      {activeTab === 'documents' && <ClientDocumentsTab clientId={client.id} />}
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
      <MergeClientModal open={mergeOpen} onClose={() => setMergeOpen(false)} currentClient={client} onMerged={() => {}} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          try {
            await archiveClient.mutateAsync(client.id)
            push('success', `« ${client.name} » archivé — rien n'a été supprimé, retrouvable via "Voir les clients archivés"`)
          } catch (err) {
            push('error', `Échec : ${getErrorMessage(err)}`)
          }
        }}
        title="Archiver ce client ?"
        description={`« ${client.name} » sera masqué de la liste active. Aucune donnée n'est supprimée — factures et devis existants restent intacts, et tu peux le désarchiver à tout moment.`}
        confirmLabel="Archiver"
      />
    </div>
  )
}
