import { useState } from 'react'
import { Archive, ArchiveRestore, FolderOpen, Link2, Link2Off, ExternalLink } from 'lucide-react'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DateDisplay } from '@/components/ui/DateDisplay'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { getErrorMessage } from '@/lib/errors'
import {
  useDocuments,
  useUnmatchedDocumentCount,
  useUploadDocuments,
  useArchiveDocument,
  useRestoreDocument,
  useUnmatchDocument,
  getDocumentSignedUrl,
  type InboxDocument,
} from './api'
import { DocumentMatchModal } from './DocumentMatchModal'

export function DocumentsInboxPage() {
  const { push } = useToast()
  const [activeTab, setActiveTab] = useState<'unmatched' | 'matched'>('unmatched')
  const [showArchived, setShowArchived] = useState(false)
  const [matchingDoc, setMatchingDoc] = useState<InboxDocument | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<InboxDocument | null>(null)

  const { data: documents = [], isLoading } = useDocuments({ status: showArchived ? 'all' : activeTab, showArchived })
  const uploadDocuments = useUploadDocuments()
  const archiveDocument = useArchiveDocument()
  const restoreDocument = useRestoreDocument()
  const unmatchDocument = useUnmatchDocument()

  const { data: unmatchedCount = 0 } = useUnmatchedDocumentCount()

  const handleFiles = async (files: File[]) => {
    try {
      await uploadDocuments.mutateAsync(files)
      push('success', files.length > 1 ? `${files.length} justificatifs déposés` : 'Justificatif déposé')
    } catch (err) {
      push('error', `Échec du dépôt : ${getErrorMessage(err)}`)
    }
  }

  const handlePreview = async (doc: InboxDocument) => {
    try {
      const url = await getDocumentSignedUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      push('error', `Impossible d'ouvrir le fichier : ${getErrorMessage(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Documents</h1>
        <Button variant={showArchived ? 'primary' : 'secondary'} size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Voir les documents actifs' : 'Voir les documents archivés'}
        </Button>
      </div>

      <FileDropzone onFiles={(files) => void handleFiles(files)} />

      {!showArchived && (
        <Tabs
          tabs={[
            { id: 'unmatched', label: 'À classer', badge: unmatchedCount },
            { id: 'matched', label: 'Rapprochés' },
          ]}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'unmatched' | 'matched')}
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title={showArchived ? 'Aucun document archivé' : 'Aucun document ici'}
          description="Dépose un reçu, une facture fournisseur ou tout autre justificatif ci-dessus — il apparaîtra ici immédiatement."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => void handlePreview(doc)}
                  className="flex items-center gap-1.5 text-left text-sm font-medium text-ink hover:text-blue"
                >
                  <span className="line-clamp-2 break-all">{doc.file_name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate" />
                </button>
                <Badge state={doc.status === 'matched' ? 'paid' : 'pending'} label={doc.status === 'matched' ? 'Rapproché' : 'À classer'} />
              </div>

              <p className="text-xs text-slate">
                Déposé le <DateDisplay date={doc.created_at} />
              </p>
              {doc.detected_amount != null && (
                <p className="text-xs text-slate">
                  Détecté : {doc.detected_amount} {doc.detected_date && <> — <DateDisplay date={doc.detected_date} /></>}
                </p>
              )}

              <div className="mt-1 flex items-center gap-1">
                {doc.deleted_at ? (
                  <Tooltip content="Restaurer le document">
                    <Button variant="ghost" size="sm" aria-label="Restaurer le document" onClick={() => restoreDocument.mutate(doc.id)}>
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                ) : (
                  <>
                    {doc.status === 'matched' ? (
                      <Tooltip content="Retirer la correspondance">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Retirer la correspondance"
                          onClick={() => unmatchDocument.mutate(doc.id)}
                        >
                          <Link2Off className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    ) : (
                      <Tooltip content="Faire correspondre">
                        <Button variant="ghost" size="sm" aria-label="Faire correspondre" onClick={() => setMatchingDoc(doc)}>
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip content="Archiver le document">
                      <Button variant="ghost" size="sm" aria-label="Archiver le document" onClick={() => setArchiveTarget(doc)}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <DocumentMatchModal document={matchingDoc} onClose={() => setMatchingDoc(null)} />
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (!archiveTarget) return
          archiveDocument.mutate(archiveTarget.id)
          push('success', `« ${archiveTarget.file_name} » archivé`)
        }}
        title="Archiver ce document ?"
        description="Il sera masqué de la liste active. Aucune donnée n'est supprimée, et tu peux le restaurer à tout moment."
        confirmLabel="Archiver"
      />
    </div>
  )
}

export function DocumentsInboxIcon() {
  return <FolderOpen className="h-5 w-5" />
}
