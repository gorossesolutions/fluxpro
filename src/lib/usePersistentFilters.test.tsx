import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { usePersistentFilters, splitList, joinList } from './usePersistentFilters'

// Node 22+ ships its own (unconfigured) global localStorage that shadows jsdom's in vitest.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
})

const KEY = 'test.filters'
const DEFAULTS = { q: '', statut: '' }

function wrapperAt(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
}

function useUnderTest(syncUrl = true) {
  const [filters, set] = usePersistentFilters(KEY, DEFAULTS, { syncUrl })
  const location = useLocation()
  return { filters, set, search: location.search }
}

describe('usePersistentFilters', () => {
  beforeEach(() => localStorage.clear())

  it('writes changes to the URL and to storage', () => {
    const { result } = renderHook(() => useUnderTest(), { wrapper: wrapperAt('/factures') })
    act(() => result.current.set({ statut: 'draft' }))
    expect(result.current.filters.statut).toBe('draft')
    expect(result.current.search).toBe('?statut=draft')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ q: '', statut: 'draft' })
  })

  it('restores the last filters when coming back on a bare URL (e.g. sidebar link)', () => {
    localStorage.setItem(KEY, JSON.stringify({ q: '', statut: 'draft,issued' }))
    const { result } = renderHook(() => useUnderTest(), { wrapper: wrapperAt('/factures') })
    expect(result.current.filters.statut).toBe('draft,issued')
    expect(result.current.search).toBe('?statut=draft%2Cissued')
  })

  it('prefers explicit URL params over storage (back button / shared link)', () => {
    localStorage.setItem(KEY, JSON.stringify({ q: '', statut: 'draft' }))
    const { result } = renderHook(() => useUnderTest(), { wrapper: wrapperAt('/factures?statut=paid') })
    expect(result.current.filters.statut).toBe('paid')
  })

  it('does not touch the URL when embedded', () => {
    const { result } = renderHook(() => useUnderTest(false), { wrapper: wrapperAt('/clients/1') })
    act(() => result.current.set({ q: 'F-2026' }))
    expect(result.current.search).toBe('')
    expect(JSON.parse(localStorage.getItem(KEY)!).q).toBe('F-2026')
  })

  it('splits and joins status lists', () => {
    expect(splitList('')).toEqual([])
    expect(splitList('draft,paid')).toEqual(['draft', 'paid'])
    expect(joinList(['draft', 'paid'])).toBe('draft,paid')
  })
})
