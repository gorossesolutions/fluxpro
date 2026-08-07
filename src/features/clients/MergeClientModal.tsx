import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { useClientSearch, useMergeClients, type Client } from './api'

interface MergeClientModalProps {
  open: boolean
  onClose: () => void
  currentClient: Client
  onMerged: () => void
}

/** Merges a duplicate client into the one currently open. Deliberately one-directional and
 * explicit about which record survives — the current client's page is always the "keep" side,
 * so there's no ambiguity about which name/address/identifier wins. */
export function MergeClientModal({ open, onClose, currentClient, onMerged }: MergeClientModalProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: candidates = [] } = useClientSearch(search)
  const mergeClients = useMergeClients()
  const { push } = useToast()

  const otherCandidates = candidates.filter((c) => c.id !== currentClient.id)
  const selected = otherCandidates.find((c) => c.id === selectedId)

  const handleMerge = async () => {
    if (!selectedId) return
    try {
      await mergeClients.mutateAsync({ keepId: currentClient.id, mergeId: selectedId })
      push('success', `Client fusionné dans « ${currentClient.name} »`)
      setSelectedId(null)
      onMerged()
      onClose()
    } catch (err) {
      push('error', `Échec de la fusion : ${(err as Error).message}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Fusionner un client dans « ${currentClient.name} »`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleMerge} disabled={!selectedId || mergeClients.isPending}>
            Fusionner
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate">
          Sélectionne le client en double à fusionner. Toutes ses factures et devis seront rattachés à «{' '}
          <strong>{currentClient.name}</strong> », et le client en double sera archivé (jamais supprimé). Cette
          action est irréversible.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Client à fusionner</label>
          <Combobox
            value={selectedId}
            onSearch={setSearch}
            onChange={setSelectedId}
            placeholder="Rechercher un client…"
            options={otherCandidates.map((c) => ({ value: c.id, label: c.name, sublabel: c.email ?? undefined }))}
          />
        </div>
        {selected && (
          <div className="rounded-lg bg-overdue/5 p-3 text-sm text-overdue">
            «&nbsp;{selected.name}&nbsp;» ({selected.email ?? 'sans email'}) sera archivé et ses documents rattachés à «{' '}
            {currentClient.name}&nbsp;».
          </div>
        )}
      </div>
    </Modal>
  )
}
