/** Shared between InvoiceEditorPage (setting terms on a draft) and InvoiceDetailPage (correcting
 * terms on an already-issued invoice — payment_terms/due_date are explicitly whitelisted as
 * still-mutable once locked, see fn_guard_invoice_immutability, 0003_functions.sql). */
export const PAYMENT_TERMS_PRESETS = [
  { label: 'À réception', days: 0 },
  { label: '15 jours', days: 15 },
  { label: '30 jours', days: 30 },
  { label: '45 jours', days: 45 },
  { label: '60 jours', days: 60 },
]

export function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
