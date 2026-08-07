import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/** Empty states are invitations, not dead ends — always pair with a next action (spec §15.4). */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      {icon && <div className="text-slate">{icon}</div>}
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate">{description}</p>}
      {action}
    </div>
  )
}
