import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastKind = 'success' | 'warning' | 'error' | 'info'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-paid" />,
  warning: <AlertTriangle className="h-5 w-5 text-pending" />,
  error: <XCircle className="h-5 w-5 text-overdue" />,
  info: <Info className="h-5 w-5 text-blue" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, kind, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2 sm:bottom-6 sm:right-6">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg',
              )}
            >
              {icons[t.kind]}
              <span className="text-sm text-ink">{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Fermer la notification" className="text-slate">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
