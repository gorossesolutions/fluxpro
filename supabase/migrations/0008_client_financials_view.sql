-- Per-client financial aggregates for the Clients list/fiche (spec §6.1, §6.2): CA total
-- (paid invoices, MUR at each invoice's own frozen rate — never today's rate), encours
-- (issued-and-unpaid total, MUR), and whether any of that encours is overdue (drives the
-- amber/red semantic colouring). Computed in SQL rather than reinvented per page in JS —
-- the Dashboard (build step 6) will read from the same aggregation logic.

create view v_client_financials
with (security_invoker = true) as
select
  c.id as client_id,
  c.user_id,
  coalesce(sum(i.total * i.fx_rate_to_mur) filter (where i.status = 'paid'), 0) as ca_total_mur,
  coalesce(sum(i.total * i.fx_rate_to_mur) filter (where i.status in ('issued', 'overdue')), 0) as encours_mur,
  bool_or(i.status = 'overdue') as has_overdue,
  count(i.id) as invoice_count,
  max(i.issue_date) as last_invoice_date
from clients c
left join invoices i on i.client_id = c.id
group by c.id, c.user_id;
