import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { bankAccountSchema, type BankAccountFormValues } from './schema'

const CURRENCIES = ['MUR', 'EUR', 'USD', 'GBP', 'ZAR', 'CAD']

interface BankAccountFormProps {
  defaultValues?: Partial<BankAccountFormValues>
  onSubmit: (values: BankAccountFormValues) => void
  formId: string
}

export function BankAccountForm({ defaultValues, onSubmit, formId }: BankAccountFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: { currency: 'MUR', ...defaultValues },
  })

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate">Banque *</label>
        <Input {...register('bank_name')} invalid={Boolean(errors.bank_name)} />
        {errors.bank_name && <p className="mt-1 text-xs text-overdue">{errors.bank_name.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate">Adresse de la banque</label>
        <Input {...register('bank_address')} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate">Bénéficiaire *</label>
        <Input {...register('beneficiary')} invalid={Boolean(errors.beneficiary)} />
        {errors.beneficiary && <p className="mt-1 text-xs text-overdue">{errors.beneficiary.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Numéro de compte</label>
          <Input {...register('account_number')} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">Devise</label>
          <Select {...register('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">IBAN</label>
          <Input {...register('iban')} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate">BIC/SWIFT</label>
          <Input {...register('bic_swift')} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate">Alias PayPal</label>
        <Input {...register('paypal_alias')} />
      </div>
      <button type="submit" className="hidden" aria-hidden />
    </form>
  )
}
