# V1 → V2 migration runbook

`scripts/migrate-v1.ts` migrates the four flat V1 tables (`factures`, `devis`, `depenses`,
`parametres`) into the normalised V2 schema (`supabase/migrations/0001`–`0007`). Read this whole
document before running it with `--confirm`.

## Before you start

1. Apply all V2 migrations to the target Supabase project (`supabase db push`).
2. Create the single Supabase Auth user for Guillaume (dashboard or `supabase auth admin
   create-user` — signup is disabled in `supabase/config.toml`, so this is a one-time manual
   step). Note the resulting user UUID — the migration script needs it as `--user-id`; nothing
   in V1 carries a user concept to derive it from.
3. Have both projects' **service-role** keys ready (V1 to read, V2 to write). Never the anon key
   — RLS would silently filter out rows the script needs to see/write.
4. Make sure nobody is actively writing to V1 while the migration runs.

## Running it

```bash
# Dry run first — always. Writes nothing, prints what it would do and a preview reconciliation.
tsx scripts/migrate-v1.ts \
  --v1-url https://<v1-project>.supabase.co --v1-service-key <v1-service-role-key> \
  --v2-url https://<v2-project>.supabase.co --v2-service-key <v2-service-role-key> \
  --user-id <guillaume-auth-user-uuid>

# Review the dry-run output, then actually write:
tsx scripts/migrate-v1.ts \
  --v1-url ... --v1-service-key ... --v2-url ... --v2-service-key ... --user-id ... \
  --confirm
```

Add `--split-details` if you want V1's free-text `desc_detail` lines that start with `- ` split
into separate zero-priced invoice lines instead of folded into the parent line's description
(see "Known lossy mappings" below — this is an explicit opt-in, not the default, because it
changes the number of rows created, not just their content).

If `parametres.siret` is set, a live run prompts interactively: **"Is the V1 siret value a
Mauritian BRN or a French SIRET?"** — the script does not guess. Answer accurately; this decides
`business_identity.identifier_type` and therefore which validation rules and country mentions
apply to every future invoice.

### What it does, in order

1. Reads all four V1 tables in full (paginated, no row-count assumption).
2. **Snapshots them to `backup/v1-YYYYMMDD.json` before touching anything.** If this write fails
   for any reason (disk, permissions), the script exits immediately without writing to V2. Never
   skip or work around this step.
3. Migrates factures → `invoices` and devis → `quotes` via `fn_migrate_insert_invoice` /
   `fn_migrate_insert_quote` (server-side RPCs in `0007_migration_functions.sql`) — each call
   inserts the parent row, its line items, and (for a paid invoice) its payment, all inside one
   PL/pgSQL function body, which Postgres runs as a single transaction. Every migrated
   invoice/quote is inserted `locked = true`: historical documents are immutable by definition,
   not just by convention.
4. Migrates depenses → `expenses` + backfilled `expense_occurrences` via
   `fn_migrate_insert_expense`, matching V1's expansion window (start date → min(end date,
   today)) so historical monthly totals don't move.
5. Migrates the single `parametres` row into `business_identity`, one `bank_accounts` row,
   `fx_rates` (one snapshot row per currency dated today, `source = 'v1_manual'`), and
   `tax_history` entries from `fiscal_history`.
6. Prints a reconciliation report (row counts, migrated vs. failed per entity) and, if V1 had a
   `forex_api_key`, instructions to move it to an Edge Function secret — **the script never
   copies that key anywhere in V2.**

### Idempotency

Every migrated row's legacy id is recorded in `migration_map` (`legacy_id`, `entity`) as part of
the same transaction that creates it. Re-running the script — after fixing a data issue, or after
a partial failure — skips anything already mapped and only processes what's left. It is always
safe to re-run with `--confirm` after a failure; it is never safe to assume a partial run left
nothing behind, so always check the reconciliation report's `failed` column, not just "did it
crash."

### Reconciliation

The report at the end shows, per entity: V1 row count, migrated count, failed count. A non-zero
`failed` count exits the process with a non-zero code — treat that as build-breaking, not
advisory. Before trusting V2's numbers, additionally spot-check by currency and year:

```sql
-- V1 (run against the V1 project)
select devise, extract(year from date) as yr, sum(montant) from factures group by 1, 2;

-- V2 (run against the V2 project, after migration)
select currency, extract(year from issue_date) as yr, sum(subtotal) from invoices where legacy_id is not null group by 1, 2;
```

These must match to the cent. If they don't, do not proceed to using V2 for real invoicing —
find the discrepancy first.

**Keep V1 live and read-only until this reconciliation is clean.**

## Rollback

The V2-side migration is additive only (it never touches anything without a `legacy_id`/
`migration_map` entry), so rollback means clearing what the script wrote, not restoring V1:

