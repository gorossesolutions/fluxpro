import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string) => void
  onSearch: (query: string) => void
  onCreate?: (query: string) => void
  placeholder?: string
  createLabel?: (query: string) => string
  invalid?: boolean
  id?: string
}

/**
 * Searchable combobox with an inline "+ Créer «…»" entry (spec §6.4) — used for the client
 * picker on invoices/quotes so a new client never breaks the document-creation flow.
 */
export function Combobox({
  options,
  value,
  onChange,
  onSearch,
  onCreate,
  placeholder,
  createLabel,
  invalid,
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-invalid={invalid}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-lg border bg-surface px-3 text-left text-base text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
          invalid ? 'border-overdue' : 'border-border',
        )}
      >
        <span className={selected ? 'text-ink' : 'text-slate/60'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 text-slate" />
      </button>

      {/* open dropdown: z-40, must clear the invoice/quote editor's fixed sticky-totals bar
          (z-20) — same z-index + later in the DOM was making that bar win the stacking tie
          and visually cover the dropdown the instant it opened, so clicks landed on the bar
          instead of any option underneath it. */}
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {/* No autoFocus: on a touch device, focusing this the instant the dropdown opens
              immediately pops the on-screen keyboard, which resizes/shifts the whole layout
              mid-tap — touch browsers read that as a scroll gesture and cancel the tap, which
              is very likely what made picking an option look like it "flashed and became
              unusable." Desktop users can still just click into the field to search. */}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              onSearch(e.target.value)
            }}
            placeholder="Rechercher…"
            className="w-full border-b border-border px-3 py-2 text-sm text-ink focus:outline-none"
          />
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                    setQuery('')
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-canvas"
                >
                  <span className="text-ink">{option.label}</span>
                  {option.sublabel && <span className="text-xs text-slate">{option.sublabel}</span>}
                </button>
              </li>
            ))}
            {onCreate && query.trim() && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCreate(query.trim())
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-blue hover:bg-blue-pale"
                >
                  <Plus className="h-4 w-4" />
                  {createLabel ? createLabel(query.trim()) : `Créer « ${query.trim()} »`}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
