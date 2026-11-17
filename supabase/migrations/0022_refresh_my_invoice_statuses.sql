-- ---------------------------------------------------------------------------
-- Fixes "the dashboard shows an amount en retard, but the 'En retard' filter is empty".
--
-- The dashboard derives overdue from due_date live; the invoice list, badges and
-- v_client_financials.has_overdue read the stored `status`. The issued → overdue flip only
-- happens in fn_recompute_invoice_status (on a payment event) or in the nightly sweep
-- fn_recompute_all_overdue_statuses (0003), which depends on the keepalive Edge Function being
-- deployed AND scheduled — it isn't, so stored statuses never flipped.
--
-- This adds a per-user refresh the app calls itself when it opens, so stored statuses no
-- longer depend on an external scheduler. SECURITY INVOKER: it runs as the calling user, so
-- the existing RLS policies (invoices_update_own) scope it — no cross-tenant risk, and it keeps
-- working unchanged if/when RLS moves to org membership. The explicit user_id filter is a
-- second guard, not the only one.
--
-- Both directions, matching fn_recompute_invoice_status's date rule:
--   issued  → overdue  once due_date has passed;
--   overdue → issued   if due_date was later pushed back (due_date stays editable).
-- Invoices with status_override (manual status) are left alone. `status` is whitelisted in
-- fn_guard_invoice_immutability, so locked invoices are fine.
-- ---------------------------------------------------------------------------

create or replace function fn_refresh_my_invoice_statuses() returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_overdue integer;
  v_back integer;
begin
  update invoices
  set status = 'overdue'
  where user_id = auth.uid()
    and status = 'issued'
    and not status_override
    and due_date is not null
    and due_date < current_date;
  get diagnostics v_overdue = row_count;

  update invoices
  set status = 'issued'
  where user_id = auth.uid()
    and status = 'overdue'
    and not status_override
    and due_date is not null
    and due_date >= current_date;
  get diagnostics v_back = row_count;

  return v_overdue + v_back;
end;
$$;

revoke all on function fn_refresh_my_invoice_statuses() from public;
grant execute on function fn_refresh_my_invoice_statuses() to authenticated;
