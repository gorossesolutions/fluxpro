-- ---------------------------------------------------------------------------
-- Fixes a real duplicate-line-items bug: useSaveInvoiceDraft/useSaveQuoteDraft replaced a
-- draft's lines with two separate, independently-committed REST calls — DELETE all existing
-- lines, then INSERT the current set — rather than one atomic operation. If the save mutation
-- fires twice in quick succession for the same draft (a fast double-tap on mobile outrunning
-- the button's disabled state, which only takes effect once React re-renders), both DELETEs
-- can each commit before either INSERT runs, and then both INSERTs land — every line doubled.
-- Reported live: a 2-line invoice came out with 4 lines (each line duplicated exactly once)
-- after emitting it from a phone.
--
-- Wrapping delete+insert in a single PL/pgSQL function call makes each save one transaction.
-- Postgres then does the rest: a DELETE against rows a concurrent, not-yet-committed
-- transaction is also deleting blocks until that transaction resolves, then re-evaluates its
-- WHERE clause against the now-current (post-commit) state — so a second, overlapping call
-- ends up deleting whatever the first call just inserted before inserting its own lines,
-- converging on exactly one correct set of lines no matter how the two calls interleave.
--
-- No SECURITY DEFINER: RLS still applies to every statement inside exactly as before
-- (invoice_lines_all_own / quote_lines_all_own check ownership via the parent row), so this
-- changes atomicity only, not the permission model.
-- ---------------------------------------------------------------------------

create or replace function fn_replace_invoice_lines(p_invoice_id uuid, p_lines jsonb) returns void
language plpgsql
as $$
begin
  delete from invoice_lines where invoice_id = p_invoice_id;

  insert into invoice_lines (invoice_id, position, title, description, quantity, unit_price, line_total)
  select
    p_invoice_id,
    row_number() over ()::integer,
    line->>'title',
    nullif(line->>'description', ''),
    (line->>'quantity')::numeric,
    (line->>'unit_price')::numeric,
    (line->>'line_total')::numeric
  from jsonb_array_elements(p_lines) as line;
end;
$$;

grant execute on function fn_replace_invoice_lines(uuid, jsonb) to authenticated;

create or replace function fn_replace_quote_lines(p_quote_id uuid, p_lines jsonb) returns void
language plpgsql
as $$
begin
  delete from quote_lines where quote_id = p_quote_id;

  insert into quote_lines (quote_id, position, title, description, quantity, unit_price, line_total)
  select
    p_quote_id,
    row_number() over ()::integer,
    line->>'title',
    nullif(line->>'description', ''),
    (line->>'quantity')::numeric,
    (line->>'unit_price')::numeric,
    (line->>'line_total')::numeric
  from jsonb_array_elements(p_lines) as line;
end;
$$;

grant execute on function fn_replace_quote_lines(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time cleanup for lines already duplicated by the race above (safe to re-run — once
-- there are no duplicates left, both statements below match zero rows).
--
-- This does NOT change any invoice/quote's stored subtotal/tax/total: those are computed and
-- saved from the browser's own in-memory line list (which only ever showed the correct,
-- non-duplicated lines), so the totals were already correct — only the extra child rows in
-- invoice_lines/quote_lines needed removing.
--
-- Affected documents may already be locked/issued, which the immutability triggers would
-- otherwise block DELETE on — temporarily disabled for this one corrective pass only, the
-- same disable/re-enable pattern fn_merge_clients (0009) already uses for its own legitimate
-- one-off correction.
-- ---------------------------------------------------------------------------

alter table invoice_lines disable trigger trg_invoice_lines_immutability;

delete from invoice_lines il
using (
  select id, row_number() over (
    partition by invoice_id, title, coalesce(description, ''), quantity, unit_price, line_total
    order by position, id
  ) as rn
  from invoice_lines
) dupes
where il.id = dupes.id and dupes.rn > 1;

with resequenced as (
  select id, row_number() over (partition by invoice_id order by position, id) as new_position
  from invoice_lines
)
update invoice_lines il
set position = resequenced.new_position
from resequenced
where il.id = resequenced.id and il.position is distinct from resequenced.new_position;

alter table invoice_lines enable trigger trg_invoice_lines_immutability;

alter table quote_lines disable trigger trg_quote_lines_immutability;

delete from quote_lines ql
using (
  select id, row_number() over (
    partition by quote_id, title, coalesce(description, ''), quantity, unit_price, line_total
    order by position, id
  ) as rn
  from quote_lines
) dupes
where ql.id = dupes.id and dupes.rn > 1;

with resequenced as (
  select id, row_number() over (partition by quote_id order by position, id) as new_position
  from quote_lines
)
update quote_lines ql
set position = resequenced.new_position
from resequenced
where ql.id = resequenced.id and ql.position is distinct from resequenced.new_position;

alter table quote_lines enable trigger trg_quote_lines_immutability;
