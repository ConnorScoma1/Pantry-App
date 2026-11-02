-- =============================================================================
-- Seasonal cooking preferences (spec 06).
--
-- Review before applying. Adds columns and functions only; nothing is deleted.
-- Schema reviewed first (docs/ARCHITECTURE.md §9):
--   * The season itself is NOT stored: the app works it out from the
--     household's country + postal code and today's date, so it changes on
--     its own through the year.
--   * user_preferences.seasonal — personal settings (on by default):
--     produce/meals/desserts/holiday recipes on, grocery deals off, and the
--     holidays this person celebrates (none assumed).
--   * households.seasonal_region — household override for the climate band
--     and hemisphere when the postal code guess is wrong (null = automatic).
--   * The onboarding profile gains a `seasonal` section (saved and loaded with
--     the rest of the profile; the dessert wrapper from the previous migration
--     is replaced by one that saves both).
-- =============================================================================

alter table public.user_preferences
  add column seasonal jsonb not null default '{}'::jsonb check (jsonb_typeof(seasonal) = 'object');

alter table public.households
  add column seasonal_region text
    check (seasonal_region in ('north-cold', 'north-temperate', 'north-warm', 'south-temperate', 'south-warm'));

-- Personal settings merged over the defaults, plus the household override.
create or replace function public.seasonal_preferences_json()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
      'enabled', true, 'produce', true, 'meals', true, 'desserts', true, 'holidays', true, 'deals', false,
      'holidayOptIns', '[]'::jsonb
    )
    || coalesce(up.seasonal, '{}'::jsonb)
    || jsonb_build_object('region', h.seasonal_region)
  from public.profiles p
  join public.households h on h.id = p.active_household_id
  left join public.user_preferences up on up.user_id = p.id
  where p.id = (select auth.uid()) and public.is_household_member(h.id);
$$;
revoke all on function public.seasonal_preferences_json() from public;
revoke all on function public.seasonal_preferences_json() from anon;
grant execute on function public.seasonal_preferences_json() to authenticated;

create or replace function public.save_seasonal_preferences(prefs jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  personal jsonb;
  k text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'No household for the current user' using errcode = '42501';
  end if;
  if jsonb_typeof(prefs) <> 'object' then
    raise exception 'Invalid seasonal preferences' using errcode = '22023';
  end if;
  foreach k in array array['enabled', 'produce', 'meals', 'desserts', 'holidays', 'deals'] loop
    if jsonb_typeof(prefs -> k) <> 'boolean' then
      raise exception 'Invalid seasonal preferences: %', k using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(prefs -> 'holidayOptIns') <> 'array' or jsonb_array_length(prefs -> 'holidayOptIns') > 30 then
    raise exception 'Invalid seasonal preferences: holidayOptIns' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(prefs -> 'holidayOptIns') e
    where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9-]{1,40}$'
  ) then
    raise exception 'Invalid seasonal preferences: holidayOptIns' using errcode = '22023';
  end if;

  personal := jsonb_build_object(
    'enabled', prefs -> 'enabled', 'produce', prefs -> 'produce', 'meals', prefs -> 'meals',
    'desserts', prefs -> 'desserts', 'holidays', prefs -> 'holidays', 'deals', prefs -> 'deals',
    'holidayOptIns', prefs -> 'holidayOptIns'
  );
  update public.user_preferences set seasonal = personal where user_id = uid;
  if not found then
    insert into public.user_preferences (user_id, seasonal) values (uid, personal);
  end if;

  update public.households set seasonal_region = nullif(prefs ->> 'region', '') where id = hh;
end;
$$;
revoke all on function public.save_seasonal_preferences(jsonb) from public;
revoke all on function public.save_seasonal_preferences(jsonb) from anon;
grant execute on function public.save_seasonal_preferences(jsonb) to authenticated;

-- Onboarding save: base profile, then desserts and seasonal answers when present.
create or replace function public.save_onboarding_profile(profile jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid;
begin
  hid := public.save_onboarding_profile_base(profile);
  if jsonb_typeof(profile -> 'desserts') = 'object' then
    perform public.save_dessert_preferences(profile -> 'desserts');
  end if;
  if jsonb_typeof(profile -> 'seasonal') = 'object' then
    perform public.save_seasonal_preferences(profile -> 'seasonal');
  end if;
  return hid;
end;
$$;

create or replace function public.get_onboarding_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when b is null then null
    else b || jsonb_build_object('desserts', public.dessert_preferences_json(), 'seasonal', public.seasonal_preferences_json()) end
  from (select public.build_onboarding_profile(true) as b) x;
$$;

create or replace function public.get_household_onboarding_draft()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when b is null then null
    else b || jsonb_build_object('desserts', public.dessert_preferences_json(), 'seasonal', public.seasonal_preferences_json()) end
  from (select public.build_onboarding_profile(false) as b) x;
$$;
