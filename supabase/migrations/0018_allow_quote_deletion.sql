-- ---------------------------------------------------------------------------
-- Quotes are not a fiscal document the way invoices are — no MRA numbering-continuity
-- requirement applies to them (v_number_gaps, 0003_functions.sql, deliberately tracks only
-- FAC/AV, never DEV). The business wants to be able to delete a sent/accepted/refused/expired
-- quote outright, not just a draft — unlike an invoice, which stays undeletable once issued
-- (credit note instead) for exactly that compliance reason.
--
-- fn_guard_quote_immutability() (0005_quote_locking.sql) currently blocks DELETE on a locked
-- quote the same way it blocks financial-field UPDATEs. This drops only the DELETE guard,
-- leaving the UPDATE guard (financial fields frozen once locked) untouched. quote_lines cascade
-- via its own `on delete cascade` FK (0001_schema.sql) — no change needed there.
-- ---------------------------------------------------------------------------

create or replace function fn_guard_quote_immutability() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

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
      raise exception 'Quote % is locked and its financial fields cannot be changed.', old.number;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
