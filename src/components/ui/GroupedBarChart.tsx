import { useState } from 'react'
import { cn } from '@/lib/cn'

export interface GroupedBarChartSeries {
  label: string
  color: string
  values: number[]
}

interface GroupedBarChartProps {
  categories: string[]
  series: GroupedBarChartSeries[]
  formatValue: (value: number) => string
  height?: number
  className?: string
}

const BAR_MAX_WIDTH = 20
const BAR_GAP = 2

/**
 * Minimal grouped bar chart (dataviz skill mark specs): thin bars capped at 20px, 4px rounded
 * data-end / square baseline, a 2px surface gap between touching bars, hairline recessive
 * gridlines, and a legend whenever there's more than one series. No per-bar direct labels — a
 * 12-month chart with one on every bar is exactly the "label everything = nothing gets read"
 * case the skill warns about; the axis + native tooltip carry the value instead.
 */
export function GroupedBarChart({ categories, series, formatValue, height = 220, className }: GroupedBarChartProps) {
  const [hovered, setHovered] = useState<{ categoryIndex: number; seriesIndex: number } | null>(null)

  const padding = { top: 16, right: 12, bottom: 28, left: 12 }
  const innerHeight = height - padding.top - padding.bottom
  const maxValue = Math.max(1, ...series.flatMap((s) => s.values))
  // Round the axis top up to a clean 1/2/5×10^n step rather than the raw max, so gridline
  // labels read as round numbers instead of an arbitrary data-dependent value.
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)))
  const normalized = maxValue / magnitude
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const yMax = niceStep * magnitude

  const groupWidth = 64
  const width = categories.length * groupWidth + padding.left + padding.right
  const barsPerGroup = series.length
  const barWidth = Math.min(BAR_MAX_WIDTH, (groupWidth - BAR_GAP * (barsPerGroup + 1)) / barsPerGroup)

  const yScale = (value: number) => innerHeight - (value / yMax) * innerHeight

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {series.length > 1 && (
        <div className="flex items-center gap-4 text-xs text-slate">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        role="img"
        aria-label={`Graphique en barres : ${series.map((s) => s.label).join(', ')} par mois`}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ minWidth: width }}
      >
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {gridLines.map((v) => (
            <g key={v}>
              <line x1={0} x2={width - padding.left - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={0} y={yScale(v) - 4} className="fill-slate text-[10px] tabular-nums">
                {formatValue(v)}
              </text>
            </g>
          ))}

          {categories.map((category, categoryIndex) => {
            const groupX = categoryIndex * groupWidth
            return (
              <g key={category}>
                {series.map((s, seriesIndex) => {
                  const value = s.values[categoryIndex] ?? 0
                  const barHeight = Math.max(0, innerHeight - yScale(value))
                  const x = groupX + BAR_GAP + seriesIndex * (barWidth + BAR_GAP)
                  const isHovered = hovered?.categoryIndex === categoryIndex && hovered?.seriesIndex === seriesIndex
                  return (
                    <rect
                      key={s.label}
                      x={x}
                      y={yScale(value)}
                      width={barWidth}
                      height={barHeight}
                      rx={4}
                      fill={s.color}
                      opacity={isHovered ? 0.85 : 1}
                      onMouseEnter={() => setHovered({ categoryIndex, seriesIndex })}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <title>
                        {s.label} — {category} : {formatValue(value)}
                      </title>
                    </rect>
                  )
                })}
                <text
                  x={groupX + groupWidth / 2 - BAR_GAP}
                  y={innerHeight + 18}
                  textAnchor="middle"
                  className="fill-slate text-[10px]"
                >
                  {category}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