```sql
-- Run against V2, as service role. Removes only migrated rows, nothing hand-entered in V2 since.
delete from payments where invoice_id in (select id from invoices where legacy_id is not null);
delete from invoice_lines where invoice_id in (select id from invoices where legacy_id is not null);
delete from invoices where legacy_id is not null;
delete from quote_lines where quote_id in (select id from quotes where legacy_id is not null);
delete from quotes where legacy_id is not null;
delete from expense_occurrences where expense_id in (select id from expenses where legacy_id is not null);
delete from expenses where legacy_id is not null;
delete from migration_map;
```

Note the invoice/quote immutability triggers will refuse to delete `locked = true` rows through
the normal client — the block above must be run as the Postgres owner/service role directly in
the SQL editor (or temporarily via a `security definer` maintenance function), not through
PostgREST. This is intentional: it's the same protection that stops an accidental delete of a
real issued invoice, and rollback is exactly the kind of operation that should require deliberate
superuser action, not a client-callable RPC.

V1 itself is never modified by this script, so "rollback" never needs to touch V1 — if V2 is
scrapped entirely, V1 is still there, untouched, exactly as `backup/v1-YYYYMMDD.json` recorded it.

## Known lossy mappings

Be aware of these before trusting V2's historical numbers for anything beyond "roughly right":

- **No per-document FX rate in V1.** V1 stored a single current EUR/USD/GBP→MUR rate in
  `parametres`, never a rate frozen per invoice/expense. The script builds a rate map from
  `parametres.eur_mur`/`usd_mur`/`gbp_mur` up front and applies the matching rate to every
  migrated invoice/quote/expense/payment in that currency — but it's still always flagged
  `fx_source = 'v1_manual_approx'`, because it's V1's rate *on the day of migration*, not the
  rate that was actually in effect on each document's original issue date. Treat every migrated
  document's MUR conversion as approximate, never as frozen-accurate the way a native V2
  document (with a true issue-date rate) is. A currency with no rate in `parametres` falls back
  to `1`, which is almost certainly wrong — check the reconciliation output for any such
  currency before trusting its totals.
- **Country is inferred from free-text address, not stored structured data.** V1 never had a
  country field. `inferCountryCode()` matches known keywords (country/city names) in the address
  string; anything it can't match comes through as `country_code = null`, surfaced in the Clients
  list as needing manual completion. Don't assume every migrated client's country is correct —
  spot-check the ones the heuristic did match, too.
- **`supply_treatment` on historical documents is a best-effort classification, not a
  re-assertion.** Defaults to zero-rated export when the country can't be inferred (GR AdLab's
  client base is predominantly foreign), domestic only when the country resolves to `MU`. This
  is new V2 metadata V1 never had — it doesn't change what was actually invoiced historically,
  but don't regenerate a "corrected" PDF for an old invoice based on it without checking the
  original facts first.
- **`desc_titre` + `desc_detail` → one line by default.** Folds the free-text detail into the
  single invoice line's `description`. Pass `--split-details` to instead split `- ` prefixed
  detail lines into their own zero-priced lines — a lossy transformation either way, since V1's
  detail field was unstructured prose, not real line items.
- **`seuil_impot`/`taux_impot` are discarded, not migrated.** V1's flat 15% tax model is obsolete
  (Finance Act 2025 replaced it with progressive bands — spec §3.1); the script logs this loudly
  and does not attempt to translate the old threshold/rate into anything in `tax_bands`/
  `tax_config`, which are seeded independently from the actual current law.
- **`parametres.siret` → BRN or SIRET is an operator decision, not inferred.** The script prompts
  interactively on a live run rather than guessing from the string shape.
- **Payment date/method for migrated "payée" invoices is approximate.** V1 recorded no separate
  payment date — the migration records the payment on the invoice's own `date`, method
  `'v1_migration'`. If the real payment date is known and matters (aged-receivables accuracy,
  cash-flow reporting for that period), correct it manually in V2 after migration.

## Validation performed on this migration tooling

The server-side RPC layer (`0007_migration_functions.sql`) — client dedupe, invoice insertion
with lines and an attached historical payment, idempotent re-run behaviour, and the resulting
locked row correctly rejecting a financial-field update — was functionally verified against a
real local PostgreSQL 16 instance during this build step (no live Supabase/V1 data was available
to test against; see `docs/SCHEMA.md`). The pure mapping functions (`scripts/lib/mappers.ts`) have
full Vitest coverage (`scripts/lib/mappers.test.ts`) including country inference, tax computation
edge cases, and recurrence backfill boundaries. **The TypeScript orchestrator
(`scripts/migrate-v1.ts`) itself has not been run end-to-end against a live V1 project** — none
exists yet in this environment. Run the dry-run mode against the real V1 project first, read its
output carefully, and only then use `--confirm`.
