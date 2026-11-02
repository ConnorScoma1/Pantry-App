-- =============================================================================
-- Store prices (milestone 6) — the household's store for live prices.
--
-- Review before applying. Adds columns only; nothing is deleted.
--   * households.pricing_* : which store the grocery list is priced at.
--     Prices themselves are NOT stored here: the server fetches them live
--     from the retailer's API (Kroger) and labels each one with its age.
--     Members can't write prices, only choose a store. The app looks the
--     store up with the retailer before saving it; a made-up id would only
--     mean "no prices", because prices always come from the retailer.
--   * Plan lines on the grocery list now keep their amount
--     (grocery_list_items.required_quantity / required_unit, existing
--     columns) for package math — see replace_plan_grocery_items().
-- =============================================================================

alter table public.households
  add column pricing_provider text check (pricing_provider in ('kroger')),
  add column pricing_store_id text check (pricing_store_id ~ '^[0-9A-Za-z]{4,20}$'),
  add column pricing_store_name text check (char_length(pricing_store_name) <= 160),
  add column pricing_store_address text check (char_length(pricing_store_address) <= 240),
  add column pricing_store_set_at timestamptz,
  add constraint households_pricing_store_pair check ((pricing_provider is null) = (pricing_store_id is null));

-- Members already may update their household (households_update_member).
-- Store choice uses that; nothing else changes about permissions.
