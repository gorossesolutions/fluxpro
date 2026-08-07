import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { DatePicker } from '@/components/ui/DatePicker'
import { Switch } from '@/components/ui/Switch'
import { useExpenseCategories } from './api'
import { expenseSchema, type ExpenseFormValues } from './schema'

const CURRENCIES = ['MUR', 'EUR', 'USD', 'GBP', 'ZAR', 'CAD']

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'Aucune',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
}

interface ExpenseFormProps {
  defaultValues?: Partial<ExpenseFormValues>
  onSubmit: (values: ExpenseFormValues) => void
  formId: string
  /** Once an expense has a materialised occurrence (every expense does, from its very first
   * save — spec §9), its start date and recurrence frequency are locked: editing them here
   * only touches the expenses template row, never the expense_occurrences rows already
   * generated from it, so changing either would silently desync the two. Descriptive fields,
   * the recurrence end date, and fiscal fields stay editable. */
  lockRecurrence?: boolean
}

export function ExpenseForm({ defaultValues, onSubmit, formId, lockRecurrence }: ExpenseFormProps) {
  const { data: categories = [] } = useExpenseCategories()

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      currency: 'MUR',
      expense_date: new Date().toISOString().slice(0, 10),
      recurrence: 'none',
      is_deductible: true,
      vat_amount: 0,
      ...defaultValues,
    },
  })

  const recurrence = watch('recurrence')

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Détails</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Fournisseur *</label>
            <Input {...register('supplier')} invalid={Boolean(errors.supplier)} />
            {errors.supplier && <p className="mt-1 text-xs text-overdue">{errors.supplier.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate">Description</label>
            <Textarea rows={2} {...register('description')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Catégorie</label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                  <option value="">Aucune</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label_fr}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Date *</label>
            <DatePicker disabled={lockRecurrence} {...register('expense_date')} invalid={Boolean(errors.expense_date)} />
            {errors.expense_date && <p className="mt-1 text-xs text-overdue">{errors.expense_date.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Montant *</label>
            <NumberInput {...register('amount')} invalid={Boolean(errors.amount)} />
            {errors.amount && <p className="mt-1 text-xs text-overdue">{errors.amount.message}</p>}
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
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Récurrence</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Fréquence</label>
            <Select disabled={lockRecurrence} {...register('recurrence')}>
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          {recurrence !== 'none' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate">Se termine le (optionnel)</label>
              <DatePicker {...register('recurrence_end_date')} invalid={Boolean(errors.recurrence_end_date)} />
              {errors.recurrence_end_date && (
                <p className="mt-1 text-xs text-overdue">{errors.recurrence_end_date.message}</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate">Fiscal</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">TVA (le cas échéant)</label>
            <NumberInput {...register('vat_amount')} />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <Controller
              control={control}
              name="is_deductible"
              render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Déductible" />}
            />
            <span className="text-sm text-slate">Déductible</span>
          </div>
        </div>
      </section>

      <button type="submit" className="hidden" aria-hidden />
    </form>
  )
}
