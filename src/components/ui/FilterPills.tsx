import { cn } from '@/lib/cn'
import type { SemanticState } from './Badge'

export interface FilterPillOption {
  value: string
  label: string
  /** 'all' renders as a neutral blue accent, distinct from any real status colour so it never
   * visually collides with an actual "neutral" status (e.g. Brouillon/Annulée share that
   * colour and are told apart by label only, same principle as Badge itself). */
  state: SemanticState | 'all'
}

const activeClasses: Record<SemanticState | 'all', string> = {
  all: 'border-blue bg-blue text-white',
  paid: 'border-paid bg-paid text-white',
  pending: 'border-pending bg-pending text-white',
  overdue: 'border-overdue bg-overdue text-white',
  neutral: 'border-neutral-doc bg-neutral-doc text-white',
}

interface FilterPillsProps {
  options: FilterPillOption[]
  value: string
  onChange: (value: string) => void
  'aria-label': string
}

/** Single-select status filter, styled as tags/pills rather than a dropdown — colour-matched
 * to the same SemanticState used by Badge in the table rows, so the active pill visually
 * previews the rows it filters to. */
export function FilterPills({ options, value, onChange, 'aria-label': ariaLabel }: FilterPillsProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2',
              active ? activeClasses[opt.state] : 'border-border bg-surface text-slate hover:bg-canvas',
            )}
          >
            {opt.state !== 'all' && (
              <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-current' : 'bg-current opacity-60')} />
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
