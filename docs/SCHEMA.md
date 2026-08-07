# Schema

Source of truth: `supabase/migrations/0001_schema.sql` through `0004_seed_reference_data.sql`. This
document explains the shape and the *why*; the migrations are the *what*.

## Layering

1. **`0001_schema.sql`** — enums, tables, indexes. No RLS, no triggers.
2. **`0002_rls.sql`** — RLS enabled on every table, ownership policies, Storage buckets/policies.
3. **`0003_functions.sql`** — everything RLS can't express: invoice/credit-note immutability,
   atomic document numbering, derived invoice status, the audit trail, the number-gap view, the
   new-user bootstrap.
4. **`0004_seed_reference_data.sql`** — Mauritian tax bands/config, country mention rules, the
   expense category taxonomy. Reference data only, never business data.

RLS is the **ownership** boundary (`user_id = auth.uid()`); triggers are the **compliance**
boundary (an issued invoice cannot be altered even by its owner). They're deliberately separate
layers — don't fold one into the other.

## Table groups

- **Identity**: `profiles`, `business_identity`, `bank_accounts`, `app_settings`. One row per
  user for the first and last two; `profiles`/`app_settings` are auto-created by
  `fn_handle_new_user()` when the Supabase auth user is provisioned.
- **Clients**: `clients`. Country-driven defaults (identifier type/regex, supply treatment,
  country mention) are resolved in the app layer from `country_rules`, not stored redundantly.
- **Documents**: `invoices` + `invoice_lines`, `quotes` + `quote_lines`, `credit_notes` +
  `credit_note_lines`, `payments`. `document_sequences` backs `fn_allocate_document_number()`,
  the only path that ever writes a document `number` — no client code composes one.
- **Expenses**: `expenses`, `expense_occurrences` (materialised recurrence instances —
  templates and occurrences are deliberately separate tables, not expanded in memory), and the
  shared `expense_categories` taxonomy (`user_id is null` rows are the system-seeded set).
- **Reconciliation**: `documents` (the justificatifs inbox), matched against invoices/expenses by
  `matched_entity_type`/`matched_entity_id` — a loose polymorphic reference rather than two
  nullable FKs, kept deliberately simple since matching is proposed/confirmed by the app, not
  enforced by a DB constraint.
- **FX & tax**: `fx_rates` (proprietary daily history), `tax_bands`, `tax_config`, `tax_history`,
  `country_rules` — all global reference/reporting data, not owned by a specific user (except
  `tax_history`, which is a per-user computed record).
- **Compliance plumbing**: `audit_log`, `document_sequences`, `heartbeat`, `migration_map`.

## Money and rates

Every money column is `numeric(14,2)`. Every document/payment/expense that isn't in MUR stores
`fx_rate_to_mur`, `fx_rate_date`, `fx_source` alongside it — frozen at creation, never
recalculated (spec §3.7). `src/lib/money.ts` is the only place TS code is allowed to do
arithmetic on these values, always via integer minor units.

## EBS reserved columns

`invoices.irn`, `qr_payload`, `ebs_transaction_type`, `ebs_submitted_at` are nullable and
untouched by any current code path — reserved for the MRA Electronic Billing System bolt-on
(spec §3.9), which is out of scope far below the ~MUR 80M turnover threshold that triggers it.

## Regenerating TypeScript types

`src/types/supabase.ts` is currently **hand-written** to match the migrations exactly, because
this session has no live Supabase project to introspect. Treat any drift between the two as a
bug. Once the project is linked:

```bash
SUPABASE_PROJECT_ID=<ref> npm run db:types
```

replaces it with the real generated file — after that, this file is the one to trust, not this
document.

## What was validated, and how

Every migration was applied against a real local PostgreSQL 16 (not Supabase, since no
Docker/Supabase CLI was available in this environment) with minimal stand-ins for
`auth.users`/`auth.uid()`/`auth.role()` and `storage.buckets`/`storage.objects`/`storage.foldername`.
That run exercised, and confirmed correct:

- Sequential, gapless number allocation via `fn_allocate_document_number` (FAC-2026-001, -002, -003).
- The immutability trigger rejecting both an UPDATE of a locked invoice's `total` and a DELETE
  of a locked invoice, with a clear error pointing at credit notes.
- `fn_recompute_invoice_status` flipping an invoice to `paid` after a full payment.
- `v_number_gaps` correctly detecting a deliberately-skipped number.
- The expense-category delete guard rejecting deletion of a category referenced by an expense.
- The audit trail correctly resolving `entity_id` for both `id`-keyed tables (invoices, payments)
  and `user_id`-keyed tables (`business_identity`, `app_settings`) — an actual bug caught during
  this validation and fixed in `fn_write_audit_log()` (it originally assumed every audited table
  had an `id` column).

This was not run against real Supabase (Auth/Storage/Edge Functions, GoTrue-issued JWTs, the
`authenticated`/`anon` role grants Supabase itself provisions) — do that once the project is
linked, before trusting this in production.
