-- FluxPro V2 — core schema.
-- Money columns are numeric(14,2); the app never does float arithmetic on them (see src/lib/money.ts).
-- Every business table carries user_id even though the app is single-tenant today (spec §4: multi-tenant-ready).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type identifier_type as enum (
  'BRN',            -- Mauritius Business Registration Number
  'SIRET',          -- France
  'SIREN',          -- France
  'TVA_INTRACOM_FR',
  'TVA_INTRACOM_BE',
  'UID_CH',         -- Switzerland UID/TVA
  'TRN_AE',         -- UAE Tax Registration Number
  'GST_HST_CA',
  'QST_CA',
  'VAT_ZA',
  'SARS_ZA',
  'CRN_ZA',         -- South Africa CIPC company registration number
  'BUSINESS_ID'     -- generic fallback for unlisted countries
);

create type client_type as enum ('entreprise', 'particulier');
create type document_language as enum ('fr', 'en');
create type supply_treatment as enum ('domestic', 'zero_rated_export');
create type invoice_status as enum ('draft', 'issued', 'paid', 'overdue', 'cancelled');
create type quote_status as enum ('draft', 'sent', 'accepted', 'refused', 'expired');
create type recurrence_type as enum ('none', 'weekly', 'monthly', 'quarterly', 'yearly');
create type inbox_document_status as enum ('unmatched', 'matched');
create type matched_entity_type as enum ('invoice', 'expense');
create type document_number_prefix as enum ('FAC', 'DEV', 'AV');
create type ebs_transaction_type as enum ('TC01', 'TC02', 'TC03', 'TC04', 'TC05', 'TC06');

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- business_identity — the issuer's own details, one row per user
-- ---------------------------------------------------------------------------

create table business_identity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  identifier_type identifier_type not null default 'BRN',
  identifier_value text not null,
  email text not null,
  phone text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country_code text not null default 'MU',
  logo_path text,
  vat_registered boolean not null default false,
  vat_number text,
  default_payment_terms integer not null default 30,
  billing_details text,
  legal_mentions text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bank_accounts
-- ---------------------------------------------------------------------------

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank_name text not null,
  bank_address text,
  beneficiary text not null,
  account_number text,
  iban text,
  bic_swift text,
  paypal_alias text,
  currency text not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  client_type client_type not null default 'entreprise',
  contact_name text,
  contact_role text,
  country_code text,
  identifier_type identifier_type,
  identifier_value text,
  vat_number text,
  email text,
  phone text,
  website text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  region text,
  default_currency text not null default 'EUR',
  default_payment_terms integer not null default 30,
  default_tax_rate numeric(5, 2),
  default_bank_account_id uuid references bank_accounts (id) on delete set null,
  document_language document_language not null default 'fr',
  notes text,
  client_reference text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_user on clients (user_id);
create index idx_clients_search on clients using gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(identifier_value, ''))
);

-- ---------------------------------------------------------------------------
-- document_sequences — atomic per-user/prefix/year number allocation
-- ---------------------------------------------------------------------------

create table document_sequences (
  user_id uuid not null references auth.users (id) on delete cascade,
  prefix document_number_prefix not null,
  year integer not null,
  last_number integer not null default 0,
  primary key (user_id, prefix, year)
);

-- ---------------------------------------------------------------------------
-- invoices + invoice_lines
-- ---------------------------------------------------------------------------

create table invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text unique, -- V1 id, kept as the migration join key
  number text unique,    -- null while draft; allocated at issuance only
  client_id uuid references clients (id) on delete restrict,
  client_snapshot jsonb not null default '{}'::jsonb,
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'MUR',
  fx_rate_to_mur numeric(18, 6) not null default 1,
  fx_rate_date date,
  fx_source text,
  subtotal numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  status invoice_status not null default 'draft',
  supply_treatment supply_treatment not null default 'domestic',
  country_mention text,
  bank_account_id uuid references bank_accounts (id) on delete set null,
  payment_terms integer not null default 30,
  notes text,
  source_quote_id uuid,
  issued_at timestamptz,
  locked boolean not null default false,
  status_override boolean not null default false,
  -- EBS bolt-on, not active (spec §3.9)
  irn text,
  qr_payload text,
  ebs_transaction_type ebs_transaction_type,
  ebs_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoices_user on invoices (user_id);
