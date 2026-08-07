import { z } from 'zod'

const IDENTIFIER_TYPES = [
  'BRN',
  'SIRET',
  'SIREN',
  'TVA_INTRACOM_FR',
  'TVA_INTRACOM_BE',
  'UID_CH',
  'TRN_AE',
  'GST_HST_CA',
  'QST_CA',
  'VAT_ZA',
  'SARS_ZA',
  'CRN_ZA',
  'BUSINESS_ID',
] as const

export const businessIdentitySchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  identifier_type: z.enum(IDENTIFIER_TYPES).default('BRN'),
  identifier_value: z.string().min(1, "L'identifiant est requis"),
  email: z.string().email('Email invalide'),
  phone: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country_code: z.string().default('MU'),
  vat_registered: z.boolean().default(false),
  vat_number: z.string().optional(),
  default_payment_terms: z.coerce.number().int().min(0).default(30),
  billing_details: z.string().optional(),
  legal_mentions: z.string().optional(),
})

export type BusinessIdentityFormValues = z.infer<typeof businessIdentitySchema>

export const bankAccountSchema = z.object({
  bank_name: z.string().min(1, 'Le nom de la banque est requis'),
  bank_address: z.string().optional(),
  beneficiary: z.string().min(1, 'Le bénéficiaire est requis'),
  account_number: z.string().optional(),
  iban: z.string().optional(),
  bic_swift: z.string().optional(),
  paypal_alias: z.string().optional(),
  currency: z.string().default('MUR'),
})

export type BankAccountFormValues = z.infer<typeof bankAccountSchema>
