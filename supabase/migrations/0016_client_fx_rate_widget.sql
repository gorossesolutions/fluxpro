-- ---------------------------------------------------------------------------
-- Client-side FX rate widget (Paramètres → Application), matching V1's own
-- "Taux de change" section: the user pastes their own free-tier ExchangeRate-API key and the
-- app fetches/saves EUR/USD/GBP → MUR rates directly from the browser, no Edge Function
-- involved. This is a deliberately simpler alternative to fx-snapshot (0011's sibling), not a
-- replacement for it — both write into the same fx_rates table that resolveFxRate() reads from.
-- ---------------------------------------------------------------------------

alter table app_settings add column exchangerate_api_key text;

-- fx_rates previously had select-only RLS (0002_rls.sql) — every write came from the
-- service-role fx-snapshot Edge Function, which bypasses RLS entirely. Writing from the
-- browser as the authenticated user needs its own policy. Unrestricted-by-user-id is
-- intentional and consistent with this table's existing design (docs/SCHEMA.md: fx_rates is
-- "global reference data, not owned by a specific user") — the same reasoning tax_bands and
-- country_rules already rely on for their own select-only policies.
create policy fx_rates_insert_authenticated on fx_rates for insert with check (auth.role() = 'authenticated');
create policy fx_rates_update_authenticated on fx_rates for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
