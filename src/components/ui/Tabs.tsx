import { cn } from '@/lib/cn'

interface Tab {
  id: string
  label: string
  badge?: number
}

interface TabsProps {
  tabs: Tab[]
  activeId: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-150',
              active ? 'border-blue text-blue' : 'border-transparent text-slate hover:text-ink',
            )}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="rounded-full bg-blue-pale px-1.5 py-0.5 text-xs text-blue">{tab.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
