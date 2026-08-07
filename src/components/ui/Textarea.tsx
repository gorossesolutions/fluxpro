import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        'w-full rounded-lg border bg-surface px-3 py-2 text-base text-ink placeholder:text-slate/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
        invalid ? 'border-overdue' : 'border-border',
        className,
      )}
      {...props}
    />
  )
})
