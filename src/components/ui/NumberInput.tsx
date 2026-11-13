import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { sanitizeDecimalInput } from '@/lib/decimalInput'

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean
  suffix?: string
  /** Max digits after the decimal separator. 2 by default (money, quantities); 0 for whole numbers. */
  decimals?: number
}

const REJECT_FLASH_MS = 1500

/** Money-aware numeric input: tabular figures, decimal-friendly inputmode, optional currency suffix.
 *
 * Every change is cleaned before it reaches the caller's onChange (plain controlled state or a
 * react-hook-form register() — both read e.target.value): comma → dot, spaces dropped, letters and
 * extra separators/decimals discarded. A dropped keystroke briefly flags the field in red with a
 * short message instead of silently letting an unparseable string through. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { className, invalid, suffix, decimals = 2, onChange, ...props },
  ref,
) {
  const [rejected, setRejected] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const raw = input.value
    const { value, rejected: dropped } = sanitizeDecimalInput(raw, decimals)

    if (value !== raw) {
      // Keep the caret where the user was typing rather than jumping to the end.
      const caret = input.selectionStart ?? value.length
      const shift = raw.length - value.length
      input.value = value
      const next = Math.max(0, Math.min(value.length, caret - shift))
      try {
        input.setSelectionRange(next, next)
      } catch {
        // some input modes don't support selection ranges — harmless
      }
    }

    if (dropped) {
      setRejected(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setRejected(false), REJECT_FLASH_MS)
    }

    onChange?.(event)
  }

  const showInvalid = invalid || rejected

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={showInvalid || undefined}
        className={cn(
          'tabular-nums h-11 w-full rounded-lg border bg-surface px-3 text-right text-base text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
          showInvalid ? 'border-overdue' : 'border-border',
          rejected && 'ring-2 ring-overdue/40',
          suffix && 'pr-16',
          className,
        )}
        onChange={handleChange}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate">
          {suffix}
        </span>
      )}
      {rejected && (
        <span
          role="status"
          className="pointer-events-none absolute -top-6 right-0 z-10 whitespace-nowrap rounded bg-overdue px-1.5 py-0.5 text-xs text-white shadow"
        >
          {decimals === 0 ? 'Chiffres uniquement' : `Chiffres uniquement (${decimals} décimales max)`}
        </span>
      )}
    </div>
  )
})
