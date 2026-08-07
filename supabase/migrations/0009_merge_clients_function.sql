-- Merges one client record into another: re-points every invoice/quote from the duplicate
-- onto the surviving client, then archives the duplicate (never a hard delete — matches the
-- rest of the app's "archive, don't destroy" posture for referenced records, spec §6.1).
--
-- Re-pointing client_id on a *locked* invoice/quote requires bypassing the immutability
-- trigger, which normally blocks client_id changes (0003_functions.sql). That block exists to
-- stop an issued document being silently reassigned to a different real-world client after
-- the fact — this operation is different in kind: it's a categorisation fix ("these two
-- records are the same company"), not a change to who was actually billed. The historical
-- record of what was actually on the document (client_snapshot, frozen at issuance) is never
-- touched here, only which client the document rolls up into for reporting. The trigger is
-- disabled for the narrow duration of this one UPDATE, inside this one function, not weakened
-- generally — any other caller still can't reassign client_id on a locked invoice directly.

create function fn_merge_clients(p_keep_id uuid, p_merge_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from clients where id = p_keep_id and user_id = auth.uid()) then
    raise exception 'Client to keep not found or not owned by current user';
  end if;
  if not exists (select 1 from clients where id = p_merge_id and user_id = auth.uid()) then
    raise exception 'Client to merge not found or not owned by current user';
  end if;
  if p_keep_id = p_merge_id then
    raise exception 'Cannot merge a client into itself';
  end if;

  alter table invoices disable trigger trg_invoices_immutability;
  update invoices set client_id = p_keep_id where client_id = p_merge_id;
  alter table invoices enable trigger trg_invoices_immutability;

  alter table quotes disable trigger trg_quotes_immutability;
  update quotes set client_id = p_keep_id where client_id = p_merge_id;
  alter table quotes enable trigger trg_quotes_immutability;

  update clients set archived_at = now() where id = p_merge_id;
end;
$$;

grant execute on function fn_merge_clients(uuid, uuid) to authenticated;
