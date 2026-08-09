import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean
  suffix?: string
}

/** Money-aware numeric input: tabular figures, decimal-friendly inputmode, optional currency suffix. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { className, invalid, suffix, ...props },
  ref,
) {
  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        aria-invalid={invalid}
        className={cn(
          'tabular-nums h-11 w-full rounded-lg border bg-surface px-3 text-right text-base text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
          invalid ? 'border-overdue' : 'border-border',
          suffix && 'pr-16',
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate">
          {suffix}
        </span>
      )}
    </div>
  )
})
