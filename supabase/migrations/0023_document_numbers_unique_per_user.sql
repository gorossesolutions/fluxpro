-- ---------------------------------------------------------------------------
-- Fixes "duplicate key value violates unique constraint invoices_number_key" for a SECOND
-- account on the same project.
--
-- document_sequences is per user (0001/0003), so every account's first invoice is
-- FAC-YYYY-001 — but invoices.number, quotes.number and credit_notes.number were declared
-- `unique` across the whole table (0001_schema.sql). Account #2's first issuance collided
-- with account #1's FAC-YYYY-001 and was refused.
--
-- Numbering continuity is a per-business obligation, so uniqueness belongs on
-- (user_id, number). Postgres treats NULLs as distinct, so drafts (number = null) stay fine.
-- When multi-org lands (CLAUDE.md), this becomes (org_id, number) in the same way.
--
-- Part 2 — repair burned numbers. Issuance allocates the number (fn_allocate_document_number,
-- its own transaction) BEFORE writing it on the invoice; every refused attempt above still
-- advanced the counter, leaving a gap (the next success would have been FAC-YYYY-00N, and
-- v_number_gaps would report the missing ones). Issued invoices and credit notes can never be
-- deleted (immutability triggers, 0003), so the highest number actually stored IS the true last
-- number: FAC and AV counters are reset to exactly that. DEV counters are left alone — quotes
-- can be deleted (0018), so a lower stored max doesn't prove a number was never sent out.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------

alter table invoices drop constraint if exists invoices_number_key;
alter table quotes drop constraint if exists quotes_number_key;
alter table credit_notes drop constraint if exists credit_notes_number_key;

create unique index if not exists invoices_user_number_key on invoices (user_id, number);
create unique index if not exists quotes_user_number_key on quotes (user_id, number);
create unique index if not exists credit_notes_user_number_key on credit_notes (user_id, number);

update document_sequences s
set last_number = coalesce((
  select max(split_part(i.number, '-', 3)::integer)
  from invoices i
  where i.user_id = s.user_id and i.number like 'FAC-' || s.year::text || '-%'
), 0)
where s.prefix = 'FAC';

update document_sequences s
set last_number = coalesce((
  select max(split_part(c.number, '-', 3)::integer)
  from credit_notes c
  where c.user_id = s.user_id and c.number like 'AV-' || s.year::text || '-%'
), 0)
where s.prefix = 'AV';
