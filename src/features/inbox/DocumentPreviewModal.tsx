import { useQuery } from '@tanstack/react-query'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { getErrorMessage } from '@/lib/errors'
import { getDocumentSignedUrl, type InboxDocument } from './api'

interface DocumentPreviewModalProps {
  document: InboxDocument | null
  onClose: () => void
}

/** Browsers can't reliably render these inline (HEIC has patchy support, anything without a
 * recognized mime type is a coin flip) — those get a direct "open in a new tab" link instead of
 * a broken/blank preview. */
function isInlinePreviewable(mimeType: string | null): 'image' | 'pdf' | null {
  if (!mimeType) return null
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/') && mimeType !== 'image/heic' && mimeType !== 'image/heif') return 'image'
  return null
}

export function DocumentPreviewModal({ document: doc, onClose }: DocumentPreviewModalProps) {
  const { data: url, isLoading, error } = useQuery({
    queryKey: ['document-preview-url', doc?.id],
    queryFn: () => getDocumentSignedUrl(doc!.storage_path),
    enabled: Boolean(doc),
  })

  const kind = isInlinePreviewable(doc?.mime_type ?? null)

  return (
    <Modal open={doc !== null} onClose={onClose} title={doc?.file_name ?? 'Document'} className="max-w-3xl">
      {isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg bg-overdue/5 p-4 text-sm text-overdue">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Impossible de charger l'aperçu : {getErrorMessage(error)}
        </div>
      ) : url ? (
        <div className="flex flex-col gap-3">
          {kind === 'image' && (
            <img src={url} alt={doc?.file_name} className="max-h-[65vh] w-full rounded-lg border border-border object-contain" />
          )}
          {kind === 'pdf' && <iframe src={url} title={doc?.file_name} className="h-[65vh] w-full rounded-lg border border-border" />}
          {kind === null && (
            <p className="rounded-lg bg-canvas p-4 text-sm text-slate">
              Aperçu non disponible pour ce type de fichier — ouvre-le dans un nouvel onglet.
            </p>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 self-start text-sm text-blue hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir dans un nouvel onglet
          </a>
        </div>
      ) : null}
    </Modal>
  )
}
