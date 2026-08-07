import type { ReactNode, CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import type { SemanticState } from './Badge'

const ribbonColorVar: Record<SemanticState, string> = {
  paid: 'var(--color-paid)',
  pending: 'var(--color-pending)',
  overdue: 'var(--color-overdue)',
  neutral: 'var(--color-neutral-doc)',
}

interface StatusRibbonProps {
  state: SemanticState
  edge?: 'top' | 'left'
  children: ReactNode
  className?: string
}

/** The signature element (spec §15.1): a 3px ribbon carrying semantic colour, edge depends on layout context. */
export function StatusRibbon({ state, edge = 'top', children, className }: StatusRibbonProps) {
  const style = { '--ribbon-color': ribbonColorVar[state] } as CSSProperties
  return (
    <div style={style} className={cn(edge === 'top' ? 'ribbon-top' : 'ribbon-left', className)}>
      {children}
    </div>
  )
}
