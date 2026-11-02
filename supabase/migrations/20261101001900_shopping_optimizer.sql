-- =============================================================================
-- One Store vs. Best Deals (milestone 9, spec 03).
--
-- Review before applying. Adds tables and functions only; nothing existing
-- is deleted or rewritten.
--
--   * shopping_preferences — ONE ROW PER PERSON PER HOUSEHOLD. How far they'll
--     drive, how many stops, what they pay for fuel, what their time is worth,
--     their loyalty cards and the stores they compare. Personal: only that
--     person can read or change it (other members can't see someone's
--     starting address or value of time).
--   * shopping_trips / shopping_trip_stops / shopping_trip_items — the trip a
--     member chose, so the SHARED list can be shown store by store. Prices are
--     NOT stored (as before, they're fetched live and labelled with their
--     age); a trip only records which list item is bought at which store.
--     Written only through save_shopping_trip(), which checks every item is on
--     the household's own list. Only real (Kroger) store ids can be saved (the web server
--     re-reads each store's name and address from Kroger before saving) —
--     practice-mode sample stores never reach the database.
--   * ai_usage gains the 'shopping_advice' feature for the AI shopping
--     advisor, which only explains numbers the server already calculated.
--
-- Nothing here stores map data: the starting point is kept as the address
-- text the person typed, and is geocoded per comparison (Mapbox "temporary"
-- geocoding, whose results may not be stored).
-- =============================================================================

-- Every element of a text array matches a pattern (used in check constraints).
create or replace function public.all_match(arr text[], pattern text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(x ~ pattern), true) from unnest(arr) as x;
$$;

create table public.shopping_preferences (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  max_stops smallint not null default 2 check (max_stops between 1 and 4),
  radius_miles numeric(4,1) not null default 10 check (radius_miles between 1 and 50),
  max_extra_minutes smallint check (max_extra_minutes between 0 and 240),
  max_drive_miles numeric(5,1) check (max_drive_miles between 1 and 200),
  value_of_time_cents integer not null default 1500 check (value_of_time_cents between 0 and 50000),
  fuel_cents_per_gallon integer check (fuel_cents_per_gallon between 50 and 2000),
  miles_per_gallon numeric(5,1) default 25 check (miles_per_gallon between 5 and 150),
  minutes_per_stop smallint not null default 15 check (minutes_per_stop between 0 and 90),
  return_home boolean not null default true,
  start_address text check (char_length(start_address) between 3 and 200),
  preferred_stores text[] not null default '{}'
    check (cardinality(preferred_stores) <= 10 and public.all_match(preferred_stores, '^kroger:[0-9A-Za-z]{4,20}$')),
  excluded_stores text[] not null default '{}'
    check (cardinality(excluded_stores) <= 20 and public.all_match(excluded_stores, '^kroger:[0-9A-Za-z]{4,20}$')),
  loyalty_retailers text[] not null default '{}'
    check (cardinality(loyalty_retailers) <= 10 and public.all_match(loyalty_retailers, '^[a-z0-9 ''&.-]{2,40}$')),
  digital_coupons boolean not null default false,
  compare_store_ids text[] not null default '{}'
    check (cardinality(compare_store_ids) <= 6 and public.all_match(compare_store_ids, '^[0-9A-Za-z]{4,20}$')),
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id)
);
alter table public.shopping_preferences enable row level security;
create policy shopping_preferences_own on public.shopping_preferences
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_household_member(household_id))
  with check (user_id = (select auth.uid()) and public.is_household_member(household_id));
revoke all on public.shopping_preferences from anon;
grant select, insert, update, delete on public.shopping_preferences to authenticated;

create trigger shopping_preferences_touch before update on public.shopping_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Chosen trips (shared with the household)
-- ---------------------------------------------------------------------------
create table public.shopping_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  grocery_list_id uuid not null references public.grocery_lists (id) on delete cascade,
  strategy text not null check (strategy in ('one_store', 'best_deals', 'best_value')),
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shopping_trips_one_active_idx on public.shopping_trips (grocery_list_id) where status = 'active';
create index shopping_trips_household_idx on public.shopping_trips (household_id, created_at desc);

