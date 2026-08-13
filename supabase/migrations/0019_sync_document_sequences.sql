-- fn_migrate_insert_invoice / fn_migrate_insert_quote (0007_migration_functions.sql) insert
-- historical, already-numbered documents straight from V1 data — but never touch
-- document_sequences, which is the ONLY thing fn_allocate_document_number (0003_functions.sql)
-- reads to decide the next number. So after running scripts/migrate-v1.ts, the counter for
-- every (user, prefix, year) that received migrated data stays at 0, and the very next
-- invoice/quote issued through the normal app flow gets allocated a number that already
-- exists among the migrated rows — "duplicate key value violates unique constraint
-- invoices_number_key" (or quotes_number_key), caught live while trying to issue a new
-- invoice after a V1 migration had run.
--
-- Two parts: (1) a one-time corrective resync of document_sequences to the actual highest
-- number already in use, so anyone already hit by this can issue again immediately; (2) fixing
-- the two migration-insert functions so this can't happen again on any future migration run.

-- ---------------------------------------------------------------------------
-- One-time resync — safe to re-run (always takes the greatest of what's stored vs. derived).
-- ---------------------------------------------------------------------------

insert into document_sequences (user_id, prefix, year, last_number)
select user_id, 'FAC'::document_number_prefix, split_part(number, '-', 2)::integer, max(split_part(number, '-', 3)::integer)
from invoices
where number is not null and number like 'FAC-%'
group by user_id, split_part(number, '-', 2)::integer
on conflict (user_id, prefix, year) do update
  set last_number = greatest(document_sequences.last_number, excluded.last_number);

insert into document_sequences (user_id, prefix, year, last_number)
select user_id, 'DEV'::document_number_prefix, split_part(number, '-', 2)::integer, max(split_part(number, '-', 3)::integer)
from quotes
where number is not null and number like 'DEV-%'
group by user_id, split_part(number, '-', 2)::integer
on conflict (user_id, prefix, year) do update
  set last_number = greatest(document_sequences.last_number, excluded.last_number);

insert into document_sequences (user_id, prefix, year, last_number)
select user_id, 'AV'::document_number_prefix, split_part(number, '-', 2)::integer, max(split_part(number, '-', 3)::integer)
from credit_notes
where number is not null and number like 'AV-%'
group by user_id, split_part(number, '-', 2)::integer
on conflict (user_id, prefix, year) do update
  set last_number = greatest(document_sequences.last_number, excluded.last_number);

-- ---------------------------------------------------------------------------
-- Root-cause fix — both migration-insert functions now keep document_sequences in step with
-- whatever number they just wrote, the same way a real issuance through the app would.
-- ---------------------------------------------------------------------------

create or replace function fn_migrate_insert_invoice(p_user_id uuid, p_payload jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
  v_line jsonb;
  v_position integer := 0;
  v_number text := p_payload->>'number';
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
    v_number,
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

  if v_number is not null then
    insert into document_sequences (user_id, prefix, year, last_number)
    values (p_user_id, 'FAC', split_part(v_number, '-', 2)::integer, split_part(v_number, '-', 3)::integer)
    on conflict (user_id, prefix, year) do update
      set last_number = greatest(document_sequences.last_number, excluded.last_number);
  end if;

  return v_id;
end;
$$;

revoke all on function fn_migrate_insert_invoice(uuid, jsonb) from public, authenticated;

create or replace function fn_migrate_insert_quote(p_user_id uuid, p_payload jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
  v_line jsonb;
  v_position integer := 0;
  v_number text := p_payload->>'number';
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
    v_number,
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

  if v_number is not null then
    insert into document_sequences (user_id, prefix, year, last_number)
    values (p_user_id, 'DEV', split_part(v_number, '-', 2)::integer, split_part(v_number, '-', 3)::integer)
    on conflict (user_id, prefix, year) do update
      set last_number = greatest(document_sequences.last_number, excluded.last_number);
  end if;

  return v_id;
end;
$$;

revoke all on function fn_migrate_insert_quote(uuid, jsonb) from public, authenticated;
