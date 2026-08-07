import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './nav'

/** Mobile-only overflow screen for secondary nav items not in the bottom tab bar. */
export function MorePage() {
  const secondaryItems = NAV_ITEMS.filter((i) => !i.primary)

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-ink">Plus</h1>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {secondaryItems.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className="flex items-center gap-3 px-4 py-3.5 text-ink hover:bg-canvas">
              <item.icon className="h-5 w-5 text-slate" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
