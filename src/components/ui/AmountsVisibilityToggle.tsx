import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { setAmountsVisible, useAmountsVisible } from '@/lib/privacy'

interface AmountsVisibilityToggleProps {
  /** 'sidebar' = dark nav rail row; 'tab' = mobile bottom-bar slot. */
  variant: 'sidebar' | 'tab'
  /** Hide the text label (collapsed tablet rail). */
  labelClassName?: string
}

/** Eye toggle for privacy mode (see lib/privacy.ts). aria-pressed reflects "amounts visible". */
export function AmountsVisibilityToggle({ variant, labelClassName }: AmountsVisibilityToggleProps) {
  const visible = useAmountsVisible()
  const Icon = visible ? EyeOff : Eye
  const label = visible ? 'Masquer les montants' : 'Afficher les montants'

  if (variant === 'tab') {
    return (
      <button
        type="button"
        onClick={() => setAmountsVisible(!visible)}
        aria-pressed={visible}
        aria-label={label}
        className={cn(
          'flex min-h-[44px] flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-slate',
          visible && 'text-blue',
        )}
      >
        <Icon className="h-5 w-5" />
        Montants
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setAmountsVisible(!visible)}
      aria-pressed={visible}
      title={label}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className={labelClassName}>{label}</span>
    </button>
  )
}
