import { useNavigate, useRouteError } from 'react-router-dom'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { getErrorMessage } from '@/lib/errors'

/** Per-page error boundary (errorElement on every child route): a render crash inside one page
 * keeps the app shell and navigation on screen with a readable message, instead of React Router's
 * raw "Unexpected Application Error" replacing the whole app. */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  if (import.meta.env.DEV) console.error(error)

  return (
    <EmptyState
      icon={<AlertTriangle className="h-8 w-8 text-overdue" />}
      title="Cette page a rencontré une erreur"
      description={`${getErrorMessage(error)} — recharge la page pour réessayer. Si le problème persiste, note ce qui a été saisi juste avant.`}
      action={
        <Button variant="secondary" onClick={() => navigate(0)}>
          <RotateCcw className="h-4 w-4" />
          Réessayer
        </Button>
      }
    />
  )
}
