import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * List filters that survive leaving the page: open an invoice from a filtered list, come back
 * (browser back, the "Retour" button or the sidebar link) and the same filters are still applied.
 *
 * Two layers, the usual pattern for list views:
 * - URL query string (when `syncUrl`): the page's real state — browser back/forward and a copied
 *   link both restore it exactly.
 * - localStorage: the last-used filters per list, re-applied when the page is reached through a
 *   plain link without any query string (sidebar, "Retour" buttons) and across visits.
 *
 * Every value is a string; an empty string means "not set" and is left out of the URL.
 * Embedded lists (e.g. a client's "Factures" tab) pass syncUrl: false and use their own key.
 */
export function usePersistentFilters<T extends Record<string, string>>(
  storageKey: string,
  defaults: T,
  { syncUrl }: { syncUrl: boolean },
): [T, (patch: Partial<T>) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const keys = Object.keys(defaults) as (keyof T & string)[]

  const [filters, setFilters] = useState<T>(() => {
    if (syncUrl && keys.some((k) => searchParams.has(k))) {
      return Object.fromEntries(keys.map((k) => [k, searchParams.get(k) ?? defaults[k]])) as T
    }
    return { ...defaults, ...readStored<T>(storageKey, keys) }
  })

  const writeUrl = useCallback(
    (next: T) => {
      if (!syncUrl) return
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          for (const k of keys) {
            if (next[k]) params.set(k, next[k])
            else params.delete(k)
          }
          return params
        },
        { replace: true },
      )
    },
    // keys is derived from the static defaults object's shape
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncUrl, setSearchParams],
  )

  // Restored from storage on a bare URL → reflect it in the URL once, so back/forward and
  // copied links match what's on screen.
  const syncedOnMount = useRef(false)
  useEffect(() => {
    if (syncedOnMount.current) return
    syncedOnMount.current = true
    if (syncUrl && !keys.some((k) => searchParams.has(k)) && keys.some((k) => filters[k])) writeUrl(filters)
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Side effects (storage, URL) stay out of the state updater, which React may call twice.
  const current = useRef(filters)
  current.current = filters
  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...current.current, ...patch }
      current.current = next
      setFilters(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // storage unavailable — filters still work for this visit
      }
      writeUrl(next)
    },
    [storageKey, writeUrl],
  )

  return [filters, update]
}

function readStored<T>(storageKey: string, keys: string[]): Partial<T> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      keys.flatMap((k) => {
        const v = (parsed as Record<string, unknown>)[k]
        return typeof v === 'string' ? [[k, v]] : []
      }),
    ) as Partial<T>
  } catch {
    return {}
  }
}

/** "draft,issued" ⇄ ['draft', 'issued'] */
export const splitList = (value: string): string[] => (value ? value.split(',').filter(Boolean) : [])
export const joinList = (values: string[]): string => values.join(',')
