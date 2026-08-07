-- Server-side helpers for scripts/migrate-v1.ts (spec §13). Each function performs one
-- entity's full multi-table write (parent row + line items + linked payment/occurrences +
-- the migration_map idempotency record) inside a single PL/pgSQL function body, which
-- Postgres runs as one transaction — this is what "wrap each entity in a transaction" means
-- in practice when the caller is a REST/RPC client rather than a raw DB connection: if
-- anything inside the function raises, the whole entity's writes roll back together.
--
-- SECURITY DEFINER and *not* granted to `authenticated`: every function here takes an
-- explicit p_user_id, which would be a privilege-escalation path if a normal authenticated
-- user could call it for an arbitrary user_id. Only the service-role key the migration
-- script runs with can invoke these (the service role bypasses grants entirely).

-- ---------------------------------------------------------------------------
-- Client dedupe/create — matched on normalised (name, email) per user (spec §13).
-- First-write-wins: an existing match is returned as-is, never overwritten, so re-running
-- the migration can't silently rewrite manual edits made to an already-migrated client.
-- ---------------------------------------------------------------------------

create function fn_migrate_upsert_client(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_address text,
  p_country_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name_norm text := lower(trim(p_name));
  v_email_norm text := lower(trim(coalesce(p_email, '')));
begin
  select id into v_id
  from clients
  where user_id = p_user_id
    and lower(trim(name)) = v_name_norm
    and lower(trim(coalesce(email, ''))) = v_email_norm
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into clients (user_id, name, email, address_line1, country_code, default_currency)
  values (p_user_id, p_name, nullif(trim(p_email), ''), nullif(trim(p_address), ''), p_country_code, 'EUR')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function fn_migrate_upsert_client(uuid, text, text, text, text) from public, authenticated;

-- ---------------------------------------------------------------------------
-- Invoice: insert unlocked so lines can be written, attach the optional historical
-- payment (V1 "payée" rows carry no payment date/method beyond the invoice date itself —
-- spec §13 explicitly accepts this as the best available data), then lock.
-- ---------------------------------------------------------------------------

create function fn_migrate_insert_invoice(p_user_id uuid, p_payload jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
  v_line jsonb;
  v_position integer := 0;
begin
  select new_id into v_existing from migration_map where legacy_id = p_payload->>'legacy_id' and entity = 'invoice';
  if v_existing is not null then
    return v_existing;
  end if;

  insert into invoices (
    user_id, legacy_id, number, client_id, client_snapshot, issue_date, due_date,
    currency, fx_rate_to_mur, fx_rate_date, fx_source,
    subtotal, tax_rate, tax_amount, total,
    status, supply_treatment, country_mention, payment_terms, locked, issued_at
  ) values (
    p_user_id,
    p_payload->>'legacy_id',
    p_payload->>'number',
    nullif(p_payload->>'client_id', '')::uuid,
    coalesce(p_payload->'client_snapshot', '{}'::jsonb),
    (p_payload->>'issue_date')::date,
    nullif(p_payload->>'due_date', '')::date,
    p_payload->>'currency',
    (p_payload->>'fx_rate_to_mur')::numeric,
    nullif(p_payload->>'fx_rate_date', '')::date,
    p_payload->>'fx_source',
    (p_payload->>'subtotal')::numeric,
    (p_payload->>'tax_rate')::numeric,
    (p_payload->>'tax_amount')::numeric,
    (p_payload->>'total')::numeric,
    (p_payload->>'status')::invoice_status,
    (p_payload->>'supply_treatment')::supply_treatment,
    p_payload->>'country_mention',
    coalesce((p_payload->>'payment_terms')::integer, 30),
    false,
    (p_payload->>'issue_date')::timestamptz
  )
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    v_position := v_position + 1;
    insert into invoice_lines (invoice_id, position, title, description, quantity, unit_price, line_total)
    values (
      v_id,
      v_position,
      v_line->>'title',
      v_line->>'description',
      coalesce((v_line->>'quantity')::numeric, 1),
      (v_line->>'unit_price')::numeric,
      (v_line->>'line_total')::numeric
    );
  end loop;

  if p_payload->'payment' is not null and p_payload->'payment' <> 'null'::jsonb then
    insert into payments (user_id, invoice_id, amount, currency, fx_rate_to_mur, fx_rate_date, payment_date, method)
    values (
      p_user_id,
      v_id,
      (p_payload->'payment'->>'amount')::numeric,
      p_payload->'payment'->>'currency',
      coalesce((p_payload->'payment'->>'fx_rate_to_mur')::numeric, 1),
      nullif(p_payload->'payment'->>'fx_rate_date', '')::date,
      (p_payload->'payment'->>'payment_date')::date,
      'v1_migration'
    );
  end if;

  update invoices set locked = true where id = v_id;

  insert into migration_map (legacy_id, new_id, entity) values (p_payload->>'legacy_id', v_id, 'invoice');

  return v_id;
end;
$$;

revoke all on function fn_migrate_insert_invoice(uuid, jsonb) from public, authenticated;

-- ---------------------------------------------------------------------------
-- Quote: same shape, no payment concept.
-- ---------------------------------------------------------------------------

create function fn_migrate_insert_quote(p_user_id uuid, p_payload jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
  v_line jsonb;
  v_position integer := 0;
begin
  select new_id into v_existing from migration_map where legacy_id = p_payload->>'legacy_id' and entity = 'quote';
  if v_existing is not null then
    return v_existing;
  end if;

  insert into quotes (
    user_id, legacy_id, number, client_id, client_snapshot, issue_date,
    currency, fx_rate_to_mur, fx_rate_date, fx_source,
    subtotal, tax_rate, tax_amount, total,
    status, supply_treatment, country_mention, payment_terms, locked, issued_at
  ) values (
    p_user_id,
    p_payload->>'legacy_id',
    p_payload->>'number',
    nullif(p_payload->>'client_id', '')::uuid,
    coalesce(p_payload->'client_snapshot', '{}'::jsonb),
    (p_payload->>'issue_date')::date,
    p_payload->>'currency',
    (p_payload->>'fx_rate_to_mur')::numeric,
    nullif(p_payload->>'fx_rate_date', '')::date,
    p_payload->>'fx_source',
    (p_payload->>'subtotal')::numeric,
    (p_payload->>'tax_rate')::numeric,
    (p_payload->>'tax_amount')::numeric,
    (p_payload->>'total')::numeric,
    (p_payload->>'status')::quote_status,
    (p_payload->>'supply_treatment')::supply_treatment,
    p_payload->>'country_mention',
    coalesce((p_payload->>'payment_terms')::integer, 30),
    false,
    (p_payload->>'issue_date')::timestamptz
  )
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    v_position := v_position + 1;
    insert into quote_lines (quote_id, position, title, description, quantity, unit_price, line_total)
    values (
      v_id,
      v_position,
      v_line->>'title',
      v_line->>'description',
      coalesce((v_line->>'quantity')::numeric, 1),
      (v_line->>'unit_price')::numeric,
      (v_line->>'line_total')::numeric
    );
  end loop;

  update quotes set locked = true where id = v_id;

  insert into migration_map (legacy_id, new_id, entity) values (p_payload->>'legacy_id', v_id, 'quote');

  return v_id;
end;
$$;

revoke all on function fn_migrate_insert_quote(uuid, jsonb) from public, authenticated;

-- ---------------------------------------------------------------------------
-- Expense: template row + backfilled occurrences, matching V1's expansion window so
-- historical monthly totals don't move (spec §13).
-- ---------------------------------------------------------------------------

create function fn_migrate_insert_expense(p_user_id uuid, p_payload jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
  v_category_id uuid;
  v_occurrence jsonb;
begin
  select new_id into v_existing from migration_map where legacy_id = p_payload->>'legacy_id' and entity = 'expense';
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_category_id
  from expense_categories
  where key = p_payload->>'category_key' and (user_id is null or user_id = p_user_id)
  order by user_id nulls last
  limit 1;

  insert into expenses (
    user_id, legacy_id, supplier, description, category_id, amount, currency,
    fx_rate_to_mur, fx_rate_date, fx_source, expense_date,
    recurrence, recurrence_interval, recurrence_end_date, is_deductible, vat_amount
  ) values (
    p_user_id,
    p_payload->>'legacy_id',
    p_payload->>'supplier',
    p_payload->>'description',
    v_category_id,
    (p_payload->>'amount')::numeric,
    p_payload->>'currency',
    (p_payload->>'fx_rate_to_mur')::numeric,
    nullif(p_payload->>'fx_rate_date', '')::date,
    p_payload->>'fx_source',
    (p_payload->>'expense_date')::date,
    (p_payload->>'recurrence')::recurrence_type,
    nullif(p_payload->>'recurrence_interval', '')::integer,
    nullif(p_payload->>'recurrence_end_date', '')::date,
    coalesce((p_payload->>'is_deductible')::boolean, true),
    coalesce((p_payload->>'vat_amount')::numeric, 0)
  )
  returning id into v_id;

  for v_occurrence in select * from jsonb_array_elements(coalesce(p_payload->'occurrences', '[]'::jsonb))
  loop
    insert into expense_occurrences (expense_id, occurrence_date, amount, amount_mur, is_generated)
    values (
      v_id,
      (v_occurrence->>'occurrence_date')::date,
      (v_occurrence->>'amount')::numeric,
      (v_occurrence->>'amount_mur')::numeric,
      true
    )
    on conflict (expense_id, occurrence_date) do nothing;
  end loop;

  insert into migration_map (legacy_id, new_id, entity) values (p_payload->>'legacy_id', v_id, 'expense');

  return v_id;
end;
$$;

revoke all on function fn_migrate_insert_expense(uuid, jsonb) from public, authenticated;
