import { KpiCard } from '@/components/ui/KpiCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LayoutDashboard } from 'lucide-react'

/** Skeleton dashboard — full KPI row, charts and monthly table land in build step 6 (spec §5). */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Vue d'ensemble</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="CA encaissé ce mois" value="—" state="paid" />
        <KpiCard label="En attente" value="—" state="pending" />
        <KpiCard label="En retard" value="—" state="overdue" />
        <KpiCard label="Résultat net ce mois" value="—" state="neutral" />
      </div>

      <EmptyState
        icon={<LayoutDashboard className="h-8 w-8" />}
        title="Le tableau de bord complet arrive à l'étape 6"
        description="Graphiques, tableau mensuel et créances agées suivent le module Clients/Factures/Dépenses."
      />
    </div>
  )
}
