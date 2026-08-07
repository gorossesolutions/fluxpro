import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        'h-11 w-full rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-slate/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
        invalid ? 'border-overdue' : 'border-border',
        className,
      )}
      {...props}
    />
  )
})
