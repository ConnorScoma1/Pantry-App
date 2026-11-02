-- =============================================================================
-- Saved AI meal-plan answers (AI cost brief: "Cache generated meal plans").
--
-- Review before applying. Adds one private table and two functions; nothing
-- is deleted or changed.
--
--   * ai_plan_cache — the AI's validated answer for one planning request:
--     which candidate recipe on which date, a one-line reason each, and a
--     short summary. Keyed by household and a SHA-256 of the request (model,
--     candidates, open dates, mode, skill), so the same request in the same
--     household is answered without a second AI call, from the web, the
--     phone or the weekly draft job. Nothing personal is stored: no names,
--     no prompts, no kitchen contents. Kept 48 hours (at most 7 days) and at
--     most 20 answers per household (a trigger tidies on every save).
--   * get_ai_plan(key) / put_ai_plan(key, answer, ttl_hours) — read and save
--     for the caller's active household. The table itself isn't readable or
--     writable by signed-in people; the server's weekly job uses the service
--     role.
--
-- A saved answer is never trusted as-is: the app re-checks it against the
-- recipes the household may have right now (allergies, diet, equipment,
-- skill) exactly like a fresh AI answer, and ignores it if anything is off.
-- =============================================================================

create or replace function public.valid_ai_plan_answer(answer jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(answer) = 'object'
    and not exists (select 1 from jsonb_object_keys(answer) k where k not in ('meals', 'summary'))
    and jsonb_typeof(answer -> 'meals') = 'array'
    and jsonb_array_length(answer -> 'meals') between 1 and 14
    and coalesce(jsonb_typeof(answer -> 'summary'), '') = 'string'
    and char_length(answer ->> 'summary') <= 600
    and not exists (
      select 1 from jsonb_array_elements(answer -> 'meals') m
      where jsonb_typeof(m) <> 'object'
         or exists (select 1 from jsonb_object_keys(m) k where k not in ('date', 'recipeId', 'why'))
         or coalesce(m ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or coalesce(jsonb_typeof(m -> 'recipeId'), '') <> 'string'
         or char_length(m ->> 'recipeId') not between 1 and 100
         or coalesce(jsonb_typeof(m -> 'why'), '') <> 'string'
         or char_length(m ->> 'why') > 200
    ), false);
$$;

create table public.ai_plan_cache (
  household_id uuid not null references public.households (id) on delete cascade,
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  answer jsonb not null check (public.valid_ai_plan_answer(answer)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (household_id, cache_key),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index ai_plan_cache_expiry_idx on public.ai_plan_cache (expires_at);

-- Every save (the functions below or the service role's job) tidies the
-- household's expired answers and keeps its newest 20.
create or replace function public.prune_ai_plan_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_plan_cache c
  where c.household_id = new.household_id
    and (c.expires_at <= now()
      or c.cache_key in (
        select o.cache_key from public.ai_plan_cache o
        where o.household_id = new.household_id
        order by o.created_at desc, o.cache_key
        offset 20
      ));
  return null;
end;
$$;
revoke all on function public.prune_ai_plan_cache() from public, anon, authenticated;
create trigger ai_plan_cache_prune after insert or update on public.ai_plan_cache
  for each row execute function public.prune_ai_plan_cache();

-- Private: only the functions below (and the service role) touch it.
alter table public.ai_plan_cache enable row level security;
revoke all on public.ai_plan_cache from anon, authenticated;
grant select, insert, update, delete on public.ai_plan_cache to service_role;

-- The saved answer for this request in the caller's active household, if it hasn't expired.
create or replace function public.get_ai_plan(key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hh uuid := public.current_household_id();
begin
  if (select auth.uid()) is null or hh is null or not public.is_household_member(hh) then
    return null;
  end if;
  return (
    select c.answer from public.ai_plan_cache c
    where c.household_id = hh and c.cache_key = key and c.expires_at > now()
  );
end;
$$;

-- Save (or refresh) an answer for the caller's active household.
create or replace function public.put_ai_plan(key text, answer jsonb, ttl_hours integer default 48)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid := public.current_household_id();
begin
  if (select auth.uid()) is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(key, '') !~ '^[0-9a-f]{64}$' or not public.valid_ai_plan_answer(answer) or ttl_hours is null or ttl_hours not between 1 and 168 then
    raise exception 'That saved plan isn''t valid.' using errcode = 'check_violation';
  end if;
  insert into public.ai_plan_cache (household_id, cache_key, answer, created_at, expires_at)
  values (hh, key, answer, now(), now() + make_interval(hours => ttl_hours))
  on conflict (household_id, cache_key)
  do update set answer = excluded.answer, created_at = excluded.created_at, expires_at = excluded.expires_at;
  return true;
end;
$$;

revoke all on function public.valid_ai_plan_answer(jsonb) from public, anon;
revoke all on function public.get_ai_plan(text) from public, anon;
revoke all on function public.put_ai_plan(text, jsonb, integer) from public, anon;
grant execute on function public.valid_ai_plan_answer(jsonb) to authenticated, service_role;
grant execute on function public.get_ai_plan(text) to authenticated;
grant execute on function public.put_ai_plan(text, jsonb, integer) to authenticated;
