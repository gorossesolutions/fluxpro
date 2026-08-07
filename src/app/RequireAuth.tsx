import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { Skeleton } from '@/components/ui/Skeleton'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Skeleton className="h-10 w-40" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/connexion" replace />
  }

  return <>{children}</>
}
