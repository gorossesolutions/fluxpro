-- Fixes a latent bug in trg_invoice_lines_immutability (0003_functions.sql): it guarded
-- INSERT as well as UPDATE/DELETE, which meant a locked invoice's lines could never be
-- inserted in the first place — including the V1 migration path, which must create
-- historical invoices already locked=true with their lines in the same logical operation.
-- A quote's initial lines are written together with the quote row itself; that's
-- construction, not a modification of an existing document, so INSERT should never have
-- been blocked. Caught while building scripts/migrate-v1.ts (spec §13).

drop trigger trg_invoice_lines_immutability on invoice_lines;

create trigger trg_invoice_lines_immutability
  before update or delete on invoice_lines
  for each row execute function fn_guard_invoice_lines_immutability();
