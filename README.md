# FluxPro V2

Internal accounting and invoicing app for **GR AdLab** (Guillaume Rosse, Mauritius). Rewrite of the V1 single-file
prototype — see `docs/COMPLIANCE.md`, `docs/MIGRATION.md` and `docs/SCHEMA.md` for the rules and data model behind
the code.

Stack: Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS v4 + React Router v6 + TanStack Query/Table +
React Hook Form/Zod + Supabase (Postgres/Auth/Storage/Edge Functions) + pdfmake, deployed on Netlify.

## Local setup

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Requires Node 20+. Run `npm run typecheck`, `npm run lint` and `npm test` before pushing — CI (`.github/workflows/ci.yml`)
runs the same checks on every push/PR and fails the build on any error.

## Database migrations

SQL migrations live in `supabase/migrations/`, numbered and checked in. Apply them against your Supabase project
with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

After any schema change, regenerate the TypeScript types committed at `src/types/supabase.ts`:

```bash
SUPABASE_PROJECT_ID=<your-project-ref> npm run db:types
```

## Running the V1 → V2 migration script

`scripts/migrate-v1.ts` migrates the four flat V1 tables (`factures`, `devis`, `depenses`, `parametres`) into the
normalised V2 schema. Full runbook, field-by-field mapping and rollback procedure: `docs/MIGRATION.md`.

```bash
# Dry run (default) — writes nothing, prints what it would do
tsx scripts/migrate-v1.ts --v1-url <url> --v1-service-key <key> --v2-url <url> --v2-service-key <key>

# Actually write, after reviewing the dry run
tsx scripts/migrate-v1.ts --v1-url <url> --v1-service-key <key> --v2-url <url> --v2-service-key <key> --confirm
```

The script snapshots all four V1 tables to `backup/v1-YYYYMMDD.json` before touching anything, and refuses to
proceed if that snapshot fails. Keep V1 live and read-only until the reconciliation report it prints at the end
is clean (zero variance between V1 and V2 totals).

## Rotating the ExchangeRate API key

The ExchangeRate-API key is never stored in the client bundle or in the `app_settings`/`parametres` table — it
lives only as a Supabase Edge Function secret, used by the `fx-snapshot` function.

```bash
supabase secrets set EXCHANGERATE_API_KEY=<new-key> --project-ref <your-project-ref>
```

Paramètres → Fiscalité shows only "Clé configurée ✓ / Non configurée" and a "Tester la connexion" button — it
never reads the key itself.

## Keep-alive

Supabase free-tier projects pause after 7 days of inactivity. `.github/workflows/keepalive.yml` runs every 2 days,
writes a heartbeat row and triggers the `fx-snapshot` Edge Function (one cron, two jobs: anti-pause + building a
proprietary daily FX history). GitHub disables scheduled workflows after 60 days with no repository activity —
**push something at least once every couple of months**, and consider adding a free external pinger
(cron-job.org / UptimeRobot) against a lightweight public Edge Function endpoint as a second line of defence.

## Scope

Out of scope for V2 (see `docs/COMPLIANCE.md` and the build brief for the full list): OCR, e-signature, EBS
e-invoicing integration, Stripe payment links, time tracking, mileage. Reserved schema columns exist so these are
bolt-ons later, not migrations.
