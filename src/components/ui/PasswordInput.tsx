import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean
}

/** Same visual footprint as Input, plus an accessible show/hide toggle — every password/hidden
 * field in the app should use this instead of a bare `<Input type="password">` so the user can
 * verify what they typed (API keys, credentials) before submitting. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, invalid, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        aria-invalid={invalid}
        className={cn(
          'h-11 w-full rounded-lg border bg-surface px-3 pr-11 text-base text-ink placeholder:text-slate/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
          invalid ? 'border-overdue' : 'border-border',
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})
