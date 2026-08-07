# Edge Functions

Two functions, both under `supabase/functions/`. Neither was deployed or tested against a live
Supabase project from this environment — no Supabase CLI/project link was available here (same
constraint noted throughout `docs/MIGRATION.md`). Both were type-checked and linted with Deno
directly, and the pure date logic behind `keepalive`'s per-user interval check has its own test
suite (`supabase/functions/_shared/keepaliveDue.test.ts`) — but the actual Supabase-client calls
(inserting into `heartbeat`, upserting `fx_rates`, calling `fn_recompute_all_overdue_statuses`)
have not been exercised against a real project. Deploy and watch the first few scheduled runs
before trusting either unattended.

**These are Deno, not Node** — a genuinely different runtime from the rest of this Vite/React
project (`Deno.serve`, `npm:@supabase/supabase-js@2` specifiers, `.ts` import extensions). The
app's own `npm run typecheck`/`npm run lint` never touch `supabase/functions/` (an earlier
scaffolding pass had them listed in `tsconfig.node.json`'s `include`, which silently couldn't
have worked once these stopped being empty stub files — fixed alongside writing them). Verify
this directory with Deno directly instead:

```bash
deno check supabase/functions/**/*.ts
deno lint supabase/functions/
deno test supabase/functions/_shared/
```

## `keepalive`

Anti-pause ping + daily maintenance sweep (spec §12):

1. Writes one `heartbeat` row every run — enough on its own to keep a free-tier project from
   auto-pausing on inactivity.
2. For each user, bumps `app_settings.last_heartbeat_at` once their own
   `keepalive_interval_days` window has elapsed — a per-user record, independent of whether they
   personally opened the app that day.
3. Calls `fn_recompute_all_overdue_statuses()` — flips `issued` invoices to `overdue` once
   `due_date` has passed with no payment event. This was previously ungranted to any role
   (caught while building this function — see `0015_grant_maintenance_functions_to_service_role.sql`).

No secrets beyond what Supabase injects automatically (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`).

## `fx-snapshot`

Fetches EUR/USD/GBP/ZAR/CAD → MUR rates once a day and writes them into `fx_rates`, upserting on
`(rate_date, base_currency, quote_currency)` so a re-run the same day never duplicates. This is
Layer (c) of the 3-layer FX resolution strategy in
`src/features/reference/api.ts`'s `resolveFxRate()` — layers (a)/(b) read what this writes;
layer (d) (manual entry in the invoice/quote/expense form) is the fallback when even this has
nothing for a date.

**Primary source**: ExchangeRate-API (`v6.exchangerate-api.com`). Requires:

```bash
supabase secrets set EXCHANGERATE_API_KEY=<your key>
```

**Fallback source**: Bank of Mauritius, via `BOM_FX_SOURCE_URL`. ⚠ **Unconfirmed shape** — no
live BOM endpoint was available to inspect while building this, so the parser
(`fetchFromBomFallback` in `supabase/functions/fx-snapshot/index.ts`) only handles a flat
`{ CURRENCY: rate }` JSON response. If the real BOM page is HTML (likely, for a central bank
indicative-rate page) or a different JSON shape, this fallback currently finds nothing and logs
why rather than crashing — **it is a placeholder, not a working fallback, until someone checks
the real endpoint and updates the parser.** Setting `BOM_FX_SOURCE_URL` before that point is
harmless (the function just won't get anything useful from it) but shouldn't be treated as a
safety net yet:

```bash
supabase secrets set BOM_FX_SOURCE_URL=<the real BOM endpoint, once confirmed>
```

## Deploying

```bash
supabase functions deploy keepalive
supabase functions deploy fx-snapshot
```

## Scheduling

Both are plain HTTP-triggered functions — nothing runs them on its own. Two ways to schedule,
pick one:

1. **Supabase Cron Triggers** (dashboard → Edge Functions → your function → Cron). Simplest,
   no extra infrastructure. Set both to run daily.
2. **`pg_cron` + `pg_net`** from inside Postgres, calling the function's HTTPS URL with the
   `service_role` key in the `Authorization` header. More setup, but keeps the schedule
   version-controlled in a migration if that's preferred over the dashboard.

Either way: **daily is enough for both.** `keepalive` only actually pings a given user once
their own `keepalive_interval_days` (1–6, set in Paramètres → Application) has elapsed, so
invoking it daily just means it checks daily, not that it writes daily for someone who set a
longer interval.
