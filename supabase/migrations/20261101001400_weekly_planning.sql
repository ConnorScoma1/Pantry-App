-- =============================================================================
-- Proactive weekly planning (spec 02 §6, milestone 11).
--
-- Review before applying. Adds tables and functions only; nothing existing is
-- changed or deleted. Nothing runs until (1) a household switches weekly
-- drafts on, and (2) someone schedules the server job (README, "Weekly
-- drafts") — this migration schedules nothing.
--
--   * weekly_planning_settings — per household, OFF by default: the day and
--     hour (in the household's time zone) to draft next week, and the
--     planning mode. Any member can change it.
--   * planning_jobs — one row per household per week. The server claims due
--     households, drafts the week, and records what happened. A draft is only
--     written into an EMPTY week: a confirmed week, or one someone has started
--     planning, is left exactly as it is (the job is marked "skipped").
--     Drafts are never confirmed and nothing is ever bought.
--   * notifications — "next week's plan is ready" in the app, per person.
--   * notification_preferences — per person (individual, not household):
--     in-app notices on by default, phone notifications off until turned on.
--   * push_tokens — phone push addresses (Expo), per person; only the server
--     reads them.
--
-- Only the server (service role) can claim jobs, read a household's planning
-- inputs, or finish a job. While drafting, the server acts as one member of
-- the household (the person who switched drafts on, while that household is
-- the one they have open), so the existing functions — get_onboarding_profile,
-- can_read_recipe, save_meal_plan — apply exactly as they do in the app:
-- everyone's allergies and diets, that person's skill and tastes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
create table public.weekly_planning_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  enabled boolean not null default false,
  -- ISO day: 1 = Monday … 7 = Sunday. The draft is for the week starting the following Monday.
  run_day smallint not null default 6 check (run_day between 1 and 7),
  run_hour smallint not null default 9 check (run_hour between 0 and 23),
  time_zone text not null default 'America/Chicago' check (char_length(time_zone) between 1 and 64),
  planning_mode text not null default 'balanced'
    check (planning_mode in ('budget_first', 'balanced', 'chefs_choice', 'use_what_i_have', 'cook_the_specials')),
  enabled_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.weekly_planning_settings enable row level security;
create policy weekly_planning_settings_select on public.weekly_planning_settings
  for select to authenticated using (public.is_household_member(household_id));
revoke all on public.weekly_planning_settings from anon, authenticated;
grant select on public.weekly_planning_settings to authenticated;

-- The current household's settings (defaults when never saved).
create or replace function public.get_weekly_planning()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce(w.enabled, false),
    'runDay', coalesce(w.run_day, 6),
    'runHour', coalesce(w.run_hour, 9),
    'timeZone', coalesce(w.time_zone, 'America/Chicago'),
    'mode', coalesce(w.planning_mode, 'balanced'),
    'enabledByName', case when w.enabled then coalesce(p.display_name, 'A household member') end,
    'enabledByYou', coalesce(w.enabled and w.enabled_by = (select auth.uid()), false),
    'saved', w.household_id is not null
  )
  from (select public.current_household_id() as hh) c
  left join public.weekly_planning_settings w on w.household_id = c.hh
  left join public.profiles p on p.id = w.enabled_by
  where c.hh is not null and public.is_household_member(c.hh);
$$;
revoke all on function public.get_weekly_planning() from public, anon;
grant execute on function public.get_weekly_planning() to authenticated;

create or replace function public.save_weekly_planning(settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  was_enabled boolean;
  on_now boolean := coalesce((settings ->> 'enabled')::boolean, false);
  d smallint := coalesce((settings ->> 'runDay')::smallint, 6);
  h smallint := coalesce((settings ->> 'runHour')::smallint, 9);
  tz text := coalesce(nullif(btrim(settings ->> 'timeZone'), ''), 'America/Chicago');
  m text := coalesce(settings ->> 'mode', 'balanced');
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Finish setting up your household first.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(settings) <> 'object' then
    raise exception 'Settings must be an object' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    raise exception 'Unknown time zone' using errcode = 'check_violation';
  end if;

  select w.enabled into was_enabled from public.weekly_planning_settings w where w.household_id = hh for update;

  insert into public.weekly_planning_settings as w (household_id, enabled, run_day, run_hour, time_zone, planning_mode, enabled_by, updated_by)
  values (hh, on_now, d, h, tz, m, case when on_now then uid end, uid)
  on conflict (household_id) do update set
    enabled = excluded.enabled,
    run_day = excluded.run_day,
    run_hour = excluded.run_hour,
    time_zone = excluded.time_zone,
    planning_mode = excluded.planning_mode,
    -- Whoever switches drafts on is the person the draft is planned as.
    enabled_by = case when excluded.enabled and not coalesce(was_enabled, false) then uid
                      when excluded.enabled then w.enabled_by
                      else null end,
    updated_by = uid,
    updated_at = now();

  return public.get_weekly_planning();
end;
$$;
revoke all on function public.save_weekly_planning(jsonb) from public, anon;
grant execute on function public.save_weekly_planning(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Jobs
-- -----------------------------------------------------------------------------
create table public.planning_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  planning_mode text not null default 'balanced'
    check (planning_mode in ('budget_first', 'balanced', 'chefs_choice', 'use_what_i_have', 'cook_the_specials')),
  status text not null default 'running' check (status in ('running', 'drafted', 'skipped', 'failed')),
  attempts smallint not null default 1 check (attempts between 0 and 10),
  lease_until timestamptz,
  acting_user uuid references auth.users (id) on delete set null,
  meal_plan_id uuid references public.meal_plans (id) on delete set null,
  -- Plain-language result for the household ("Drafted 5 dinners …" / why it was skipped).
  message text check (char_length(message) <= 300),
  -- What went into the draft: { source, specialsUsed, storeName, useSoon[], unfilled, notes[] }.
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (household_id, week_start)
);
create index planning_jobs_household_idx on public.planning_jobs (household_id, week_start desc);

alter table public.planning_jobs enable row level security;
create policy planning_jobs_select on public.planning_jobs
  for select to authenticated using (public.is_household_member(household_id));
revoke all on public.planning_jobs from anon, authenticated;
grant select on public.planning_jobs to authenticated;

-- -----------------------------------------------------------------------------
-- Notifications and preferences (per person)
-- -----------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan_ready_in_app boolean not null default true,
  plan_ready_push boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  kind text not null check (kind in ('plan_ready')),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 300),
  -- In-app path only (no outside links).
  link text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$' and char_length(link) <= 200),
  planning_job_id uuid references public.planning_jobs (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

-- A phone's address belongs to whoever is signed in on it now.
create or replace function public.register_push_token(push_token text, device_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if push_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' or device_platform not in ('ios', 'android') then
    raise exception 'That notification address is not valid' using errcode = 'check_violation';
  end if;
  insert into public.push_tokens as t (user_id, token, platform)
  values (uid, push_token, device_platform)
  on conflict (token) do update set user_id = uid, platform = excluded.platform, last_seen_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.unregister_push_token(push_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = push_token and user_id = (select auth.uid());
$$;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Server-only job functions
-- -----------------------------------------------------------------------------

-- Act as one member inside the calling function (the app's own functions and
-- checks then apply), and put the caller's identity back before returning.
-- Only callable from the functions below.
create or replace function public.planning_act_as(member uuid)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  previous text[] := array[
    coalesce(current_setting('request.jwt.claim.sub', true), ''),
    coalesce(current_setting('request.jwt.claim.role', true), ''),
    coalesce(current_setting('request.jwt.claims', true), '')];
begin
  perform set_config('request.jwt.claim.sub', member::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', member, 'role', 'authenticated')::text, true);
  return previous;
end;
$$;
revoke all on function public.planning_act_as(uuid) from public, anon, authenticated, service_role;

create or replace function public.planning_restore(previous text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', previous[1], true);
  perform set_config('request.jwt.claim.role', previous[2], true);
  perform set_config('request.jwt.claims', previous[3], true);
end;
$$;
revoke all on function public.planning_restore(text[]) from public, anon, authenticated, service_role;

-- Who the draft is planned as: the person who switched drafts on, else the
-- owner, else the longest-standing member — and only someone who has finished
-- setting up and has THIS household open (so "current household" means it).
create or replace function public.planning_member(target_household uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.household_members m
  join public.profiles p on p.id = m.user_id
  left join public.weekly_planning_settings w on w.household_id = m.household_id
  where m.household_id = target_household
    and p.active_household_id = target_household
    and p.onboarding_completed_at is not null
  order by (m.user_id = w.enabled_by) desc nulls last, (m.role = 'owner') desc, m.created_at
  limit 1;
$$;
revoke all on function public.planning_member(uuid) from public, anon, authenticated, service_role;

-- Claim households whose drafting time has passed this week. Safe to call as
-- often as you like (e.g. every hour): one job per household per week, failed
-- or interrupted jobs are retried up to three times.
create or replace function public.claim_planning_jobs(max_jobs integer default 25)
returns table (job_id uuid, household_id uuid, week_start date, planning_mode text, attempts smallint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s record;
  local_ts timestamp;
  wk date;
  j public.planning_jobs%rowtype;
  budget integer := least(greatest(coalesce(max_jobs, 25), 1), 200);
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can run weekly planning' using errcode = 'insufficient_privilege';
  end if;

  -- Interrupted too often: give up for this week.
  update public.planning_jobs pj
  set status = 'failed', lease_until = null, finished_at = now(),
      message = 'Drafting kept stopping part-way, so there''s no draft this week. Plan as usual — we''ll try again next week.'
  where pj.status = 'running' and pj.lease_until < now() and pj.attempts >= 3;

  -- Old read notices.
  delete from public.notifications n where n.read_at is not null and n.read_at < now() - interval '90 days';

  for s in
    select w.* from public.weekly_planning_settings w
    where w.enabled
    order by w.updated_at
    for update skip locked
  loop
    exit when budget <= 0;
    local_ts := now() at time zone s.time_zone;
    continue when not (
      extract(isodow from local_ts) > s.run_day
      or (extract(isodow from local_ts) = s.run_day and extract(hour from local_ts) >= s.run_hour)
    );
    wk := date_trunc('week', local_ts)::date + 7;

    insert into public.planning_jobs as pj (household_id, week_start, planning_mode, status, attempts, lease_until)
    values (s.household_id, wk, s.planning_mode, 'running', 1, now() + interval '10 minutes')
    on conflict on constraint planning_jobs_household_id_week_start_key do update set
      status = 'running',
      attempts = pj.attempts + 1,
      lease_until = now() + interval '10 minutes',
      planning_mode = excluded.planning_mode,
      message = null,
      finished_at = null
    where (pj.status = 'failed' and pj.attempts < 3 and pj.finished_at < now() - interval '20 minutes')
       or (pj.status = 'running' and pj.lease_until < now() and pj.attempts < 3)
    returning pj.* into j;

    if j.id is not null then
      job_id := j.id; household_id := j.household_id; week_start := j.week_start;
      planning_mode := j.planning_mode; attempts := j.attempts;
      return next;
      budget := budget - 1;
      j := null;
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_planning_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_planning_jobs(integer) to service_role;

-- Everything the planner needs for one claimed job, read as the planning
-- member. Returns {"skip": reason} when the week must be left alone.
create or replace function public.planning_job_context(job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.planning_jobs%rowtype;
  member uuid;
  existing public.meal_plans%rowtype;
  meal_count integer := 0;
  readable uuid[];
  caller text[];
  result jsonb;
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can run weekly planning' using errcode = 'insufficient_privilege';
  end if;
  select * into j from public.planning_jobs pj where pj.id = job;
  if not found or j.status <> 'running' then
    raise exception 'That planning job is not running' using errcode = 'P0001';
  end if;

  select * into existing from public.meal_plans mp where mp.household_id = j.household_id and mp.week_start = j.week_start;
  if found then
    select count(*) into meal_count from public.planned_meals pm where pm.meal_plan_id = existing.id;
    if existing.confirmed_at is not null then
      return jsonb_build_object('skip', 'Next week is already confirmed, so we left it as it is.');
    end if;
    if meal_count > 0 then
      return jsonb_build_object('skip', 'Someone has already started planning next week, so we left it as it is.');
    end if;
  end if;

  member := public.planning_member(j.household_id);
  if member is null then
    return jsonb_build_object('skip', 'Nobody has this household open in the app right now, so there''s no draft this week.');
  end if;

  caller := public.planning_act_as(member);
  if public.current_household_id() is distinct from j.household_id then
    raise exception 'Planning member mismatch' using errcode = 'P0001';
  end if;
  readable := array(select r.id from public.recipes r where public.can_read_recipe(r.id) order by r.title limit 500);

  result := jsonb_build_object(
    'jobId', j.id,
    'householdId', j.household_id,
    'userId', member,
    'weekStart', j.week_start,
    'mode', j.planning_mode,
    'attempts', j.attempts,
    'profile', public.get_onboarding_profile(),
    'pantry', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.name) from (
        select p.id, p.ingredient_id, p.name, p.category, p.quantity, p.unit, p.storage_location, p.purchased_on,
               p.use_by, p.opened_on, p.estimated_remaining_pct, p.price_paid_cents, p.is_staple, p.created_at, p.updated_at
        from public.pantry_items p where p.household_id = j.household_id order by p.name limit 2000) x), '[]'::jsonb),
    'favorites', coalesce((select jsonb_agg(f.recipe_id) from public.user_favorites f where f.user_id = member), '[]'::jsonb),
    'ratings', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select r.recipe_id, r.overall, r.flavor, r.difficulty, r.would_cook_again, r.actual_minutes, r.family_approval, r.notes, r.created_at
        from public.recipe_ratings r
        where r.user_id = member or r.household_id = j.household_id
        order by r.created_at desc limit 500) x), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select e.recipe_id, e.event, e.surface, e.created_at
        from public.recommendation_events e where e.household_id = j.household_id
        order by e.created_at desc limit 500) x), '[]'::jsonb),
    'recipeIds', to_jsonb(readable),
    'summaries', coalesce((select jsonb_agg(to_jsonb(s)) from public.recipe_rating_summaries(readable) s), '[]'::jsonb),
    'store', (
      select case when h.pricing_provider = 'kroger' and h.pricing_store_id is not null then jsonb_build_object(
        'provider', h.pricing_provider, 'storeId', h.pricing_store_id, 'name', coalesce(h.pricing_store_name, 'Kroger store'),
        'address', h.pricing_store_address, 'setAt', h.pricing_store_set_at) end
      from public.households h where h.id = j.household_id)
  );
  perform public.planning_restore(caller);
  return result;
end;
$$;
revoke all on function public.planning_job_context(uuid) from public, anon, authenticated;
grant execute on function public.planning_job_context(uuid) to service_role;

-- Save the draft into the (still empty) week, record the result and leave a
-- notice for each member who wants one. Returns who asked for phone pushes.
create or replace function public.finish_planning_job(job uuid, plan jsonb, details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.planning_jobs%rowtype;
  member uuid;
  existing public.meal_plans%rowtype;
  meal_count integer := 0;
  plan_id uuid;
  msg text := nullif(left(btrim(coalesce(details ->> 'message', '')), 300), '');
  info jsonb;
  skip_reason text;
  caller text[];
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can run weekly planning' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(details) <> 'object' or jsonb_typeof(plan) <> 'object' or jsonb_typeof(plan -> 'meals') <> 'array' then
    raise exception 'Planning result has the wrong shape' using errcode = 'check_violation';
  end if;
  info := details - 'message';

  select * into j from public.planning_jobs pj where pj.id = job for update;
  if not found or j.status <> 'running' then
    raise exception 'That planning job is not running' using errcode = 'P0001';
  end if;
  if (plan ->> 'weekStart')::date is distinct from j.week_start then
    raise exception 'The draft is for the wrong week' using errcode = 'check_violation';
  end if;
  if coalesce(plan ->> 'generatedBy', '') not in ('ai', 'rules') or jsonb_array_length(plan -> 'meals') = 0 then
    raise exception 'A weekly draft must come from the planner and have meals' using errcode = 'check_violation';
  end if;

  -- Re-check under lock: someone may have planned or confirmed the week meanwhile.
  select * into existing from public.meal_plans mp where mp.household_id = j.household_id and mp.week_start = j.week_start for update;
  if found then
    select count(*) into meal_count from public.planned_meals pm where pm.meal_plan_id = existing.id;
    if existing.confirmed_at is not null then
      skip_reason := 'Next week was confirmed while we were drafting, so we left it as it is.';
    elsif meal_count > 0 then
      skip_reason := 'Someone started planning next week while we were drafting, so we left your plan alone.';
    end if;
  end if;
  member := public.planning_member(j.household_id);
  if skip_reason is null and member is null then
    skip_reason := 'Nobody has this household open in the app right now, so there''s no draft this week.';
  end if;
  if skip_reason is not null then
    update public.planning_jobs set status = 'skipped', message = skip_reason, details = info,
      lease_until = null, finished_at = now()
    where id = j.id;
    return jsonb_build_object('status', 'skipped', 'message', skip_reason, 'pushUsers', '[]'::jsonb);
  end if;

  caller := public.planning_act_as(member);
  if public.current_household_id() is distinct from j.household_id then
    raise exception 'Planning member mismatch' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(plan -> 'meals') m
    where nullif(m ->> 'recipeId', '') is not null and not public.can_read_recipe((m ->> 'recipeId')::uuid)
  ) then
    raise exception 'The draft uses a recipe this household cannot see' using errcode = 'check_violation';
  end if;

  -- Drafts are never confirmed by the job.
  plan_id := public.save_meal_plan(plan || jsonb_build_object('confirmedAt', null), false);
  perform public.planning_restore(caller);

  update public.planning_jobs set status = 'drafted', meal_plan_id = plan_id, acting_user = member,
    message = msg, details = info, lease_until = null, finished_at = now()
  where id = j.id;

  insert into public.notifications (user_id, household_id, kind, title, body, link, planning_job_id)
  select m.user_id, j.household_id, 'plan_ready', 'Next week''s meal plan is ready to review', msg,
         '/plan?week=' || to_char(j.week_start, 'YYYY-MM-DD'), j.id
  from public.household_members m
  left join public.notification_preferences np on np.user_id = m.user_id
  where m.household_id = j.household_id and coalesce(np.plan_ready_in_app, true);

  return jsonb_build_object(
    'status', 'drafted',
    'mealPlanId', plan_id,
    'message', msg,
    'pushUsers', coalesce((
      select jsonb_agg(m.user_id)
      from public.household_members m
      join public.notification_preferences np on np.user_id = m.user_id
      where m.household_id = j.household_id and np.plan_ready_push), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.finish_planning_job(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_planning_job(uuid, jsonb, jsonb) to service_role;

-- Record a job that couldn't finish: "skipped" (nothing to do) or "failed"
-- (retried later, up to three tries).
create or replace function public.stop_planning_job(job uuid, reason text, skipped boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can run weekly planning' using errcode = 'insufficient_privilege';
  end if;
  update public.planning_jobs
  set status = case when skipped then 'skipped' else 'failed' end,
      message = nullif(left(btrim(coalesce(reason, '')), 300), ''),
      lease_until = null,
      finished_at = now()
  where id = job and status = 'running';
end;
$$;
revoke all on function public.stop_planning_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.stop_planning_job(uuid, text, boolean) to service_role;