create index idx_invoices_client on invoices (client_id);
create index idx_invoices_status on invoices (status);
create index idx_invoices_issue_date on invoices (issue_date);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  position integer not null,
  title text not null,
  description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0
);

create index idx_invoice_lines_invoice on invoice_lines (invoice_id);

-- ---------------------------------------------------------------------------
-- quotes + quote_lines
-- ---------------------------------------------------------------------------

create table quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text unique,
  number text unique,
  client_id uuid references clients (id) on delete restrict,
  client_snapshot jsonb not null default '{}'::jsonb,
  issue_date date not null default current_date,
  valid_until date,
  currency text not null default 'MUR',
  fx_rate_to_mur numeric(18, 6) not null default 1,
  fx_rate_date date,
  fx_source text,
  subtotal numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  status quote_status not null default 'draft',
  supply_treatment supply_treatment not null default 'domestic',
  country_mention text,
  bank_account_id uuid references bank_accounts (id) on delete set null,
  payment_terms integer not null default 30,
  notes text,
  accepted_at timestamptz,
  acceptance_note text,
  converted_invoice_id uuid references invoices (id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_quotes_user on quotes (user_id);
create index idx_quotes_client on quotes (client_id);
create index idx_quotes_status on quotes (status);

alter table invoices
  add constraint fk_invoices_source_quote foreign key (source_quote_id) references quotes (id) on delete set null;

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  position integer not null,
  title text not null,
  description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0
);

create index idx_quote_lines_quote on quote_lines (quote_id);

-- ---------------------------------------------------------------------------
-- credit_notes (avoirs) + credit_note_lines
-- ---------------------------------------------------------------------------

create table credit_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  number text unique,
  parent_invoice_id uuid not null references invoices (id) on delete restrict,
  reason text not null,
  client_snapshot jsonb not null default '{}'::jsonb,
  issue_date date not null default current_date,
  currency text not null default 'MUR',
  fx_rate_to_mur numeric(18, 6) not null default 1,
  fx_rate_date date,
  fx_source text,
  subtotal numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  locked boolean not null default false,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_credit_notes_user on credit_notes (user_id);
create index idx_credit_notes_parent_invoice on credit_notes (parent_invoice_id);

create table credit_note_lines (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_notes (id) on delete cascade,
  position integer not null,
  title text not null,
  description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0
);

create index idx_credit_note_lines_credit_note on credit_note_lines (credit_note_id);

-- ---------------------------------------------------------------------------
-- payments — supports partial payments; invoice status is derived, not typed
-- ---------------------------------------------------------------------------

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount numeric(14, 2) not null,
  currency text not null,
  fx_rate_to_mur numeric(18, 6) not null default 1,
  fx_rate_date date,
  payment_date date not null default current_date,
  method text,
  reference text,
  -- fx gain/loss vs the invoice's frozen rate, in MUR minor currency (spec §16.12)
  fx_gain_loss_mur numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index idx_payments_invoice on payments (invoice_id);
create index idx_payments_user on payments (user_id);

-- ---------------------------------------------------------------------------
-- expense_categories
-- ---------------------------------------------------------------------------

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = system-seeded, shared
  label_fr text not null,
  key text not null,
  pcg_code text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- Postgres treats NULLs as distinct in a plain unique constraint, so the (user_id, key)
-- constraint above does not actually stop two system rows (user_id null) sharing a key —
-- this partial index closes that gap for the shared/system rows specifically.
create unique index idx_expense_categories_system_key on expense_categories (key) where user_id is null;

-- ---------------------------------------------------------------------------
-- expenses + expense_occurrences
-- ---------------------------------------------------------------------------

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text unique,
  supplier text not null,
  description text,
  category_id uuid references expense_categories (id) on delete set null,
  amount numeric(14, 2) not null,
  currency text not null default 'MUR',
  fx_rate_to_mur numeric(18, 6) not null default 1,
  fx_rate_date date,
  fx_source text,
  expense_date date not null default current_date,
  recurrence recurrence_type not null default 'none',
  recurrence_interval integer,
  recurrence_end_date date,
  is_deductible boolean not null default true,
  vat_amount numeric(14, 2) not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expenses_user on expenses (user_id);
