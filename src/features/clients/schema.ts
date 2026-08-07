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

/** Only the name is required (spec §6.3) — an unfinished client must never block invoice
 * creation. Everything else is optional at save time; issuance-time completeness is checked
 * separately (spec §6.5). */
export const clientSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  client_type: z.enum(['entreprise', 'particulier']).default('entreprise'),
  contact_name: z.string().optional(),
  contact_role: z.string().optional(),
  country_code: z.string().nullable().optional(),
  identifier_type: z.enum(IDENTIFIER_TYPES).nullable().optional(),
  identifier_value: z.string().optional(),
  vat_number: z.string().optional(),
  email: z.union([z.literal(''), z.string().email('Email invalide')]).optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  default_currency: z.string().default('EUR'),
  default_payment_terms: z.coerce.number().int().min(0).default(30),
  default_tax_rate: z.coerce.number().min(0).max(100).nullable().optional(),
  default_bank_account_id: z.string().nullable().optional(),
  document_language: z.enum(['fr', 'en']).default('fr'),
  notes: z.string().optional(),
  client_reference: z.string().optional(),
})

export type ClientFormValues = z.infer<typeof clientSchema>

/** Compact quick-create schema for the inline "+ Créer «…»" flow (spec §6.4) — a strict
 * subset of the full form, same underlying table. */
export const clientQuickCreateSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  country_code: z.string().nullable().optional(),
  identifier_type: z.enum(IDENTIFIER_TYPES).nullable().optional(),
  identifier_value: z.string().optional(),
  email: z.union([z.literal(''), z.string().email('Email invalide')]).optional(),
  address_line1: z.string().optional(),
  default_currency: z.string().default('EUR'),
})

export type ClientQuickCreateValues = z.infer<typeof clientQuickCreateSchema>
