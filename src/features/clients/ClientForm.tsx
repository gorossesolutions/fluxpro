import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { validateIdentifier, type IdentifierTypeValue } from '@/lib/validators'
import { useCountryRules, useBankAccounts, resolveCountryDefaults } from '@/features/reference/api'
import { clientSchema, type ClientFormValues } from './schema'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'ZAR', 'CAD', 'MUR']

interface ClientFormProps {
  defaultValues?: Partial<ClientFormValues>
  onSubmit: (values: ClientFormValues) => void
  submitting?: boolean
  formId: string
}

export function ClientForm({ defaultValues, onSubmit, submitting, formId }: ClientFormProps) {
  const { data: countryRules = [] } = useCountryRules()
  const { data: bankAccounts = [] } = useBankAccounts()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      client_type: 'entreprise',
      default_currency: 'EUR',
      default_payment_terms: 30,
      document_language: 'fr',
      ...defaultValues,
    },
  })

  const countryCode = watch('country_code')
  const identifierType = watch('identifier_type')
  const identifierValue = watch('identifier_value')

  const defaults = resolveCountryDefaults(countryRules, countryCode ?? null)

  // Country drives the identifier type default (spec §6.3) — only auto-set it the moment the
  // country changes, never overwrite a value the user already picked deliberately.
  useEffect(() => {
    if (defaults && !identifierType) {
      setValue('identifier_type', defaults.identifierType)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode])

  const identifierCheck =
    identifierType && identifierValue ? validateIdentifier(identifierType as IdentifierTypeValue, identifierValue) : null

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Identité</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Nom / Société *</label>
            <Input {...register('name')} invalid={Boolean(errors.name)} />
            {errors.name && <p className="mt-1 text-xs text-overdue">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Type</label>
            <Select {...register('client_type')}>
              <option value="entreprise">Entreprise</option>
              <option value="particulier">Particulier</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Nom du contact</label>
            <Input {...register('contact_name')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Fonction</label>
            <Input {...register('contact_role')} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Identifiant fiscal</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <label className="mb-1 block text-sm font-medium text-slate">
              {defaults?.identifierLabel ?? "Type d'identifiant"}
            </label>
            <Input {...register('identifier_value')} placeholder={defaults?.identifierLabel} invalid={identifierCheck?.valid === false} />
            {identifierCheck?.valid === false && (
              <p className="mt-1 text-xs text-pending">{identifierCheck.message} (vérifie avant d'émettre un document)</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Numéro de TVA (si différent)</label>
            <Input {...register('vat_number')} />
          </div>
          {defaults && (
            <div className="sm:col-span-2 rounded-lg bg-blue-pale px-3 py-2 text-xs text-blue">
              Traitement calculé : <strong>{defaults.supplyTreatment === 'domestic' ? 'Domestique' : 'Exportation (zero-rated)'}</strong>
              {defaults.countryMention && <> — mention : « {defaults.countryMention} »</>}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Coordonnées</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Email</label>
            <Input type="email" {...register('email')} invalid={Boolean(errors.email)} />
            {errors.email && <p className="mt-1 text-xs text-overdue">{errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Téléphone</label>
            <Input {...register('phone')} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Site web</label>
            <Input {...register('website')} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Adresse</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Ligne 1</label>
            <Input {...register('address_line1')} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Ligne 2</label>
            <Input {...register('address_line2')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Code postal</label>
            <Input {...register('postal_code')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Ville</label>
            <Input {...register('city')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Région / État</label>
            <Input {...register('region')} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Facturation</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Devise par défaut</label>
            <Select {...register('default_currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Conditions de paiement (jours)</label>
            <NumberInput {...register('default_payment_terms')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Taux de taxe par défaut (%)</label>
            <NumberInput {...register('default_tax_rate')} suffix="%" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Compte bancaire par défaut</label>
            <Controller
              control={control}
              name="default_bank_account_id"
              render={({ field }) => (
                <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                  <option value="">Par défaut de l'entreprise</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.bank_name} ({account.currency})
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Langue du document</label>
            <Select {...register('document_language')}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Divers</h3>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Notes internes</label>
            <Textarea rows={3} {...register('notes')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Référence client</label>
            <Input {...register('client_reference')} />
          </div>
        </div>
      </section>

      <button type="submit" disabled={submitting} className="hidden" aria-hidden />
    </form>
  )
}
