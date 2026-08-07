import { EmptyState } from '@/components/ui/EmptyState'
import { Construction } from 'lucide-react'

/** Placeholder for modules scheduled in later build steps (see Build Order §19). */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <EmptyState
        icon={<Construction className="h-8 w-8" />}
        title="Ce module arrive dans une prochaine étape"
        description="Le schéma de données et la navigation sont en place ; l'interface complète suit l'ordre de construction du cahier des charges."
      />
    </div>
  )
}
