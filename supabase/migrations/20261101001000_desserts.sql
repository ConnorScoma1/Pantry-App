-- =============================================================================
-- Optional dessert planning (spec 05).
--
-- Review before applying. Adds columns and functions only; nothing is deleted.
-- Schema reviewed first (docs/ARCHITECTURE.md §9):
--   * recipes: course ('main' | 'dessert'), dessert_category, chill_minutes
--     (hands-off chilling/setting/freezing, already counted in total_minutes).
--   * planned_meals.meal_type also allows 'dessert'; save_meal_plan() now
--     stores each meal's type. A dessert never takes a dinner's place.
--   * households: dessert_frequency (default once a week) and
--     dessert_categories — shared, because a household eats dessert together.
--   * user_preferences.dessert_skill_level — personal, may differ from the
--     regular cooking skill; null means "same as my cooking skill".
--   * The onboarding profile gains a `desserts` section: get_* return it and
--     save_onboarding_profile() saves it (the previous function is kept as
--     save_onboarding_profile_base and called first).
-- =============================================================================

alter table public.recipes
  add column course text not null default 'main' check (course in ('main', 'dessert')),
  add column dessert_category text check (dessert_category in ('cookies', 'cakes', 'pastries', 'frozen', 'plated', 'fruit')),
  add column chill_minutes smallint not null default 0 check (chill_minutes between 0 and 2880),
  add constraint recipes_dessert_category_course check ((course = 'dessert') = (dessert_category is not null));
create index recipes_course_idx on public.recipes (course);

alter table public.planned_meals drop constraint if exists planned_meals_meal_type_check;
alter table public.planned_meals
  add constraint planned_meals_meal_type_check check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'dessert'));

alter table public.households
  add column dessert_frequency text not null default 'weekly'
    check (dessert_frequency in ('never', 'weekly', 'twice_weekly', 'weekends', 'occasions')),
  add column dessert_categories text[] not null default '{}'
    check (dessert_categories <@ array['cookies', 'cakes', 'pastries', 'frozen', 'plated', 'fruit']::text[]);

alter table public.user_preferences
  add column dessert_skill_level smallint check (dessert_skill_level between 1 and 5);

-- -----------------------------------------------------------------------------
-- Dessert preferences
-- -----------------------------------------------------------------------------
create or replace function public.dessert_preferences_json()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'frequency', h.dessert_frequency,
    'categories', to_jsonb(h.dessert_categories),
    'skillLevel', up.dessert_skill_level
  )
  from public.profiles p
  join public.households h on h.id = p.active_household_id
  left join public.user_preferences up on up.user_id = p.id
  where p.id = (select auth.uid()) and public.is_household_member(h.id);
$$;
revoke all on function public.dessert_preferences_json() from public;
revoke all on function public.dessert_preferences_json() from anon;
grant execute on function public.dessert_preferences_json() to authenticated;

