/**
 * Hand-written to match supabase/migrations/000{1..4}*.sql exactly.
 * Regenerate for real once the project is linked to a live Supabase instance:
 *   SUPABASE_PROJECT_ID=<ref> npm run db:types
 * Field-for-field drift between this file and the migrations is a bug — keep them in sync
 * manually until the first `db:types` run replaces this file outright.
 */

export type IdentifierType =
  | 'BRN'
  | 'SIRET'
  | 'SIREN'
  | 'TVA_INTRACOM_FR'
  | 'TVA_INTRACOM_BE'
  | 'UID_CH'
  | 'TRN_AE'
  | 'GST_HST_CA'
  | 'QST_CA'
  | 'VAT_ZA'
  | 'SARS_ZA'
  | 'CRN_ZA'
  | 'BUSINESS_ID'

export type ClientType = 'entreprise' | 'particulier'
export type DocumentLanguage = 'fr' | 'en'
export type SupplyTreatment = 'domestic' | 'zero_rated_export'
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'expired'
export type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type InboxDocumentStatus = 'unmatched' | 'matched'
export type MatchedEntityType = 'invoice' | 'expense'
export type DocumentNumberPrefix = 'FAC' | 'DEV' | 'AV'
export type EbsTransactionType = 'TC01' | 'TC02' | 'TC03' | 'TC04' | 'TC05' | 'TC06'

// A column with no NOT NULL constraint is always optional on Insert (omitting it just leaves
// it NULL) — independent of whether it also has a SQL DEFAULT. InsertDefaults below is only
// for NOT NULL columns that have a DEFAULT (id, created_at, status, etc.); nullable columns
// are picked up here automatically so they don't need to be listed by every table.
type NullableKeys<Row> = { [K in keyof Row]: null extends Row[K] ? K : never }[keyof Row]

