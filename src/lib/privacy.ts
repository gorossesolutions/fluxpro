import { useCallback, useSyncExternalStore } from 'react'
import { formatMoney, formatMoneyMasked } from './format'
import type { MinorUnits } from './money'

/**
 * "Masquer les montants" privacy mode — protection against shoulder-surfing / screen sharing,
 * the same pattern banking apps use for balances.
 *
 * - Amounts are HIDDEN by default every time the app is opened.
 * - "Afficher les montants" reveals them for the current browser session only (sessionStorage):
 *   closing the tab/browser hides them again, so a reveal never silently carries over to the
 *   next time the platform is opened.
 * - Display only: PDFs, CSV exports and form inputs (what you're typing yourself) are unaffected.
 */
const STORAGE_KEY = 'fluxpro.amountsVisible'

function readInitial(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let visible = readInitial()
const listeners = new Set<() => void>()

export function setAmountsVisible(next: boolean) {
  visible = next
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, '1')
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable (private mode etc.) — state still works for this page load
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAmountsVisible(): boolean {
  return useSyncExternalStore(subscribe, () => visible, () => false)
}

/** Drop-in replacement for formatMoney in UI components: masks when privacy mode is on. */
export function useMoneyFormatter(): (minor: MinorUnits, currency: string) => string {
  const amountsVisible = useAmountsVisible()
  return useCallback(
    (minor: MinorUnits, currency: string) => (amountsVisible ? formatMoney(minor, currency) : formatMoneyMasked(currency)),
    [amountsVisible],
  )
}