create index idx_expenses_category on expenses (category_id);
create index idx_expenses_date on expenses (expense_date);

create table expense_occurrences (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id) on delete cascade,
  occurrence_date date not null,
  amount numeric(14, 2) not null,
  amount_mur numeric(14, 2) not null,
  is_generated boolean not null default true,
  created_at timestamptz not null default now(),
  unique (expense_id, occurrence_date)
);

create index idx_expense_occurrences_expense on expense_occurrences (expense_id);
create index idx_expense_occurrences_date on expense_occurrences (occurrence_date);

-- ---------------------------------------------------------------------------
-- documents — the reconciliation inbox (spec §10)
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  status inbox_document_status not null default 'unmatched',
  matched_entity_type matched_entity_type,
  matched_entity_id uuid,
  detected_amount numeric(14, 2),
  detected_date date,
  ocr_json jsonb,
  ocr_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_documents_user on documents (user_id);
create index idx_documents_status on documents (status);

-- ---------------------------------------------------------------------------
-- fx_rates — proprietary daily FX history (spec §11)
-- ---------------------------------------------------------------------------

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18, 6) not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (rate_date, base_currency, quote_currency)
);

create index idx_fx_rates_lookup on fx_rates (base_currency, quote_currency, rate_date desc);

-- ---------------------------------------------------------------------------
-- Mauritian tax reference data (spec §3.1) — never hardcoded in TS
-- ---------------------------------------------------------------------------

create table tax_bands (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_start date not null, -- Mauritian fiscal year starts 1 July
  band_order integer not null,
  lower_bound numeric(14, 2) not null,
  upper_bound numeric(14, 2), -- null = no upper bound
  rate_pct numeric(5, 2) not null,
  unique (fiscal_year_start, band_order)
);

create table tax_config (
  fiscal_year_start date primary key,
  fsc_threshold numeric(14, 2) not null,
  fsc_rate numeric(5, 2) not null,
  fsc_active boolean not null default true,
  vat_registration_threshold numeric(14, 2) not null,
  currency text not null default 'MUR'
);

create table tax_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fiscal_year_start date not null,
  chargeable_income numeric(14, 2),
  tax_amount numeric(14, 2),
  fsc_amount numeric(14, 2),
  notes text,
  computed_at timestamptz not null default now(),
  unique (user_id, fiscal_year_start)
);

-- ---------------------------------------------------------------------------
-- country_rules — mandatory mentions and identifier formats per client country
-- ---------------------------------------------------------------------------

create table country_rules (
  country_code text primary key,
  country_label_fr text not null,
  mention_fr text,
  mention_en text,
  reverse_charge boolean not null default false,
  identifier_label text not null,
  identifier_regex text,
  default_identifier_type identifier_type not null default 'BUSINESS_ID'
);

-- ---------------------------------------------------------------------------
-- audit_log — read-only in the UI, written by triggers
-- ---------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_log_entity on audit_log (entity_type, entity_id);
create index idx_audit_log_user on audit_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- app_settings — one row per user
-- ---------------------------------------------------------------------------

create table app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system',
  density text not null default 'comfortable',
  keepalive_interval_days integer not null default 2,
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint keepalive_interval_range check (keepalive_interval_days between 1 and 6)
);

-- ---------------------------------------------------------------------------
-- heartbeat — global anti-pause ping (spec §12)
-- ---------------------------------------------------------------------------

create table heartbeat (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  source text not null
);

-- ---------------------------------------------------------------------------
-- migration_map — idempotency key for scripts/migrate-v1.ts (spec §13)
-- ---------------------------------------------------------------------------

create table migration_map (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null,
  new_id uuid not null,
  entity text not null,
  created_at timestamptz not null default now(),
  unique (legacy_id, entity)
);
