import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

type CheckboxProps = InputHTMLAttributes<HTMLInputElement>

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'peer h-5 w-5 shrink-0 appearance-none rounded border border-border bg-surface',
          'checked:border-blue checked:bg-blue',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1',
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden
        className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
      />
    </span>
  )
})
