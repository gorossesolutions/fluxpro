-- ---------------------------------------------------------------------------
-- Going-forward expense recurrence engine (spec §9).
--
-- fn_migrate_insert_expense (0007) only ever backfills occurrences up to the
-- migration date, matching V1's one-time in-memory expansion. That was fine
-- for a historical import, but V1's actual bug was exactly that: recurrence
-- was expanded in memory on read, never persisted, so a recurring expense's
-- future months simply didn't exist anywhere until someone happened to view
-- it. V2 deliberately stores materialised rows in expense_occurrences
-- instead (see docs/SCHEMA.md), so this function is what keeps that table
-- topped up going forward for a still-open recurrence: called by the
-- Dépenses page on load (and after creating/editing a recurring expense),
-- it advances each recurring expense from its last known occurrence up to
-- today (or its recurrence_end_date, if that comes sooner). Idempotent via
-- the (expense_id, occurrence_date) unique constraint + ON CONFLICT DO
-- NOTHING, so calling it repeatedly is always safe.
-- ---------------------------------------------------------------------------

create function fn_advance_recurrence_date(p_date date, p_recurrence recurrence_type) returns date
language sql
immutable
as $$
  select case p_recurrence
    when 'weekly' then p_date + interval '7 days'
    when 'monthly' then p_date + interval '1 month'
    when 'quarterly' then p_date + interval '3 months'
    when 'yearly' then p_date + interval '1 year'
    else p_date
  end::date
$$;

create function fn_materialize_expense_occurrences() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense record;
  v_cursor date;
  v_stop date;
  v_inserted integer := 0;
begin
  for v_expense in
    select * from expenses
    where user_id = auth.uid()
      and deleted_at is null
      and recurrence <> 'none'
  loop
    select max(occurrence_date) into v_cursor from expense_occurrences where expense_id = v_expense.id;
    v_cursor := coalesce(fn_advance_recurrence_date(v_cursor, v_expense.recurrence), v_expense.expense_date);

    v_stop := least(current_date, coalesce(v_expense.recurrence_end_date, current_date));

    while v_cursor <= v_stop loop
      insert into expense_occurrences (expense_id, occurrence_date, amount, amount_mur, is_generated)
      values (v_expense.id, v_cursor, v_expense.amount, v_expense.amount * v_expense.fx_rate_to_mur, true)
      on conflict (expense_id, occurrence_date) do nothing;
      if found then
        v_inserted := v_inserted + 1;
      end if;
      v_cursor := fn_advance_recurrence_date(v_cursor, v_expense.recurrence);
    end loop;
  end loop;

  return v_inserted;
end;
$$;

grant execute on function fn_materialize_expense_occurrences() to authenticated;
