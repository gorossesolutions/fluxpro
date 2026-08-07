import { z } from 'zod'

const RECURRENCE_TYPES = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

export const expenseSchema = z
  .object({
    supplier: z.string().min(1, 'Le fournisseur est requis'),
    description: z.string().optional(),
    category_id: z.string().nullable().optional(),
    amount: z.coerce.number().positive('Le montant doit être positif'),
    currency: z.string().default('MUR'),
    expense_date: z.string().min(1, 'La date est requise'),
    recurrence: z.enum(RECURRENCE_TYPES).default('none'),
    recurrence_end_date: z.string().optional(),
    is_deductible: z.boolean().default(true),
    vat_amount: z.coerce.number().min(0).default(0),
  })
  .refine((v) => v.recurrence === 'none' || !v.recurrence_end_date || v.recurrence_end_date >= v.expense_date, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['recurrence_end_date'],
  })

export type ExpenseFormValues = z.infer<typeof expenseSchema>
