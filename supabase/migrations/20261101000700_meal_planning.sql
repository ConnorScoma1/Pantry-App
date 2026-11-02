-- =============================================================================
-- Weekly meal planning (milestone 4)
--  * meal_plans: planning mode, who/what generated it, short summary, and
--    confirmed_at — a confirmed week is never overwritten silently.
--  * planned_meals: a short note ("why it's here").
--  * save_meal_plan(plan, overwrite_confirmed): atomic upsert of a week and
--    its meals, as the caller (RLS applies).
--  * ai_usage: one row per AI request (tokens, outcome) for cost control,
--    plus ai_requests_last_day(feature) for per-household limits.
-- =============================================================================

alter table public.meal_plans
  alter column household_id set default public.current_household_id(),
  add column planning_mode text not null default 'balanced'
    check (planning_mode in ('budget_first', 'balanced', 'chefs_choice', 'use_what_i_have', 'cook_the_specials')),
  add column generated_by text not null default 'manual' check (generated_by in ('ai', 'rules', 'manual')),
  add column summary text check (char_length(summary) <= 600),
  add column confirmed_at timestamptz;

alter table public.planned_meals
  add column note text check (char_length(note) <= 300);

-- Meals must fall inside their plan's week.
create or replace function public.planned_meal_in_week()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  start date;
begin
  select week_start into start from public.meal_plans where id = new.meal_plan_id;
  if new.planned_date < start or new.planned_date > start + 6 then
    raise exception 'planned_date % is outside the week starting %', new.planned_date, start
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger planned_meals_in_week
  before insert or update of planned_date, meal_plan_id on public.planned_meals
  for each row execute function public.planned_meal_in_week();

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

  select * into existing from public.meal_plans where household_id = hh and week_start = wk for update;

  -- A confirmed week is only replaced when the caller says so explicitly.
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
    'dinner',
    (m ->> 'servings')::smallint,
    coalesce((m ->> 'locked')::boolean, false),
    (ordinality - 1)::smallint,
    nullif(left(m ->> 'note', 300), '')
  from jsonb_array_elements(plan -> 'meals') with ordinality as t(m, ordinality);

  return plan_id;
end;
$$;
revoke all on function public.save_meal_plan(jsonb, boolean) from public;
grant execute on function public.save_meal_plan(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- AI usage log (cost control)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null check (feature in ('meal_plan')),
  model text check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  outcome text not null check (outcome in ('ok', 'fallback', 'cached', 'limited')),
  created_at timestamptz not null default now()
);
create index ai_usage_household_idx on public.ai_usage (household_id, feature, created_at desc);

alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (public.is_household_member(household_id));
create policy ai_usage_insert_own on public.ai_usage
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_household_member(household_id));
revoke all on public.ai_usage from anon;
grant select, insert on public.ai_usage to authenticated;

-- Requests that actually reached the model in the last 24 hours (cached and
-- limited requests are free, so they don't count).
create or replace function public.ai_requests_last_day(feature_name text)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.ai_usage
  where household_id = public.current_household_id()
    and feature = feature_name
    and outcome in ('ok', 'fallback')
    and created_at > now() - interval '24 hours';
$$;
revoke all on function public.ai_requests_last_day(text) from public;
grant execute on function public.ai_requests_last_day(text) to authenticated;
