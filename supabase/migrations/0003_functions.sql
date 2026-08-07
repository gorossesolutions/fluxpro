-- Functions and triggers enforcing the compliance rules that RLS alone cannot express:
-- invoice/credit-note immutability (spec §3.5), atomic sequential numbering, derived
-- invoice status, the audit trail, and the number-gap check.

-- ---------------------------------------------------------------------------
-- New-user bootstrap — populates profiles + app_settings when the (single) Supabase
-- auth user is created. Signup is disabled (supabase/config.toml auth.email.enable_signup
-- = false); the account is provisioned once via the Supabase dashboard/CLI, and this
-- trigger just makes sure the app-side rows exist the first time that account logs in.
-- ---------------------------------------------------------------------------

create function fn_handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.app_settings (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_auth_users_bootstrap
  after insert on auth.users
  for each row execute function fn_handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function fn_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_clients_updated_at before update on clients
  for each row execute function fn_set_updated_at();
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function fn_set_updated_at();
create trigger trg_quotes_updated_at before update on quotes
  for each row execute function fn_set_updated_at();
create trigger trg_expenses_updated_at before update on expenses
  for each row execute function fn_set_updated_at();
create trigger trg_documents_updated_at before update on documents
  for each row execute function fn_set_updated_at();
create trigger trg_business_identity_updated_at before update on business_identity
  for each row execute function fn_set_updated_at();
create trigger trg_app_settings_updated_at before update on app_settings
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- fn_allocate_document_number — atomic, gapless numbering (spec §3.5).
-- SECURITY DEFINER so the client never writes document_sequences directly;
-- the row lock (via the primary key) serialises concurrent issuances.
-- ---------------------------------------------------------------------------

create function fn_allocate_document_number(p_prefix document_number_prefix, p_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into document_sequences (user_id, prefix, year, last_number)
  values (auth.uid(), p_prefix, p_year, 0)
  on conflict (user_id, prefix, year) do nothing;

  update document_sequences
  set last_number = last_number + 1
  where user_id = auth.uid() and prefix = p_prefix and year = p_year
  returning last_number into v_next;

  return p_prefix::text || '-' || p_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function fn_allocate_document_number(document_number_prefix, integer) from public;
grant execute on function fn_allocate_document_number(document_number_prefix, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Immutability: once locked (issued), financial fields cannot be UPDATEd and the
-- row cannot be DELETEd. Corrections happen exclusively via credit notes.
-- ---------------------------------------------------------------------------

create function fn_guard_invoice_immutability() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.locked then
      raise exception 'Cannot delete an issued invoice (%). Issue a credit note instead.', old.number;
    end if;
    return old;
  end if;

  -- UPDATE
  if old.locked then
    if new.number is distinct from old.number
      or new.client_id is distinct from old.client_id
      or new.client_snapshot is distinct from old.client_snapshot
      or new.issue_date is distinct from old.issue_date
      or new.currency is distinct from old.currency
      or new.fx_rate_to_mur is distinct from old.fx_rate_to_mur
      or new.subtotal is distinct from old.subtotal
      or new.tax_rate is distinct from old.tax_rate
      or new.tax_amount is distinct from old.tax_amount
      or new.total is distinct from old.total
      or new.locked is distinct from old.locked
    then
      raise exception 'Invoice % is issued and its financial fields are locked. Issue a credit note instead.', old.number;
    end if;
    -- Whitelisted: status, status_override, due_date, notes, EBS bolt-on columns, updated_at.
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_invoices_immutability
  before update or delete on invoices
  for each row execute function fn_guard_invoice_immutability();

create function fn_guard_invoice_lines_immutability() returns trigger as $$
declare
  v_locked boolean;
begin
  select locked into v_locked from invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if v_locked then
    raise exception 'Cannot modify line items of an issued invoice. Issue a credit note instead.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_invoice_lines_immutability
  before insert or update or delete on invoice_lines
  for each row execute function fn_guard_invoice_lines_immutability();

create function fn_guard_credit_note_immutability() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.locked then
      raise exception 'Cannot delete an issued credit note (%).', old.number;
    end if;
    return old;
  end if;

  if old.locked then
    if new.number is distinct from old.number
      or new.total is distinct from old.total
      or new.subtotal is distinct from old.subtotal
      or new.tax_amount is distinct from old.tax_amount
      or new.locked is distinct from old.locked
    then
      raise exception 'Credit note % is issued and locked.', old.number;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_credit_notes_immutability
  before update or delete on credit_notes
  for each row execute function fn_guard_credit_note_immutability();

-- ---------------------------------------------------------------------------
-- Derived invoice status from payments (spec §7: "status is derived, not typed").
-- Skipped entirely when status_override is set — the manual escape hatch, logged
-- to audit_log separately by the app layer when it flips status_override on.
-- ---------------------------------------------------------------------------

create function fn_recompute_invoice_status(p_invoice_id uuid) returns void as $$
declare
  v_total numeric(14, 2);
  v_paid numeric(14, 2);
  v_due_date date;
  v_status invoice_status;
  v_override boolean;
begin
  select total, due_date, status, status_override into v_total, v_due_date, v_status, v_override
  from invoices where id = p_invoice_id;

  if v_status is null or v_status = 'draft' or v_status = 'cancelled' or v_override then
    return;
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice_id;

  if v_paid >= v_total and v_total > 0 then
    update invoices set status = 'paid' where id = p_invoice_id and status is distinct from 'paid';
  elsif v_due_date is not null and v_due_date < current_date then
    update invoices set status = 'overdue' where id = p_invoice_id and status is distinct from 'overdue';
  else
    update invoices set status = 'issued' where id = p_invoice_id and status is distinct from 'issued';
  end if;
end;
$$ language plpgsql;

create function fn_payments_recompute_status() returns trigger as $$
begin
  perform fn_recompute_invoice_status(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_payments_recompute_status
  after insert or update or delete on payments
  for each row execute function fn_payments_recompute_status();

-- Nightly sweep for due_date-driven overdue transitions with no payment event
-- (called by the daily maintenance Edge Function, spec §12).
create function fn_recompute_all_overdue_statuses() returns void as $$
begin
  update invoices
  set status = 'overdue'
  where status = 'issued' and due_date is not null and due_date < current_date;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function fn_recompute_all_overdue_statuses() from public;

-- ---------------------------------------------------------------------------
-- expense_categories — archive, never delete, a category still referenced by an expense.
-- ---------------------------------------------------------------------------

create function fn_guard_expense_category_delete() returns trigger as $$
begin
  if exists (select 1 from expenses where category_id = old.id) then
    raise exception 'Category "%" is referenced by existing expenses. Archive it instead of deleting it.', old.label_fr;
  end if;
  return old;
end;
$$ language plpgsql;

create trigger trg_expense_categories_guard_delete
  before delete on expense_categories
  for each row execute function fn_guard_expense_category_delete();

-- ---------------------------------------------------------------------------
-- Audit trail — before/after snapshots on every mutation of a compliance-relevant table.
-- ---------------------------------------------------------------------------

create function fn_write_audit_log() returns trigger as $$
declare
  v_user_id uuid;
  v_entity_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id, auth.uid());
  -- Not every audited table has an `id` column (business_identity and app_settings are
  -- keyed on user_id) — extract via jsonb so a missing key returns null instead of erroring.
  v_entity_id := coalesce(
    (to_jsonb(coalesce(new, old))->>'id')::uuid,
    (to_jsonb(coalesce(new, old))->>'user_id')::uuid
  );
  insert into audit_log (user_id, entity_type, entity_id, action, actor, before, after)
  values (
    v_user_id,
    tg_table_name,
    v_entity_id,
    tg_op,
    auth.uid()::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_audit_invoices after insert or update or delete on invoices
  for each row execute function fn_write_audit_log();
create trigger trg_audit_credit_notes after insert or update or delete on credit_notes
  for each row execute function fn_write_audit_log();
create trigger trg_audit_quotes after insert or update or delete on quotes
  for each row execute function fn_write_audit_log();
create trigger trg_audit_payments after insert or update or delete on payments
  for each row execute function fn_write_audit_log();
create trigger trg_audit_app_settings after insert or update or delete on app_settings
  for each row execute function fn_write_audit_log();
create trigger trg_audit_business_identity after insert or update or delete on business_identity
  for each row execute function fn_write_audit_log();

-- ---------------------------------------------------------------------------
-- Number-gap check — surfaced as a red banner on the Fiscalité page (spec §3.5).
-- security_invoker so it runs under the calling user's own RLS, not the view owner's.
-- ---------------------------------------------------------------------------

create view v_number_gaps
with (security_invoker = true) as
with issued_numbers as (
  select user_id, 'FAC'::document_number_prefix as prefix,
         split_part(number, '-', 2)::integer as year,
         split_part(number, '-', 3)::integer as seq
  from invoices where number is not null
  union all
  select user_id, 'AV'::document_number_prefix,
         split_part(number, '-', 2)::integer,
         split_part(number, '-', 3)::integer
  from credit_notes where number is not null
),
expected_numbers as (
  select user_id, prefix, year, generate_series(1, last_number) as seq
  from document_sequences
  where prefix in ('FAC', 'AV') and last_number > 0
)
select e.user_id, e.prefix, e.year, e.seq as missing_number
from expected_numbers e
left join issued_numbers n
  on n.user_id = e.user_id and n.prefix = e.prefix and n.year = e.year and n.seq = e.seq
where n.seq is null
order by e.user_id, e.prefix, e.year, e.seq;
