import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean
}

/** Wraps the native date input (locale-aware, accessible, no bundle cost) styled to match the design system. */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      aria-invalid={invalid}
      className={cn(
        'tabular-nums h-11 w-full rounded-lg border bg-surface px-3 text-base text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
        invalid ? 'border-overdue' : 'border-border',
        className,
      )}
      {...props}
    />
  )
})
