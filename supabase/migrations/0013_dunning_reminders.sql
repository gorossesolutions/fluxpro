-- ---------------------------------------------------------------------------
-- Dunning reminders (spec: Rappels page, J+1/7/15/30 past due_date).
--
-- Deliberately its own table rather than a synthetic audit_log row: audit_log is documented
-- (docs/SCHEMA.md) as read-only in the UI, written only by triggers as a before/after mutation
-- trail — a "reminder sent" checkbox isn't a mutation of a tracked row, so writing it there
-- would blur what audit_log is for. This table is the same small-purpose-built-table pattern
-- as expense_categories/documents.
-- ---------------------------------------------------------------------------

create type dunning_stage as enum ('j1', 'j7', 'j15', 'j30');

create table dunning_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  stage dunning_stage not null,
  sent_at timestamptz not null default now(),
  unique (invoice_id, stage)
);

create index idx_dunning_reminders_invoice on dunning_reminders (invoice_id);

alter table dunning_reminders enable row level security;
create policy dunning_reminders_all_own on dunning_reminders for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
