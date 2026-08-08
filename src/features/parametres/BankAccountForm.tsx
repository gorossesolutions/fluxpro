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
        <label htmlFor="ba_bank_name" className="mb-1 block text-sm font-medium text-slate">Banque *</label>
        <Input id="ba_bank_name" {...register('bank_name')} invalid={Boolean(errors.bank_name)} />
        {errors.bank_name && <p className="mt-1 text-xs text-overdue">{errors.bank_name.message}</p>}
      </div>
      <div>
        <label htmlFor="ba_bank_address" className="mb-1 block text-sm font-medium text-slate">Adresse de la banque</label>
        <Input id="ba_bank_address" {...register('bank_address')} />
      </div>
      <div>
        <label htmlFor="ba_beneficiary" className="mb-1 block text-sm font-medium text-slate">Bénéficiaire *</label>
        <Input id="ba_beneficiary" {...register('beneficiary')} invalid={Boolean(errors.beneficiary)} />
        {errors.beneficiary && <p className="mt-1 text-xs text-overdue">{errors.beneficiary.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ba_account_number" className="mb-1 block text-sm font-medium text-slate">Numéro de compte</label>
          <Input id="ba_account_number" {...register('account_number')} />
        </div>
        <div>
          <label htmlFor="ba_currency" className="mb-1 block text-sm font-medium text-slate">Devise</label>
          <Select id="ba_currency" {...register('currency')}>
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
          <label htmlFor="ba_iban" className="mb-1 block text-sm font-medium text-slate">IBAN</label>
          <Input id="ba_iban" {...register('iban')} />
        </div>
        <div>
          <label htmlFor="ba_bic_swift" className="mb-1 block text-sm font-medium text-slate">BIC/SWIFT</label>
          <Input id="ba_bic_swift" {...register('bic_swift')} />
        </div>
      </div>
      <div>
        <label htmlFor="ba_paypal_alias" className="mb-1 block text-sm font-medium text-slate">Alias PayPal</label>
        <Input id="ba_paypal_alias" {...register('paypal_alias')} />
      </div>
      <button type="submit" className="hidden" aria-hidden />
    </form>
  )
}
