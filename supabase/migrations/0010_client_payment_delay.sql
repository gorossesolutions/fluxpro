-- Adds the average payment delay to v_client_financials — the actual "bad payer" signal
-- (spec §6.2: "délai de paiement moyen (days between issue and full payment)"), missing from
-- the original view. Computed as the average, across a client's fully-paid invoices, of the
-- gap between issue_date and the date the last payment landed (the date the balance actually
-- hit zero) — not the due date, which only tells you what was promised, not what happened.
--
-- CREATE OR REPLACE VIEW keeps the existing column order/types intact and only appends the
-- new column, so this doesn't disturb anything already reading from v_client_financials.

create or replace view v_client_financials
with (security_invoker = true) as
select
  c.id as client_id,
  c.user_id,
  coalesce(sum(i.total * i.fx_rate_to_mur) filter (where i.status = 'paid'), 0) as ca_total_mur,
  coalesce(sum(i.total * i.fx_rate_to_mur) filter (where i.status in ('issued', 'overdue')), 0) as encours_mur,
  bool_or(i.status = 'overdue') as has_overdue,
  count(i.id) as invoice_count,
  max(i.issue_date) as last_invoice_date,
  (
    -- date - date yields an integer number of days directly in Postgres (not an interval),
    -- so no extract() is needed or correct here.
    select avg(last_payment.paid_at - paid_inv.issue_date)
    from invoices paid_inv
    cross join lateral (
      select max(p.payment_date) as paid_at
      from payments p
      where p.invoice_id = paid_inv.id
    ) last_payment
    where paid_inv.client_id = c.id and paid_inv.status = 'paid' and last_payment.paid_at is not null
  ) as avg_payment_delay_days
from clients c
left join invoices i on i.client_id = c.id
group by c.id, c.user_id;
