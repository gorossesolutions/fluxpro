-- ---------------------------------------------------------------------------
-- Adds a "cancelled" status to quotes, mirroring invoices: a quote withdrawn by the business
-- (sent by mistake, replaced by a new version, project dropped) is kept for the record but
-- moved out of the working list into its own "Annulés" view — distinct from "refused" (the
-- client said no) and "expired" (validity date passed).
--
-- No guard change needed: fn_guard_quote_immutability (0005/0018) freezes financial fields on
-- a locked quote but never `status`, so a sent (locked) quote can already move to 'cancelled'.
--
-- Run this statement on its own (the SQL Editor wraps a paste in one transaction, and a newly
-- added enum value can't be used inside the transaction that adds it — nothing here uses it).
-- ---------------------------------------------------------------------------

alter type quote_status add value if not exists 'cancelled';
