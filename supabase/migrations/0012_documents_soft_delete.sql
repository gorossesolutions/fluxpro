-- docs/COMPLIANCE.md §3.8 documents this table as soft-delete (deleted_at), matching expenses
-- — but 0001_schema.sql never actually added the column. Closing that drift: an inbox upload
-- the user removes should be recoverable the same way an archived expense/client is, not
-- gone outright.

alter table documents add column deleted_at timestamptz;
create index idx_documents_deleted_at on documents (deleted_at);
