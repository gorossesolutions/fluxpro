import type { ReactNode } from 'react'
import { StatusRibbon } from './StatusRibbon'
import type { SemanticState } from './Badge'
import { cn } from '@/lib/cn'

interface KpiCardProps {
  label: string
  value: string
  state?: SemanticState
  trend?: ReactNode
  icon?: ReactNode
  className?: string
}

export function KpiCard({ label, value, state = 'neutral', trend, icon, className }: KpiCardProps) {
  return (
    <StatusRibbon
      state={state}
      edge="top"
      className={cn('rounded-xl border border-border bg-surface p-4 shadow-sm', className)}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm text-slate">{label}</span>
        {icon}
      </div>
      <p className="tabular-nums mt-2 text-2xl font-semibold text-ink">{value}</p>
      {trend && <div className="mt-1 text-xs text-slate">{trend}</div>}
    </StatusRibbon>
  )
}
