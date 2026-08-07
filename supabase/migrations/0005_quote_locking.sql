-- Adds the `locked` concept to quotes, mirroring invoices, so that migrated (historical)
-- quotes can be marked immutable at import time (spec §13: "All migrated invoices/quotes
-- are marked issued and locked = true — historical documents are immutable by definition").
-- Live-created quotes default to locked = false and stay editable through their lifecycle;
-- nothing in the app currently locks a quote outside of the V1 migration path.

alter table quotes add column locked boolean not null default false;

create function fn_guard_quote_immutability() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.locked then
      raise exception 'Cannot delete a locked quote (%).', old.number;
    end if;
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

create trigger trg_quotes_immutability
  before update or delete on quotes
  for each row execute function fn_guard_quote_immutability();

create function fn_guard_quote_lines_immutability() returns trigger as $$
declare
  v_locked boolean;
begin
  select locked into v_locked from quotes where id = coalesce(new.quote_id, old.quote_id);
  if v_locked then
    raise exception 'Cannot modify line items of a locked quote.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

-- UPDATE/DELETE only, deliberately not INSERT: a quote's initial lines are written together
-- with the quote row itself (including pre-locked historical rows from the V1 migration) —
-- that's construction, not a modification of an existing document.
create trigger trg_quote_lines_immutability
  before update or delete on quote_lines
  for each row execute function fn_guard_quote_lines_immutability();
