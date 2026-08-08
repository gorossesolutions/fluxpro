import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, MoreHorizontal, LogOut } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NAV_ITEMS } from './nav'
import { useAuth } from '@/features/auth/AuthContext'
import { useAutoRefreshFxRates } from '@/features/parametres/api'
import { useAutoVatRegistration } from '@/features/fiscalite/api'

/**
 * Four responsive nav treatments in one shell (spec §15.2):
 * mobile bottom tab bar, tablet collapsible icon rail, laptop+ persistent sidebar.
 */
export function AppLayout() {
  const [railOpen, setRailOpen] = useState(false)
  const { signOut } = useAuth()
  const primaryItems = NAV_ITEMS.filter((i) => i.primary)
  useAutoRefreshFxRates()
  useAutoVatRegistration()

  return (
    <div className="min-h-screen bg-canvas">
      {/* Tablet+ nav: icon rail (collapsible) up to laptop, persistent sidebar at laptop+ */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-navy transition-[width] duration-200 sm:flex',
          railOpen ? 'w-60' : 'w-16',
          'lg:w-60',
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4">
          <button
            onClick={() => setRailOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="Basculer le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className={cn('text-lg font-semibold text-white', !railOpen && 'sm:hidden', 'lg:inline')}>
            FluxPro
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white',
                  isActive && 'bg-blue text-white hover:bg-blue',
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={cn(!railOpen && 'sm:hidden', 'lg:inline')}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-2">
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={cn(!railOpen && 'sm:hidden', 'lg:inline')}>Déconnexion</span>
          </button>
        </div>
      </aside>

      <main className="pb-20 sm:pb-0 sm:pl-16 lg:pl-60">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile nav: bottom tab bar (spec §15.2) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface sm:hidden">
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-h-[44px] flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-slate',
                isActive && 'text-blue',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label.split(' ')[0]}
          </NavLink>
        ))}
        <NavLink
          to="/plus"
          className={({ isActive }) =>
            cn(
              'flex min-h-[44px] flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-slate',
              isActive && 'text-blue',
            )
          }
        >
          <MoreHorizontal className="h-5 w-5" />
          Plus
        </NavLink>
      </nav>
    </div>
  )
}
