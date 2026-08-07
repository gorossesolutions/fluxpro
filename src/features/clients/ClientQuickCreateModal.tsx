import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useCountryRules, resolveCountryDefaults } from '@/features/reference/api'
import { useCreateClient, type Client } from './api'
import { clientQuickCreateSchema, type ClientQuickCreateValues } from './schema'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'ZAR', 'CAD', 'MUR']
const FORM_ID = 'client-quick-create-form'

interface ClientQuickCreateModalProps {
  open: boolean
  onClose: () => void
  initialName: string
  onCreated: (client: Client) => void
}

/**
 * The compact inline-creation flow (spec §6.4): triggered from "+ Créer «…»" in the invoice/
 * quote client combobox. Deliberately a small field set — the full record stays editable later
 * from the client's own page. Must never lose the in-progress document draft, so this never
 * navigates away, only opens/closes over the calling form.
 */
export function ClientQuickCreateModal({ open, onClose, initialName, onCreated }: ClientQuickCreateModalProps) {
  const { data: countryRules = [] } = useCountryRules()
  const createClient = useCreateClient()
  const { push } = useToast()

  const { register, handleSubmit, watch, control, reset } = useForm<ClientQuickCreateValues>({
    resolver: zodResolver(clientQuickCreateSchema),
    defaultValues: { name: initialName, default_currency: 'EUR' },
  })

  const countryCode = watch('country_code')
  const defaults = resolveCountryDefaults(countryRules, countryCode ?? null)

  const onSubmit = async (values: ClientQuickCreateValues) => {
    try {
      const client = await createClient.mutateAsync({
        ...values,
        email: values.email || null,
        identifier_type: values.identifier_type ?? defaults?.identifierType ?? null,
      })
      push('success', `Client « ${client.name} » créé`)
      reset()
      onCreated(client)
    } catch (err) {
      push('error', `Échec de la création : ${(err as Error).message}`)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Créer « ${initialName} »`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={FORM_ID} disabled={createClient.isPending}>
            {createClient.isPending ? 'Création…' : 'Créer'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Nom / Société *</label>
          <Input {...register('name')} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Pays</label>
          <Controller
            control={control}
            name="country_code"
            render={({ field }) => (
              <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                <option value="">Sélectionner…</option>
                {countryRules.map((rule) => (
                  <option key={rule.country_code} value={rule.country_code}>
                    {rule.country_label_fr}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">{defaults?.identifierLabel ?? "Type d'identifiant"}</label>
          <Input {...register('identifier_value')} placeholder={defaults?.identifierLabel} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Email</label>
          <Input type="email" {...register('email')} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Adresse</label>
          <Input {...register('address_line1')} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Devise</label>
          <Select {...register('default_currency')}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Sheet>
  )
}
