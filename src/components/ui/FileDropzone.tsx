import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/cn'

interface FileDropzoneProps {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  maxSizeMb?: number
  className?: string
}

/** Capture-first drop zone for the Documents inbox (spec §10) — also embeddable inline on expense/invoice forms. */
export function FileDropzone({ onFiles, accept = 'application/pdf,image/*', multiple = true, maxSizeMb = 10, className }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const files = Array.from(fileList).filter((f) => f.size <= maxSizeMb * 1024 * 1024)
    if (files.length) onFiles(files)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors duration-150',
        dragging ? 'border-blue bg-blue-pale' : 'border-border bg-canvas',
        className,
      )}
    >
      <UploadCloud className="h-8 w-8 text-slate" aria-hidden />
      <p className="text-sm font-medium text-ink">Dépose tes justificatifs ici</p>
      <p className="text-xs text-slate">PDF, JPG, PNG, HEIC — {maxSizeMb} Mo max par fichier</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