create table public.shopping_trip_stops (
  trip_id uuid not null references public.shopping_trips (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  store_key text not null check (store_key ~ '^kroger:[0-9A-Za-z]{4,20}$'),
  store_name text not null check (char_length(store_name) between 1 and 160),
  store_address text check (char_length(store_address) <= 240),
  primary key (trip_id, position),
  unique (trip_id, store_key)
);

create table public.shopping_trip_items (
  trip_id uuid not null references public.shopping_trips (id) on delete cascade,
  item_id uuid not null references public.grocery_list_items (id) on delete cascade,
  stop_position smallint not null,
  primary key (trip_id, item_id),
  foreign key (trip_id, stop_position) references public.shopping_trip_stops (trip_id, position) on delete cascade
);

alter table public.shopping_trips enable row level security;
alter table public.shopping_trip_stops enable row level security;
alter table public.shopping_trip_items enable row level security;
create policy shopping_trips_read on public.shopping_trips for select to authenticated
  using (public.is_household_member(household_id));
create policy shopping_trip_stops_read on public.shopping_trip_stops for select to authenticated
  using (exists (select 1 from public.shopping_trips t where t.id = trip_id and public.is_household_member(t.household_id)));
create policy shopping_trip_items_read on public.shopping_trip_items for select to authenticated
  using (exists (select 1 from public.shopping_trips t where t.id = trip_id and public.is_household_member(t.household_id)));
-- Reads only; writes go through the functions below.
revoke all on public.shopping_trips, public.shopping_trip_stops, public.shopping_trip_items from anon, authenticated;
grant select on public.shopping_trips, public.shopping_trip_stops, public.shopping_trip_items to authenticated;

create trigger shopping_trips_touch before update on public.shopping_trips
  for each row execute function public.set_updated_at();

-- Save the trip a member chose for the household's current list. Replaces
-- (cancels, doesn't delete) the list's previous active trip.
--   payload: { strategy, stops: [{ storeKey, name, address, itemIds: [uuid] }] }
create or replace function public.save_shopping_trip(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  list_id uuid;
  trip uuid;
  stop jsonb;
  pos integer := 0;
  ids uuid[];
  all_ids uuid[] := '{}';
  today_count integer;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_typeof(payload), '') <> 'object' or coalesce(jsonb_typeof(payload->'stops'), '') <> 'array' then
    raise exception 'That trip isn''t valid.' using errcode = 'check_violation';
  end if;
  if coalesce(payload->>'strategy', '') not in ('one_store', 'best_deals', 'best_value') then
    raise exception 'That trip isn''t valid.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(payload->'stops') not between 1 and 4 then
    raise exception 'A trip has one to four stores.' using errcode = 'check_violation';
  end if;
  if (select count(distinct s->>'storeKey') from jsonb_array_elements(payload->'stops') as s) <> jsonb_array_length(payload->'stops') then
    raise exception 'Each store can appear once in a trip.' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shopping_trip:' || hh::text, 0));
  -- Counted per person, so one member can't use up everyone's allowance.
  select count(*)::integer into today_count from public.shopping_trips
    where household_id = hh and created_by = uid and created_at > now() - interval '24 hours';
  if today_count >= 30 then
    raise exception 'Too many trips today. Try again tomorrow.' using errcode = 'check_violation';
  end if;

  select id into list_id from public.grocery_lists
    where household_id = hh and status in ('open', 'shopping')
    order by created_at desc limit 1;
  if list_id is null then
    raise exception 'There''s no shopping list to organise.' using errcode = 'check_violation';
  end if;

  update public.shopping_trips set status = 'cancelled'
    where grocery_list_id = list_id and status = 'active';
  insert into public.shopping_trips (household_id, grocery_list_id, strategy, created_by)
    values (hh, list_id, payload->>'strategy', uid)
    returning id into trip;

  for stop in select value from jsonb_array_elements(payload->'stops') loop
    pos := pos + 1;
    if coalesce(jsonb_typeof(stop), '') <> 'object' or coalesce(jsonb_typeof(stop->'itemIds'), '') <> 'array'
       or jsonb_array_length(stop->'itemIds') not between 1 and 80 then
      raise exception 'That trip isn''t valid.' using errcode = 'check_violation';
    end if;
    insert into public.shopping_trip_stops (trip_id, position, store_key, store_name, store_address)
      values (trip, pos, stop->>'storeKey', left(stop->>'name', 160), left(nullif(stop->>'address', ''), 240));
    begin
      select coalesce(array_agg(x::uuid), '{}') into ids from jsonb_array_elements_text(stop->'itemIds') as x;
    exception when invalid_text_representation then
      raise exception 'That trip isn''t valid.' using errcode = 'check_violation';
    end;
    if ids && all_ids then
      raise exception 'An item can only be bought at one store.' using errcode = 'check_violation';
    end if;
    all_ids := all_ids || ids;
    -- Every item must be on this household's current list.
    if (select count(*) from public.grocery_list_items i where i.id = any (ids) and i.grocery_list_id = list_id) <> cardinality(ids)
       or cardinality(ids) <> (select count(distinct v) from unnest(ids) as v) then
      raise exception 'Some items aren''t on your list.' using errcode = 'check_violation';
    end if;
    insert into public.shopping_trip_items (trip_id, item_id, stop_position)
      select trip, v, pos from unnest(ids) as v;
  end loop;
  return trip;
end;
$$;
revoke all on function public.save_shopping_trip(jsonb) from public, anon;
grant execute on function public.save_shopping_trip(jsonb) to authenticated;

-- Finish or cancel the household's trip.
create or replace function public.end_shopping_trip(target uuid, new_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if new_status not in ('done', 'cancelled') then
    raise exception 'Unknown status' using errcode = 'check_violation';
  end if;
  update public.shopping_trips set status = new_status
    where id = target and status = 'active' and public.is_household_member(household_id);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.end_shopping_trip(uuid, text) from public, anon;
grant execute on function public.end_shopping_trip(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AI shopping advisor: its own feature and daily limit.
-- ---------------------------------------------------------------------------
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check check (feature in ('meal_plan', 'cooking_help', 'recipe_draft', 'shopping_advice'));

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
  if feature_name not in ('meal_plan', 'cooking_help', 'recipe_draft', 'shopping_advice') then
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
