/** V1's live Supabase schema (spec §13) — four flat tables, text ids, no user_id, no RLS. */

export interface V1Facture {
  id: string // f_<timestamp>
  num: string
  client: string
  client_email: string | null
  client_adresse: string | null
  client_id: string | null
  date: string
  desc_titre: string
  desc_detail: string | null
  montant: number
  devise: string
  tva: number
  echeance: string | null
  conditions: string | null
  statut: 'payée' | 'en attente' | 'en retard'
}

export type V1Devis = V1Facture

export interface V1Depense {
  id: string // dp_<timestamp>
  fournisseur: string
  description: string | null
  categorie: string | null
  montant: number
  devise: string
  date_debut: string
  recurrence: 'mensuelle' | 'trimestrielle' | 'annuelle' | null
  date_fin: string | null
}

export interface V1FiscalHistoryEntry {
  year?: string | number
  [key: string]: unknown
}

export interface V1Parametres {
  id: 'default'
  nom: string
  siret: string | null
  email: string
  tel: string | null
  adresse: string | null
  termes: string | null
  details_facturation: string | null
  mentions: string | null
  banque: string | null
  banque_adresse: string | null
  beneficiaire: string | null
  compte: string | null
  iban: string | null
  bic: string | null
  paypal: string | null
  eur_mur: number | null
  usd_mur: number | null
  gbp_mur: number | null
  seuil_impot: number | null
  taux_impot: number | null
  forex_api_key: string | null
  next_fact_id: number | null
  next_dep_id: number | null
  fiscal_history: V1FiscalHistoryEntry[] | null
}
