-- Row-level security. Enabled on every table (spec §4). Owner-only SELECT/INSERT/UPDATE;
-- DELETE is further restricted (or blocked entirely) on immutable financial documents by
-- triggers in 0003_functions.sql — RLS here is the ownership boundary, triggers are the
-- compliance boundary, and they are deliberately layered rather than merged.

-- ---------------------------------------------------------------------------
-- Owner-scoped tables: standard "user_id = auth.uid()" policy on every action
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
create policy profiles_select_own on profiles for select using (id = auth.uid());
create policy profiles_update_own on profiles for update using (id = auth.uid());

alter table business_identity enable row level security;
create policy business_identity_all_own on business_identity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table bank_accounts enable row level security;
create policy bank_accounts_all_own on bank_accounts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table clients enable row level security;
create policy clients_all_own on clients for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table document_sequences enable row level security;
create policy document_sequences_select_own on document_sequences for select using (user_id = auth.uid());
-- No direct insert/update policy: allocation only happens through the SECURITY DEFINER
-- fn_allocate_document_number() function (0003_functions.sql), never a raw client write.

alter table invoices enable row level security;
create policy invoices_select_own on invoices for select using (user_id = auth.uid());
create policy invoices_insert_own on invoices for insert with check (user_id = auth.uid());
create policy invoices_update_own on invoices for update using (user_id = auth.uid());
create policy invoices_delete_own on invoices for delete using (user_id = auth.uid());
-- ^ DELETE is permitted by RLS only for the owner; the immutability trigger then blocks it
--   outright once the row is locked (issued). Drafts may be deleted.

alter table invoice_lines enable row level security;
create policy invoice_lines_all_own on invoice_lines for all
  using (exists (select 1 from invoices i where i.id = invoice_lines.invoice_id and i.user_id = auth.uid()))
  with check (exists (select 1 from invoices i where i.id = invoice_lines.invoice_id and i.user_id = auth.uid()));

alter table quotes enable row level security;
create policy quotes_all_own on quotes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table quote_lines enable row level security;
create policy quote_lines_all_own on quote_lines for all
  using (exists (select 1 from quotes q where q.id = quote_lines.quote_id and q.user_id = auth.uid()))
  with check (exists (select 1 from quotes q where q.id = quote_lines.quote_id and q.user_id = auth.uid()));

alter table credit_notes enable row level security;
create policy credit_notes_select_own on credit_notes for select using (user_id = auth.uid());
create policy credit_notes_insert_own on credit_notes for insert with check (user_id = auth.uid());
create policy credit_notes_update_own on credit_notes for update using (user_id = auth.uid());
create policy credit_notes_delete_own on credit_notes for delete using (user_id = auth.uid());

alter table credit_note_lines enable row level security;
create policy credit_note_lines_all_own on credit_note_lines for all
  using (exists (select 1 from credit_notes c where c.id = credit_note_lines.credit_note_id and c.user_id = auth.uid()))
  with check (exists (select 1 from credit_notes c where c.id = credit_note_lines.credit_note_id and c.user_id = auth.uid()));

alter table payments enable row level security;
create policy payments_all_own on payments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table expenses enable row level security;
create policy expenses_all_own on expenses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table expense_occurrences enable row level security;
create policy expense_occurrences_all_own on expense_occurrences for all
  using (exists (select 1 from expenses e where e.id = expense_occurrences.expense_id and e.user_id = auth.uid()))
  with check (exists (select 1 from expenses e where e.id = expense_occurrences.expense_id and e.user_id = auth.uid()));

alter table documents enable row level security;
create policy documents_all_own on documents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table tax_history enable row level security;
create policy tax_history_all_own on tax_history for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table audit_log enable row level security;
create policy audit_log_select_own on audit_log for select using (user_id = auth.uid());
create policy audit_log_insert_own on audit_log for insert with check (user_id = auth.uid());
-- No update/delete policy at all: the audit trail cannot be altered from the client, ever.

alter table app_settings enable row level security;
create policy app_settings_all_own on app_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table migration_map enable row level security;
-- No policies: migration_map is an internal idempotency ledger for scripts/migrate-v1.ts.
-- Only the service role (which bypasses RLS) ever touches it; the client app has no use for it.

-- ---------------------------------------------------------------------------
-- expense_categories — system rows (user_id null) are shared read-only reference data;
-- user-defined rows behave like owner-scoped rows.
-- ---------------------------------------------------------------------------

alter table expense_categories enable row level security;
create policy expense_categories_select on expense_categories for select
  using (user_id is null or user_id = auth.uid());
create policy expense_categories_insert_own on expense_categories for insert
  with check (user_id = auth.uid());
create policy expense_categories_update_own on expense_categories for update
  using (user_id = auth.uid());
create policy expense_categories_delete_own on expense_categories for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Global reference tables: readable by any authenticated user, writable only by
-- service role (migrations / Edge Functions), which bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table fx_rates enable row level security;
create policy fx_rates_select_authenticated on fx_rates for select using (auth.role() = 'authenticated');

alter table tax_bands enable row level security;
create policy tax_bands_select_authenticated on tax_bands for select using (auth.role() = 'authenticated');

alter table tax_config enable row level security;
create policy tax_config_select_authenticated on tax_config for select using (auth.role() = 'authenticated');

alter table country_rules enable row level security;
create policy country_rules_select_authenticated on country_rules for select using (auth.role() = 'authenticated');

alter table heartbeat enable row level security;
create policy heartbeat_select_authenticated on heartbeat for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Storage — private buckets, signed-URL access only (spec §3.8, §10).
-- Objects are namespaced {user_id}/... so an owner-prefix check is sufficient.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documents', 'documents', false, 10485760),  -- justificatifs inbox, 10MB/file (spec §10)
  ('logos', 'logos', false, 2097152)             -- business logo for PDF export
on conflict (id) do nothing;

create policy storage_documents_owner on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_logos_owner on storage.objects for all
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
