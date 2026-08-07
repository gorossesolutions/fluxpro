import { cn } from '@/lib/cn'

export interface MagnitudeBarItem {
  label: string
  value: number
  /** Overrides the list-level color for this one bar — for an ordinal severity ramp (e.g.
   * aged-receivables buckets) where each step needs its own shade, rather than a plain
   * magnitude ranking where every bar shares one hue. */
  color?: string
}

interface MagnitudeBarListProps {
  items: MagnitudeBarItem[]
  formatValue: (value: number) => string
  /** Ranking one metric across categories is a magnitude job, not identity — every bar takes
   * the same single hue (dataviz skill: "sequential = one hue"), never a different color per
   * category. */
  color?: string
  className?: string
}

/** Horizontal ranked bar list — the default form for "compare magnitude across many
 * categories," per the dataviz skill's choosing-a-form table. Reads better than a pie for
 * more than a couple of slices and never needs a legend since every bar shares one hue. */
export function MagnitudeBarList({ items, formatValue, color = 'var(--color-chart-1)', className }: MagnitudeBarListProps) {
  const maxValue = Math.max(1, ...items.map((i) => i.value))

  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">{item.label}</span>
            <span className="tabular-nums text-slate">{formatValue(item.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (item.value / maxValue) * 100)}%`, backgroundColor: item.color ?? color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
