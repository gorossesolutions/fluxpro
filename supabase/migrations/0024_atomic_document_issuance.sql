-- ---------------------------------------------------------------------------
-- Atomic issuance: number allocation + writing that number on the document in ONE transaction.
--
-- Until now the app called fn_allocate_document_number (its own committed transaction) and then
-- updated/inserted the document in a second REST call. Any failure in between — network drop,
-- constraint violation (the cross-account invoices_number_key clash fixed in 0023), RLS
-- refusal — left the counter advanced with no document carrying that number: a burned number,
-- i.e. a hole in the FAC/AV sequence that numbering continuity forbids.
--
-- Each function below does both steps inside one function call = one transaction: if writing
-- the document fails, the counter increment rolls back with it. Draft → issued also re-checks
-- the status under a row lock, so a double-tap can't allocate two numbers for one invoice.
--
-- SECURITY INVOKER: the document writes run as the calling user under the existing RLS policies
-- (so these keep working unchanged when RLS moves to org membership). Only the counter bump goes
-- through fn_allocate_document_number, which is already SECURITY DEFINER and scoped by auth.uid().
--
-- p_year comes from the client (its local calendar year), exactly as before — avoids issuing a
-- 2026 number at 01:00 on 1 January 2027 in Mauritius because the server clock is still UTC.
-- ---------------------------------------------------------------------------

create or replace function fn_issue_invoice(
  p_invoice_id uuid,
  p_year integer,
  p_fx_rate_to_mur numeric,
  p_fx_rate_date date,
  p_fx_source text
) returns invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status invoice_status;
  v_row invoices;
begin
  select status into v_status from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Facture introuvable.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Cette facture est déjà émise.';
  end if;

  update invoices
  set number = fn_allocate_document_number('FAC', p_year),
      status = 'issued',
      locked = true,
      issued_at = now(),
      fx_rate_to_mur = p_fx_rate_to_mur,
      fx_rate_date = p_fx_rate_date,
      fx_source = p_fx_source
  where id = p_invoice_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function fn_issue_quote(p_quote_id uuid, p_year integer) returns quotes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status quote_status;
  v_row quotes;
begin
  select status into v_status from quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Ce devis est déjà envoyé.';
  end if;

  update quotes
  set number = fn_allocate_document_number('DEV', p_year),
      status = 'sent',
      locked = true,
      issued_at = now()
  where id = p_quote_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Credit note + its lines in one go (the lines used to be a third, separate call — a failure
-- there left a numbered credit note with no lines).
-- p_lines: [{ "title", "description", "quantity", "unit_price", "line_total" }, ...]
create or replace function fn_create_credit_note(
  p_parent_invoice_id uuid,
  p_year integer,
  p_reason text,
  p_currency text,
  p_fx_rate_to_mur numeric,
  p_subtotal numeric,
  p_tax_rate numeric,
  p_tax_amount numeric,
  p_total numeric,
  p_lines jsonb
) returns credit_notes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_row credit_notes;
begin
  -- RLS on invoices: another user's invoice is simply "not found" here.
  select client_snapshot into v_snapshot from invoices where id = p_parent_invoice_id;
  if not found then
    raise exception 'Facture d''origine introuvable.';
  end if;

  insert into credit_notes (
    user_id, number, parent_invoice_id, reason, client_snapshot, currency, fx_rate_to_mur,
    subtotal, tax_rate, tax_amount, total, locked, issued_at
  ) values (
    auth.uid(), fn_allocate_document_number('AV', p_year), p_parent_invoice_id, p_reason, v_snapshot,
    p_currency, p_fx_rate_to_mur, p_subtotal, p_tax_rate, p_tax_amount, p_total, true, now()
  )
  returning * into v_row;

  insert into credit_note_lines (credit_note_id, position, title, description, quantity, unit_price, line_total)
  select v_row.id,
         l.ord::integer,
         l.value->>'title',
         nullif(l.value->>'description', ''),
         coalesce((l.value->>'quantity')::numeric, 1),
         coalesce((l.value->>'unit_price')::numeric, 0),
         coalesce((l.value->>'line_total')::numeric, 0)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as l(value, ord);

  return v_row;
end;
$$;

revoke all on function fn_issue_invoice(uuid, integer, numeric, date, text) from public;
revoke all on function fn_issue_quote(uuid, integer) from public;
revoke all on function fn_create_credit_note(uuid, integer, text, text, numeric, numeric, numeric, numeric, numeric, jsonb) from public;
grant execute on function fn_issue_invoice(uuid, integer, numeric, date, text) to authenticated;
grant execute on function fn_issue_quote(uuid, integer) to authenticated;
grant execute on function fn_create_credit_note(uuid, integer, text, text, numeric, numeric, numeric, numeric, numeric, jsonb) to authenticated;
