import { fromMinorUnits, type MinorUnits } from './money'

const CURRENCY_SYMBOLS: Record<string, string> = {
  MUR: 'Rs',
  EUR: '€',
  USD: '$',
  GBP: '£',
  ZAR: 'R',
  CAD: '$',
}

const numberFormatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: string): Intl.NumberFormat {
  const cached = numberFormatterCache.get(currency)
  if (cached) return cached
  const formatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  numberFormatterCache.set(currency, formatter)
  return formatter
}

/** Formats minor units as a French-locale amount, e.g. "1 234,56 €". */
export function formatMoney(minor: MinorUnits, currency: string): string {
  const amount = Number.parseFloat(fromMinorUnits(minor))
  const formatted = getFormatter(currency).format(amount)
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  return currency === 'MUR' ? `${symbol} ${formatted}` : `${formatted} ${symbol}`
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function formatPercent(rate: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 2 }).format(rate)
}
