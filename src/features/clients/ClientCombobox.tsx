import { useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { useClientSearch } from './api'
import { ClientQuickCreateModal } from './ClientQuickCreateModal'
import type { Client } from './api'

interface ClientComboboxProps {
  value: string | null
  onChange: (clientId: string, client: Client) => void
  invalid?: boolean
}

/**
 * The single searchable client picker used by invoice/quote creation (spec §6.4) — search by
 * name/email/identifier, with "+ Créer «…»" as the last option so a new client never breaks
 * the document-creation flow. The quick-create modal returns here and auto-selects the result;
 * the calling form's in-progress state is untouched throughout.
 */
export function ClientCombobox({ value, onChange, invalid }: ClientComboboxProps) {
  const [search, setSearch] = useState('')
  const [quickCreateName, setQuickCreateName] = useState<string | null>(null)
  const { data: clients = [] } = useClientSearch(search)

  return (
    <>
      <Combobox
        value={value}
        invalid={invalid}
        placeholder="Rechercher un client…"
        onSearch={setSearch}
        onChange={(clientId) => {
          const client = clients.find((c) => c.id === clientId)
          if (client) onChange(clientId, client)
        }}
        onCreate={(query) => setQuickCreateName(query)}
        options={clients.map((c) => ({ value: c.id, label: c.name, sublabel: c.email ?? undefined }))}
      />
      {quickCreateName && (
        <ClientQuickCreateModal
          open
          initialName={quickCreateName}
          onClose={() => setQuickCreateName(null)}
          onCreated={(client) => {
            setQuickCreateName(null)
            onChange(client.id, client)
          }}
        />
      )}
    </>
  )
}
