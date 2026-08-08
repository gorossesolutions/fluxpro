import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { Switch } from '@/components/ui/Switch'
import { useCountryRules } from '@/features/reference/api'
import { businessIdentitySchema, type BusinessIdentityFormValues } from './schema'

interface BusinessIdentityFormProps {
  defaultValues?: Partial<BusinessIdentityFormValues>
  onSubmit: (values: BusinessIdentityFormValues) => void
  formId: string
}

export function BusinessIdentityForm({ defaultValues, onSubmit, formId }: BusinessIdentityFormProps) {
  const { data: countryRules = [] } = useCountryRules()

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<BusinessIdentityFormValues>({
    resolver: zodResolver(businessIdentitySchema),
    defaultValues: {
      identifier_type: 'BRN',
      country_code: 'MU',
      vat_registered: false,
      default_payment_terms: 30,
      ...defaultValues,
    },
  })

  const vatRegistered = watch('vat_registered')

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Identité</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="bi_name" className="mb-1 block text-sm font-medium text-slate">Nom / Société *</label>
            <Input id="bi_name" {...register('name')} invalid={Boolean(errors.name)} />
            {errors.name && <p className="mt-1 text-xs text-overdue">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="bi_country_code" className="mb-1 block text-sm font-medium text-slate">Pays</label>
            <Controller
              control={control}
              name="country_code"
              render={({ field }) => (
                <Select id="bi_country_code" value={field.value} onChange={(e) => field.onChange(e.target.value)}>
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
            <label htmlFor="bi_identifier_type" className="mb-1 block text-sm font-medium text-slate">Type d'identifiant</label>
            <Select id="bi_identifier_type" {...register('identifier_type')}>
              <option value="BRN">BRN (Business Registration Number)</option>
              <option value="SIRET">SIRET</option>
              <option value="SIREN">SIREN</option>
              <option value="TVA_INTRACOM_FR">TVA intracom. FR</option>
              <option value="TVA_INTRACOM_BE">TVA intracom. BE</option>
              <option value="UID_CH">UID/TVA CH</option>
              <option value="TRN_AE">TRN AE</option>
              <option value="GST_HST_CA">GST/HST CA</option>
              <option value="QST_CA">QST CA</option>
              <option value="VAT_ZA">VAT ZA</option>
              <option value="SARS_ZA">SARS ZA</option>
              <option value="CRN_ZA">CRN ZA</option>
              <option value="BUSINESS_ID">Autre identifiant</option>
            </Select>
          </div>
          <div>
            <label htmlFor="bi_identifier_value" className="mb-1 block text-sm font-medium text-slate">Numéro d'identifiant *</label>
            <Input id="bi_identifier_value" {...register('identifier_value')} invalid={Boolean(errors.identifier_value)} />
            {errors.identifier_value && <p className="mt-1 text-xs text-overdue">{errors.identifier_value.message}</p>}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Coordonnées</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bi_email" className="mb-1 block text-sm font-medium text-slate">Email *</label>
            <Input id="bi_email" type="email" {...register('email')} invalid={Boolean(errors.email)} />
            {errors.email && <p className="mt-1 text-xs text-overdue">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="bi_phone" className="mb-1 block text-sm font-medium text-slate">Téléphone</label>
            <Input id="bi_phone" {...register('phone')} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="bi_address_line1" className="mb-1 block text-sm font-medium text-slate">Adresse — ligne 1</label>
            <Input id="bi_address_line1" {...register('address_line1')} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="bi_address_line2" className="mb-1 block text-sm font-medium text-slate">Adresse — ligne 2</label>
            <Input id="bi_address_line2" {...register('address_line2')} />
          </div>
          <div>
            <label htmlFor="bi_postal_code" className="mb-1 block text-sm font-medium text-slate">Code postal</label>
            <Input id="bi_postal_code" {...register('postal_code')} />
          </div>
          <div>
            <label htmlFor="bi_city" className="mb-1 block text-sm font-medium text-slate">Ville</label>
            <Input id="bi_city" {...register('city')} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">TVA (droit mauricien)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 sm:col-span-2">
            <Controller
              control={control}
              name="vat_registered"
              render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Immatriculé à la TVA" />}
            />
            <span className="text-sm text-slate">Immatriculé à la TVA mauricienne</span>
          </div>
          {vatRegistered && (
            <div className="sm:col-span-2">
              <label htmlFor="bi_vat_number" className="mb-1 block text-sm font-medium text-slate">Numéro de TVA</label>
              <Input id="bi_vat_number" {...register('vat_number')} />
            </div>
          )}
          {!vatRegistered && (
            <p className="sm:col-span-2 rounded-lg bg-blue-pale px-3 py-2 text-xs text-blue">
              Non immatriculé : les factures pour des prestations domestiques ne doivent porter aucune ligne de TVA et
              doivent mentionner que l'entreprise n'est pas immatriculée. Le seuil d'immatriculation obligatoire est de
              MUR 3 000 000 de chiffre d'affaires annuel (voir Fiscalité) — certaines professions peuvent être
              assujetties indépendamment du seuil (Tenth Schedule, à vérifier avec un comptable).
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Facturation</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bi_default_payment_terms" className="mb-1 block text-sm font-medium text-slate">Conditions de paiement par défaut (jours)</label>
            <NumberInput id="bi_default_payment_terms" {...register('default_payment_terms')} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="bi_billing_details" className="mb-1 block text-sm font-medium text-slate">Détails de facturation</label>
            <Textarea
              id="bi_billing_details"
              rows={3}
              {...register('billing_details')}
              placeholder="Coordonnées complémentaires affichées sur les factures"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="bi_legal_mentions" className="mb-1 block text-sm font-medium text-slate">Mentions légales</label>
            <Textarea
              id="bi_legal_mentions"
              rows={4}
              {...register('legal_mentions')}
              placeholder="Mentions légales obligatoires selon le droit mauricien (forme juridique, capital le cas échéant, etc.)"
            />
          </div>
        </div>
      </section>

      <button type="submit" className="hidden" aria-hidden />
    </form>
  )
}
