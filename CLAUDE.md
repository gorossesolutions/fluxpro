# Working on FluxPro V2

Internal accounting/invoicing app for GR AdLab, rewritten from a V1 single-file prototype.
`README.md` covers stack/setup; `docs/COMPLIANCE.md`, `docs/MIGRATION.md`, `docs/SCHEMA.md` cover the
rules and data model. This file is operating guidance for whoever (human or AI) works on the codebase next.

## Product direction: build toward multi-org with roles

GR AdLab intends to commercialize platforms like this one — FluxPro is not staying a single-user
internal tool indefinitely, and the same intent applies to future platforms built the same way.
**When making architecture, schema, or auth decisions on this project (and on future ones built for
the same purpose), keep multi-organization support with role-based access in mind as the direction
of travel**, even when the immediate task doesn't require it yet.

This does not mean over-engineering every feature for multi-tenancy today. It means: when a choice is
close, prefer the one that doesn't make a later multi-org + roles retrofit harder than it has to be.

### Where things stand today (as of this note)

Every business table (`clients`, `invoices`, `expenses`, `business_identity`, etc.) is scoped by a
`user_id` column, and RLS enforces `user_id = auth.uid()` — full ownership, one Supabase Auth user
per isolated dataset, no sharing between users, no roles. This has been useful as a stopgap:

- **Separate companies, fully isolated** (e.g. a demo account, or eventually a second real company):
  works today with zero schema changes — provision a second Supabase Auth user, each account's data
  is completely invisible to the other via RLS. See the demo-account seed script precedent in this
  project's history for the exact steps.
- **A second person (assistant, employee, accountant) working inside the SAME company's data**: not
  supported today. The only options right now are sharing login credentials directly (no audit trail,
  no granular permissions, can't be revoked independently) or building real support for it.

### The actual multi-org + roles model, when it's time to build it

Two related but distinct capabilities, worth keeping conceptually separate when designing:

1. **Multiple isolated organizations** — a user (or a small team) managing several separate
   companies' books, switchable without re-authenticating. Needs: an `organizations` table, an
   `org_id` column on every business table (replacing or supplementing today's `user_id`), an
   org-membership table, an org switcher in the UI, and every RLS policy (~40 of them) rewritten to
   check org membership instead of `user_id = auth.uid()` directly.
2. **Multiple people, one organization, different permission levels** — a lighter-weight need: an
   owner can grant a collaborator (read-only reviewer, or full read-write assistant) access to their
   existing data without a full org rewrite. Needs: a membership/delegation table (e.g.
   `account_collaborators`: `owner_id`, `collaborator_id`, `role`) and RLS policies extended to check
   either direct ownership or an active delegation — no `org_id` migration on business tables required
   for this one.

If/when this becomes the actual task, treat it as a real migration project (new tables, RLS rewrite,
UI for org switching/invites, decide on role granularity) — not a quick patch. Plan for it explicitly
rather than backing into it.

## Working conventions (carried over from this project's build history)

- Money is stored as `numeric(14,2)` in Postgres and handled as integer minor units in TypeScript via
  `src/lib/money.ts` — never float arithmetic on money.
- SQL migrations are numbered and checked into `supabase/migrations/`. **The user applies them
  manually via the Supabase SQL Editor — a `git pull` never touches the live database.** This has been
  a repeated source of drift (partial pastes, skipped files); when in doubt, give the exact SQL to run
  and say so explicitly, distinct from any code/deploy step.
- Before any DB-touching change ships, validate it against a real local Postgres instance (not just by
  inspection) — apply the schema, simulate the RLS role-switching PostgREST does, and confirm the
  actual behavior. Before any UI change ships, verify it in a real headless browser against
  realistic mocked Supabase responses, not just "the code looks right."
- Run `npm run typecheck`, `npm run lint`, and `npm test` before every commit; `npm run build` before
  anything that could affect the production bundle.
