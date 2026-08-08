-- ---------------------------------------------------------------------------
-- Re-asserts fx_rates' insert/update policies from 0016. A live project reported the exact
-- "new row violates row-level security policy for table fx_rates" error the client FX widget's
-- upsert would produce without them — meaning 0016 either wasn't fully applied there, or the
-- policies never took (e.g. partial run in the SQL editor). This migration is idempotent
-- (drop-if-exists + recreate) so it's safe to run even if 0016 already applied cleanly.
-- ---------------------------------------------------------------------------

drop policy if exists fx_rates_insert_authenticated on fx_rates;
drop policy if exists fx_rates_update_authenticated on fx_rates;

create policy fx_rates_insert_authenticated on fx_rates for insert with check (auth.role() = 'authenticated');
create policy fx_rates_update_authenticated on fx_rates for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
