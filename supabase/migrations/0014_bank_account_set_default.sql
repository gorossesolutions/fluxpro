-- ---------------------------------------------------------------------------
-- fn_set_default_bank_account — atomic "exactly one default" swap (Paramètres page).
--
-- bank_accounts.is_default has no DB-level uniqueness constraint (a partial unique index
-- would fight the swap itself: two sequential client-side UPDATEs — old default off, new
-- default on — would trip it between the two calls). A single SECURITY DEFINER function
-- doing both in one statement is the same atomicity pattern as fn_merge_clients.
-- ---------------------------------------------------------------------------

create function fn_set_default_bank_account(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from bank_accounts where id = p_id and user_id = auth.uid()) then
    raise exception 'Bank account not found or not owned by current user';
  end if;

  update bank_accounts set is_default = (id = p_id)
  where user_id = auth.uid() and (is_default or id = p_id);
end;
$$;

grant execute on function fn_set_default_bank_account(uuid) to authenticated;
