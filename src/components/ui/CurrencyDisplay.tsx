import type { MinorUnits } from '@/lib/money'
import { cn } from '@/lib/cn'
import { useAmountsVisible, useMoneyFormatter } from '@/lib/privacy'

interface CurrencyDisplayProps {
  amount: MinorUnits
  currency: string
  className?: string
}

/** Displays an amount, masked while privacy mode is on (lib/privacy.ts). */
export function CurrencyDisplay({ amount, currency, className }: CurrencyDisplayProps) {
  const visible = useAmountsVisible()
  const fmt = useMoneyFormatter()
  return (
    <span className={cn('tabular-nums', className)} aria-label={visible ? undefined : 'Montant masqué'}>
      {fmt(amount, currency)}
    </span>
  )
}
