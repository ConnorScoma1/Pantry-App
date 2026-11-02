-- =============================================================================
-- Barcode scanning and receipt import (milestone 19, spec 01 §5).
--
-- Review before applying. Adds checks and an AI feature only; nothing is
-- deleted. The columns already existed (pantry_items.source / barcode,
-- added in the first migration "for future barcode / receipt import").
--
--   * pantry_items.barcode, when set, must be an 8–14 digit product code.
--   * ai_usage gains the 'receipt_import' feature: reading a receipt photo
--     with Claude has its own daily limit. Receipt photos are never stored —
--     only the items the household chooses to add.
-- =============================================================================

alter table public.pantry_items
  add constraint pantry_items_barcode_format check (barcode is null or barcode ~ '^[0-9]{8,14}$') not valid;
alter table public.pantry_items validate constraint pantry_items_barcode_format;

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check check (feature in ('meal_plan', 'cooking_help', 'recipe_draft', 'shopping_advice', 'receipt_import'));

create or replace function public.reserve_ai_request(feature_name text, daily_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  used_household integer;
  used_person integer;
  cap integer := least(greatest(coalesce(daily_limit, 0), 0), 1000);
  rid uuid;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if feature_name not in ('meal_plan', 'cooking_help', 'recipe_draft', 'shopping_advice', 'receipt_import') then
    raise exception 'Unknown feature' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || hh::text || ':' || feature_name, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_usage_user:' || uid::text || ':' || feature_name, 0));
  select count(*)::integer into used_household from public.ai_usage
  where household_id = hh and feature = feature_name and outcome in ('ok', 'fallback', 'reserved') and created_at > now() - interval '24 hours';
  select count(*)::integer into used_person from public.ai_usage
  where user_id = uid and feature = feature_name and outcome in ('ok', 'fallback', 'reserved') and created_at > now() - interval '24 hours';
  if used_household >= cap or used_person >= cap then
    return null;
  end if;
  insert into public.ai_usage (household_id, user_id, feature, outcome)
  values (hh, uid, feature_name, 'reserved')
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.reserve_ai_request(text, integer) from public, anon;
grant execute on function public.reserve_ai_request(text, integer) to authenticated;
