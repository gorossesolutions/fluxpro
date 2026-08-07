/**
 * Typed readers for the CSV exports actually used for this migration (in place of a live V1
 * Supabase read — see docs/MIGRATION.md "CSV import path"). Column names match the exports
 * exactly; anything unexpected fails loudly rather than silently importing garbage.
 */
import { parseCsvRecords } from './csv'

export interface CsvInvoiceRow {
  number: string
  client: string
  email: string | null
  description: string
  montantHt: number
  tvaPct: number
  ttc: number
  currency: string
  date: string
  dueOrValidity: string | null
  statut: string
}

export interface CsvExpenseRow {
  supplier: string
  description: string | null
  categorie: string | null
  montant: number
  currency: string
  dateDebut: string
  recurrence: string | null
  dateFin: string | null
}

function parseNumber(value: string, context: string): number {
  const cleaned = value.trim().replace(',', '.')
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) throw new Error(`Could not parse number "${value}" (${context})`)
  return parsed
}

export function parseFacturesCsv(text: string): CsvInvoiceRow[] {
  return parseCsvRecords(text).map((r) => ({
    number: r['N°'],
    client: r['Client'],
    email: r['Email']?.trim() || null,
    description: r['Description'],
    montantHt: parseNumber(r['Montant HT'], `facture ${r['N°']}`),
    tvaPct: parseNumber(r['TVA%'], `facture ${r['N°']}`),
    ttc: parseNumber(r['TTC'], `facture ${r['N°']}`),
    currency: r['Devise'],
    date: r['Date'],
    dueOrValidity: r['Échéance']?.trim() || null,
    statut: r['Statut'],
  }))
}

export function parseDevisCsv(text: string): CsvInvoiceRow[] {
  return parseCsvRecords(text).map((r) => ({
    number: r['N°'],
    client: r['Client'],
    email: null, // devis.csv carries no email column
    description: r['Description'],
    montantHt: parseNumber(r['Montant HT'], `devis ${r['N°']}`),
    tvaPct: parseNumber(r['TVA%'], `devis ${r['N°']}`),
    ttc: parseNumber(r['TTC'], `devis ${r['N°']}`),
    currency: r['Devise'],
    date: r['Date'],
    dueOrValidity: r['Validité']?.trim() || null,
    statut: r['Statut'],
  }))
}

export function parseDepensesCsv(text: string): CsvExpenseRow[] {
  return parseCsvRecords(text).map((r) => ({
    supplier: r['Fournisseur'],
    description: r['Description']?.trim() || null,
    categorie: r['Catégorie']?.trim() || null,
    montant: parseNumber(r['Montant'], `dépense ${r['Fournisseur']}`),
    currency: r['Devise'],
    dateDebut: r['Date début'],
    recurrence: r['Récurrence']?.trim() || null,
    dateFin: r['Date fin']?.trim() || null,
  }))
}