interface Table<Row, InsertDefaults extends keyof Row = never> {
  Row: Row
  Insert: Omit<Row, InsertDefaults | NullableKeys<Row>> & Partial<Pick<Row, InsertDefaults | NullableKeys<Row>>>
  Update: Partial<Row>
  // No foreign-key relationships are modelled for embedded-resource queries (select('*, foo(*)'))
  // — every read in this app is a flat select with separate queries joined client-side.
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        { id: string; email: string; display_name: string | null; created_at: string },
        'created_at'
      >
      business_identity: Table<
        {
          user_id: string
          name: string
          identifier_type: IdentifierType
          identifier_value: string
          email: string
          phone: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          city: string | null
          country_code: string
          logo_path: string | null
          vat_registered: boolean
          vat_number: string | null
          default_payment_terms: number
          billing_details: string | null
          legal_mentions: string | null
          updated_at: string
        },
        'country_code' | 'vat_registered' | 'default_payment_terms' | 'updated_at'
      >
      bank_accounts: Table<
        {
          id: string
          user_id: string
          bank_name: string
          bank_address: string | null
          beneficiary: string
          account_number: string | null
          iban: string | null
          bic_swift: string | null
          paypal_alias: string | null
          currency: string
          is_default: boolean
          sort_order: number
          created_at: string
        },
        'id' | 'is_default' | 'sort_order' | 'created_at'
      >
      clients: Table<
        {
          id: string
          user_id: string
          name: string
          client_type: ClientType
          contact_name: string | null
          contact_role: string | null
          country_code: string | null
          identifier_type: IdentifierType | null
          identifier_value: string | null
          vat_number: string | null
          email: string | null
          phone: string | null
          website: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          city: string | null
          region: string | null
          default_currency: string
          default_payment_terms: number
          default_tax_rate: number | null
          default_bank_account_id: string | null
          document_language: DocumentLanguage
          notes: string | null
          client_reference: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        },
        | 'id'
        | 'client_type'
        | 'default_currency'
        | 'default_payment_terms'
        | 'document_language'
        | 'archived_at'
        | 'created_at'
        | 'updated_at'
      >
      document_sequences: Table<
        { user_id: string; prefix: DocumentNumberPrefix; year: number; last_number: number },
        'last_number'
      >
      invoices: Table<
        {
          id: string
          user_id: string
          legacy_id: string | null
          number: string | null
          client_id: string | null
          client_snapshot: Record<string, unknown>
          issue_date: string
          due_date: string | null
          currency: string
          fx_rate_to_mur: number
          fx_rate_date: string | null
          fx_source: string | null
          subtotal: number
          tax_rate: number
          tax_amount: number
          total: number
          status: InvoiceStatus
          supply_treatment: SupplyTreatment
          country_mention: string | null
          bank_account_id: string | null
          payment_terms: number
          notes: string | null
          source_quote_id: string | null
          issued_at: string | null
          locked: boolean
          status_override: boolean
          irn: string | null
          qr_payload: string | null
          ebs_transaction_type: EbsTransactionType | null
          ebs_submitted_at: string | null
          created_at: string
          updated_at: string
        },
        | 'id'
        | 'legacy_id'
        | 'number'
        | 'client_snapshot'
        | 'issue_date'
        | 'currency'
        | 'fx_rate_to_mur'
        | 'subtotal'
        | 'tax_rate'
        | 'tax_amount'
        | 'total'
        | 'status'
        | 'supply_treatment'
        | 'payment_terms'
        | 'locked'
        | 'status_override'
        | 'created_at'
        | 'updated_at'
      >
      invoice_lines: Table<
        {
          id: string
          invoice_id: string
          position: number
          title: string
          description: string | null
          quantity: number
          unit_price: number
          line_total: number
        },
        'id' | 'quantity' | 'unit_price' | 'line_total'
      >
      quotes: Table<
        {
          id: string
          user_id: string
          legacy_id: string | null
          number: string | null
          client_id: string | null
          client_snapshot: Record<string, unknown>
          issue_date: string
          valid_until: string | null
          currency: string
          fx_rate_to_mur: number
          fx_rate_date: string | null
          fx_source: string | null
          subtotal: number
          tax_rate: number
          tax_amount: number
          total: number
          status: QuoteStatus
          supply_treatment: SupplyTreatment
          country_mention: string | null
          bank_account_id: string | null
          payment_terms: number
          notes: string | null
          accepted_at: string | null
          acceptance_note: string | null
          converted_invoice_id: string | null
          issued_at: string | null
          locked: boolean
          created_at: string
          updated_at: string
        },
        | 'id'
        | 'legacy_id'
        | 'number'
        | 'client_snapshot'
        | 'issue_date'
        | 'currency'
        | 'fx_rate_to_mur'
        | 'subtotal'
        | 'tax_rate'
        | 'tax_amount'
        | 'total'
        | 'status'
        | 'supply_treatment'
        | 'payment_terms'
        | 'locked'
        | 'created_at'
        | 'updated_at'
      >
      quote_lines: Table<
        {
          id: string
          quote_id: string
          position: number
          title: string
          description: string | null
          quantity: number
          unit_price: number
          line_total: number
        },
        'id' | 'quantity' | 'unit_price' | 'line_total'
      >
      credit_notes: Table<
        {
          id: string
          user_id: string
          number: string | null
          parent_invoice_id: string
          reason: string
          client_snapshot: Record<string, unknown>
          issue_date: string
          currency: string
          fx_rate_to_mur: number
          fx_rate_date: string | null
          fx_source: string | null
          subtotal: number
          tax_rate: number
          tax_amount: number
          total: number
          locked: boolean
          issued_at: string | null
          created_at: string
        },
        | 'id'
        | 'number'
        | 'client_snapshot'
        | 'issue_date'
        | 'currency'
        | 'fx_rate_to_mur'
        | 'subtotal'
        | 'tax_rate'
        | 'tax_amount'
        | 'total'
        | 'locked'
        | 'created_at'
      >
      credit_note_lines: Table<
        {
          id: string
          credit_note_id: string
          position: number
          title: string
          description: string | null
          quantity: number
          unit_price: number
          line_total: number
        },
        'id' | 'quantity' | 'unit_price' | 'line_total'
      >
      payments: Table<
        {
          id: string
          user_id: string
          invoice_id: string
          amount: number
          currency: string
          fx_rate_to_mur: number
          fx_rate_date: string | null
          payment_date: string
          method: string | null
          reference: string | null
          fx_gain_loss_mur: number
          created_at: string
        },
        'id' | 'fx_rate_to_mur' | 'payment_date' | 'fx_gain_loss_mur' | 'created_at'
      >
      expense_categories: Table<
        {
          id: string
          user_id: string | null
          label_fr: string
          key: string
          pcg_code: string | null
          archived_at: string | null
          created_at: string
        },
        'id' | 'archived_at' | 'created_at'
      >
      expenses: Table<
        {
          id: string
          user_id: string
          legacy_id: string | null
          supplier: string
          description: string | null
          category_id: string | null
          amount: number
          currency: string
          fx_rate_to_mur: number
          fx_rate_date: string | null
          fx_source: string | null
          expense_date: string
          recurrence: RecurrenceType
          recurrence_interval: number | null
          recurrence_end_date: string | null
          is_deductible: boolean
          vat_amount: number
          deleted_at: string | null
          created_at: string
          updated_at: string
        },
        | 'id'
        | 'legacy_id'
        | 'currency'
        | 'fx_rate_to_mur'
        | 'expense_date'
        | 'recurrence'
        | 'is_deductible'
        | 'vat_amount'
        | 'deleted_at'
        | 'created_at'
        | 'updated_at'
      >
      expense_occurrences: Table<
        {
          id: string
          expense_id: string
          occurrence_date: string
          amount: number
          amount_mur: number
          is_generated: boolean
          created_at: string
        },
        'id' | 'is_generated' | 'created_at'
      >
      documents: Table<
        {
          id: string
          user_id: string
          storage_path: string
          file_name: string
          mime_type: string | null
          size_bytes: number | null
          status: InboxDocumentStatus
          matched_entity_type: MatchedEntityType | null
          matched_entity_id: string | null
          detected_amount: number | null
          detected_date: string | null
          ocr_json: Record<string, unknown> | null
          ocr_status: string | null
          created_at: string
          updated_at: string
        },
        'id' | 'status' | 'created_at' | 'updated_at'
      >
      fx_rates: Table<
        {
          id: string
          rate_date: string
          base_currency: string
          quote_currency: string
          rate: number
          source: string
          created_at: string
        },
        'id' | 'created_at'
      >
      tax_bands: Table<
        {
          id: string
          fiscal_year_start: string
          band_order: number
          lower_bound: number
          upper_bound: number | null
          rate_pct: number
        },
        'id'
      >
      tax_config: Table<
        {
          fiscal_year_start: string
          fsc_threshold: number
          fsc_rate: number
          fsc_active: boolean
          vat_registration_threshold: number
          currency: string
        },
        'fsc_active' | 'currency'
      >
      tax_history: Table<
        {
          id: string
          user_id: string
          fiscal_year_start: string
          chargeable_income: number | null
          tax_amount: number | null
          fsc_amount: number | null
          notes: string | null
          computed_at: string
        },
        'id' | 'computed_at'
      >
      country_rules: Table<
        {
          country_code: string
          country_label_fr: string
          mention_fr: string | null
          mention_en: string | null
          reverse_charge: boolean
          identifier_label: string
          identifier_regex: string | null
          default_identifier_type: IdentifierType
        },
        'reverse_charge' | 'default_identifier_type'
      >
      audit_log: Table<
        {
          id: string
          user_id: string
          entity_type: string
          entity_id: string
          action: string
          actor: string | null
          before: Record<string, unknown> | null
          after: Record<string, unknown> | null
          created_at: string
        },
        'id' | 'created_at'
      >
      app_settings: Table<
        {
          user_id: string
          theme: string
          density: string
          keepalive_interval_days: number
          last_heartbeat_at: string | null
          updated_at: string
        },
        'theme' | 'density' | 'keepalive_interval_days' | 'updated_at'
      >
      heartbeat: Table<{ id: string; ran_at: string; source: string }, 'id' | 'ran_at'>
      migration_map: Table<
        { id: string; legacy_id: string; new_id: string; entity: string; created_at: string },
        'id' | 'created_at'
      >
    }
    Views: {
      v_number_gaps: {
        Row: {
          user_id: string
          prefix: DocumentNumberPrefix
          year: number
          missing_number: number
        }
        Relationships: []
      }
      v_client_financials: {
        Row: {
          client_id: string
          user_id: string
          ca_total_mur: number
          encours_mur: number
          has_overdue: boolean
          invoice_count: number
          last_invoice_date: string | null
          avg_payment_delay_days: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_allocate_document_number: {
        Args: { p_prefix: DocumentNumberPrefix; p_year: number }
        Returns: string
      }
      fn_merge_clients: {
        Args: { p_keep_id: string; p_merge_id: string }
        Returns: undefined
      }
    }
    Enums: {
      identifier_type: IdentifierType
      client_type: ClientType
      document_language: DocumentLanguage
      supply_treatment: SupplyTreatment
      invoice_status: InvoiceStatus
      quote_status: QuoteStatus
      recurrence_type: RecurrenceType
      inbox_document_status: InboxDocumentStatus
      matched_entity_type: MatchedEntityType
      document_number_prefix: DocumentNumberPrefix
      ebs_transaction_type: EbsTransactionType
    }
  }
}
