import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCreateClient, useUpdateClient, type Client } from './api'
import { ClientForm } from './ClientForm'
import type { ClientFormValues } from './schema'

const FORM_ID = 'client-form'

interface ClientFormSheetProps {
  open: boolean
  onClose: () => void
  client?: Client
  onSaved?: (client: Client) => void
}

export function ClientFormSheet({ open, onClose, client, onSaved }: ClientFormSheetProps) {
  const createClient = useCreateClient()
  const updateClient = useUpdateClient()
  const { push } = useToast()
  const submitting = createClient.isPending || updateClient.isPending

  const handleSubmit = async (values: ClientFormValues) => {
    try {
      const payload = { ...values, email: values.email || null }
      const saved = client
        ? await updateClient.mutateAsync({ id: client.id, updates: payload })
        : await createClient.mutateAsync(payload)
      push('success', client ? 'Client mis à jour' : 'Client créé')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${(err as Error).message}`)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={client ? 'Modifier le client' : 'Nouveau client'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <ClientForm
        formId={FORM_ID}
        submitting={submitting}
        onSubmit={handleSubmit}
        defaultValues={
          client
            ? {
                ...client,
                email: client.email ?? '',
                contact_name: client.contact_name ?? undefined,
                contact_role: client.contact_role ?? undefined,
                identifier_value: client.identifier_value ?? undefined,
                vat_number: client.vat_number ?? undefined,
                phone: client.phone ?? undefined,
                website: client.website ?? undefined,
                address_line1: client.address_line1 ?? undefined,
                address_line2: client.address_line2 ?? undefined,
                postal_code: client.postal_code ?? undefined,
                city: client.city ?? undefined,
                region: client.region ?? undefined,
                default_tax_rate: client.default_tax_rate ?? undefined,
                notes: client.notes ?? undefined,
                client_reference: client.client_reference ?? undefined,
              }
            : undefined
        }
      />
    </Sheet>
  )
}
