-- fn_recompute_all_overdue_statuses (0003_functions.sql) was revoked from PUBLIC — correctly,
-- it's a maintenance sweep with no per-user scoping, not something any authenticated user
-- should be able to trigger directly — but never re-granted to anyone at all. It's meant to be
-- called by the keepalive Edge Function's service-role client (supabase/functions/keepalive),
-- so service_role is the only role that actually needs it. Caught by trying to call it as
-- service_role against a real grant model — `permission denied for function
-- fn_recompute_all_overdue_statuses` — while building that function.

grant execute on function fn_recompute_all_overdue_statuses() to service_role;
