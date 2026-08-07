import { formatMoney } from '@/lib/format'
import type { MinorUnits } from '@/lib/money'
import { cn } from '@/lib/cn'

interface CurrencyDisplayProps {
  amount: MinorUnits
  currency: string
  className?: string
}

export function CurrencyDisplay({ amount, currency, className }: CurrencyDisplayProps) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(amount, currency)}</span>
}