-- Household frequency/categories (any member, like other household settings)
-- and the caller's own dessert skill.
create or replace function public.save_dessert_preferences(prefs jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  skill smallint;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if hh is null then
    raise exception 'No household for the current user' using errcode = '42501';
  end if;
  if jsonb_typeof(prefs) <> 'object' or jsonb_typeof(prefs -> 'categories') <> 'array' then
    raise exception 'Invalid dessert preferences' using errcode = '22023';
  end if;
  skill := nullif(prefs ->> 'skillLevel', '')::smallint;

  update public.households set
    dessert_frequency = prefs ->> 'frequency',
    dessert_categories = array(select distinct jsonb_array_elements_text(prefs -> 'categories'))
  where id = hh;

  update public.user_preferences set dessert_skill_level = skill where user_id = uid;
  if not found then
    insert into public.user_preferences (user_id, dessert_skill_level) values (uid, skill);
  end if;
end;
$$;
revoke all on function public.save_dessert_preferences(jsonb) from public;
revoke all on function public.save_dessert_preferences(jsonb) from anon;
grant execute on function public.save_dessert_preferences(jsonb) to authenticated;

-- Onboarding save: everything as before, then the dessert answers when present.
alter function public.save_onboarding_profile(jsonb) rename to save_onboarding_profile_base;
revoke all on function public.save_onboarding_profile_base(jsonb) from anon;

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
  return hid;
end;
$$;
revoke all on function public.save_onboarding_profile(jsonb) from public;
revoke all on function public.save_onboarding_profile(jsonb) from anon;
grant execute on function public.save_onboarding_profile(jsonb) to authenticated;

create or replace function public.get_onboarding_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when b is null then null else b || jsonb_build_object('desserts', public.dessert_preferences_json()) end
  from (select public.build_onboarding_profile(true) as b) x;
$$;

create or replace function public.get_household_onboarding_draft()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when b is null then null else b || jsonb_build_object('desserts', public.dessert_preferences_json()) end
  from (select public.build_onboarding_profile(false) as b) x;
$$;

-- -----------------------------------------------------------------------------
-- Meal plans keep each meal's type (dinner or dessert).
-- -----------------------------------------------------------------------------
create or replace function public.save_meal_plan(plan jsonb, overwrite_confirmed boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hh uuid := public.current_household_id();
  wk date := (plan ->> 'weekStart')::date;
  existing public.meal_plans%rowtype;
  plan_id uuid;
  confirmed timestamptz := nullif(plan ->> 'confirmedAt', '')::timestamptz;
begin
  if hh is null then
    raise exception 'No household for the current user' using errcode = 'insufficient_privilege';
  end if;
  if wk is null or extract(isodow from wk) <> 1 then
    raise exception 'weekStart must be a Monday' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(plan -> 'meals') <> 'array' or jsonb_array_length(plan -> 'meals') > 21 then
    raise exception 'meals must be an array of at most 21 meals' using errcode = 'check_violation';
  end if;
  -- One dinner and at most one dessert per day.
  if exists (
    select 1 from jsonb_array_elements(plan -> 'meals') m
    group by m ->> 'date', coalesce(m ->> 'mealType', 'dinner')
    having count(*) > 1
  ) then
    raise exception 'Only one dinner and one dessert per day' using errcode = 'check_violation';
  end if;

  select * into existing from public.meal_plans where household_id = hh and week_start = wk for update;

  if found and existing.confirmed_at is not null and not overwrite_confirmed then
    raise exception 'This week is confirmed. Confirm the overwrite to change it.' using errcode = 'P0001', hint = 'confirmed_plan';
  end if;

  insert into public.meal_plans (household_id, week_start, status, planning_mode, generated_by, summary, confirmed_at)
  values (
    hh, wk,
    case when confirmed is not null then 'active' else 'draft' end,
    coalesce(plan ->> 'mode', 'balanced'),
    coalesce(plan ->> 'generatedBy', 'manual'),
    nullif(plan ->> 'summary', ''),
    confirmed
  )
  on conflict (household_id, week_start) do update set
    status = excluded.status,
    planning_mode = excluded.planning_mode,
    generated_by = excluded.generated_by,
    summary = excluded.summary,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into plan_id;

  delete from public.planned_meals where meal_plan_id = plan_id;
  insert into public.planned_meals (meal_plan_id, recipe_id, custom_title, planned_date, meal_type, servings, is_locked, position, note)
  select
    plan_id,
    nullif(m ->> 'recipeId', '')::uuid,
    nullif(btrim(m ->> 'customTitle'), ''),
    (m ->> 'date')::date,
    case when m ->> 'mealType' = 'dessert' then 'dessert' else 'dinner' end,
    (m ->> 'servings')::smallint,
    coalesce((m ->> 'locked')::boolean, false),
    (ordinality - 1)::smallint,
    nullif(left(m ->> 'note', 300), '')
  from jsonb_array_elements(plan -> 'meals') with ordinality as t(m, ordinality);

  return plan_id;
end;
$$;
revoke all on function public.save_meal_plan(jsonb, boolean) from public;
revoke all on function public.save_meal_plan(jsonb, boolean) from anon;
grant execute on function public.save_meal_plan(jsonb, boolean) to authenticated;
