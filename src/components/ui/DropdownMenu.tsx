import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface DropdownMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  destructive?: boolean
}

interface DropdownMenuProps {
  trigger: ReactNode
  items: DropdownMenuItem[]
  align?: 'left' | 'right'
}

/** Text-labelled action menu — for actions that were confusing as bare icons (spec §15.4:
 * icon-only controls need a label or a tooltip at minimum; a menu of text items removes the
 * ambiguity entirely for less-frequent actions grouped together). No autoFocus/text input
 * inside, so this doesn't have the touch-keyboard-layout-shift problem Combobox had. */
export function DropdownMenu({ trigger, items, align = 'right' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={rootRef} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-canvas',
                item.destructive ? 'text-overdue' : 'text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
