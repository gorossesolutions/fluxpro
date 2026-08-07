import { cn } from '@/lib/cn'

export type SemanticState = 'paid' | 'pending' | 'overdue' | 'neutral'

const stateClasses: Record<SemanticState, string> = {
  paid: 'bg-paid/10 text-paid',
  pending: 'bg-pending/10 text-pending',
  overdue: 'bg-overdue/10 text-overdue',
  neutral: 'bg-neutral-doc/10 text-neutral-doc',
}

const stateLabels: Record<SemanticState, string> = {
  paid: 'Payée',
  pending: 'En attente',
  overdue: 'En retard',
  neutral: 'Brouillon',
}

interface BadgeProps {
  state: SemanticState
  label?: string
  className?: string
}

/** State is always colour + text label together — never colour alone (WCAG 2.2). */
export function Badge({ state, label, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        stateClasses[state],
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? stateLabels[state]}
    </span>
  )
}
