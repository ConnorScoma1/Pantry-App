-- =============================================================================
-- Shared household, part 2 (milestone 15).
--
-- Review before applying. Adds a column, two tables and functions; nothing
-- is deleted or changed for existing rows.
--   * user_preferences.portion — how much a person usually eats (1 = one
--     serving). Personal, like skill level; only they can change it.
--   * meal_attendance — "I'm in / I'm out" for dinner on a day. Each person
--     answers only for themselves. No answer = eating (the household default).
--   * meal_guests — extra people for dinner on a day; any member can set it.
--   * meal_attendance_range(from, to) — members (name, portion) and the
--     answers for those days, for the current household.
--   * household_activity(max) — a recent-activity feed for the current
--     household, built from records that already exist (kitchen log, grocery
--     list, ratings, orders, logged shops, weekly drafts). Nothing new is
--     tracked about anyone; only members of the household can read it.
-- Servings are never changed automatically: the apps suggest a number and a
-- member taps to use it.
-- =============================================================================

alter table public.user_preferences
  add column portion numeric(3, 2) not null default 1 check (portion between 0.25 and 3);

create or replace function public.set_my_portion(new_portion numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p numeric(3, 2) := round(new_portion * 4) / 4; -- quarters only
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if p is null or p < 0.25 or p > 3 then
    raise exception 'Portion must be between a quarter and three servings' using errcode = 'check_violation';
  end if;
  insert into public.user_preferences (user_id, portion) values (uid, p)
  on conflict (user_id) do update set portion = excluded.portion, updated_at = now();
  return p;
end;
$$;
revoke all on function public.set_my_portion(numeric) from public, anon;
grant execute on function public.set_my_portion(numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- Who's eating
-- -----------------------------------------------------------------------------
create table public.meal_attendance (
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  eating boolean not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, day, user_id)
);

create table public.meal_guests (
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  guests smallint not null check (guests between 0 and 20),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, day)
);

alter table public.meal_attendance enable row level security;
alter table public.meal_guests enable row level security;
create policy meal_attendance_select on public.meal_attendance for select to authenticated using (public.is_household_member(household_id));
create policy meal_guests_select on public.meal_guests for select to authenticated using (public.is_household_member(household_id));
revoke all on public.meal_attendance, public.meal_guests from anon, authenticated;
grant select on public.meal_attendance, public.meal_guests to authenticated;

-- Only for yourself, in your current household, from yesterday to two months ahead.
create or replace function public.set_meal_attendance(target_day date, is_eating boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Finish setting up your household first.' using errcode = 'insufficient_privilege';
  end if;
  if target_day is null or target_day < current_date - 1 or target_day > current_date + 62 then
    raise exception 'Choose a day in the next two months' using errcode = 'check_violation';
  end if;
  if is_eating is null then
    delete from public.meal_attendance where household_id = hh and day = target_day and user_id = uid;
  else
    insert into public.meal_attendance (household_id, day, user_id, eating) values (hh, target_day, uid, is_eating)
    on conflict (household_id, day, user_id) do update set eating = excluded.eating, updated_at = now();
  end if;
end;
$$;
revoke all on function public.set_meal_attendance(date, boolean) from public, anon;
grant execute on function public.set_meal_attendance(date, boolean) to authenticated;

create or replace function public.set_meal_guests(target_day date, guest_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Finish setting up your household first.' using errcode = 'insufficient_privilege';
  end if;
  if target_day is null or target_day < current_date - 1 or target_day > current_date + 62 then
    raise exception 'Choose a day in the next two months' using errcode = 'check_violation';
  end if;
  if guest_count is null or guest_count < 0 or guest_count > 20 then
    raise exception 'Guests must be between 0 and 20' using errcode = 'check_violation';
  end if;
  if guest_count = 0 then
    delete from public.meal_guests where household_id = hh and day = target_day;
  else
    insert into public.meal_guests (household_id, day, guests, updated_by) values (hh, target_day, guest_count, uid)
    on conflict (household_id, day) do update set guests = excluded.guests, updated_by = uid, updated_at = now();
  end if;
end;
$$;
revoke all on function public.set_meal_guests(date, integer) from public, anon;
grant execute on function public.set_meal_guests(date, integer) to authenticated;

create or replace function public.meal_attendance_range(from_day date, to_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with hh as (select public.current_household_id() as id)
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'name', coalesce(nullif(btrim(p.display_name), ''), 'Household member'),
        'isYou', m.user_id = (select auth.uid()),
        'portion', coalesce(up.portion, 1)) order by (m.user_id = (select auth.uid())) desc, m.created_at)
      from public.household_members m
      left join public.profiles p on p.id = m.user_id
      left join public.user_preferences up on up.user_id = m.user_id
      where m.household_id = (select id from hh)), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('day', a.day, 'userId', a.user_id, 'eating', a.eating))
      from public.meal_attendance a
      join public.household_members m on m.household_id = a.household_id and m.user_id = a.user_id
      where a.household_id = (select id from hh) and a.day between from_day and to_day), '[]'::jsonb),
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object('day', g.day, 'guests', g.guests))
      from public.meal_guests g
      where g.household_id = (select id from hh) and g.day between from_day and to_day), '[]'::jsonb)
  )
  where (select id from hh) is not null
    and public.is_household_member((select id from hh))
    and to_day >= from_day and to_day - from_day <= 31;
$$;
revoke all on function public.meal_attendance_range(date, date) from public, anon;
grant execute on function public.meal_attendance_range(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Activity feed (from existing records only)
-- -----------------------------------------------------------------------------
create or replace function public.household_activity(max_items integer default 40)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with hh as (select public.current_household_id() as id),
  events as (
    (select 'pantry_' || t.reason as kind, t.created_by as actor, t.created_at as at, coalesce(t.item_name, 'An item') as subject, null::text as detail
     from public.pantry_transactions t
     where t.household_id = (select id from hh) and t.reason in ('added', 'consumed', 'discarded', 'expired')
     order by t.created_at desc limit 60)
    union all
    (select 'grocery_added', i.added_by, i.created_at, i.name, i.source
     from public.grocery_list_items i join public.grocery_lists l on l.id = i.grocery_list_id
     where l.household_id = (select id from hh)
     order by i.created_at desc limit 60)
    union all
    (select 'grocery_checked', i.checked_by, i.checked_at, i.name, null
     from public.grocery_list_items i join public.grocery_lists l on l.id = i.grocery_list_id
     where l.household_id = (select id from hh) and i.is_checked and i.checked_at is not null
     order by i.checked_at desc limit 60)
    union all
    (select 'rated', r.user_id, r.created_at, coalesce(rc.title, 'a recipe'), r.overall::text
     from public.recipe_ratings r left join public.recipes rc on rc.id = r.recipe_id
     where r.household_id = (select id from hh)
     order by r.created_at desc limit 20)
    union all
    (select 'cart_ordered', c.purchase_reported_by, c.updated_at, coalesce(c.store_name, 'the store'), null
     from public.cart_drafts c
     where c.household_id = (select id from hh) and c.purchase = 'ordered'
     order by c.updated_at desc limit 10)
    union all
    (select 'shop_logged', s.created_by, s.created_at, coalesce(s.store_name, 'groceries'), s.amount_cents::text
     from public.grocery_spending s
     where s.household_id = (select id from hh)
     order by s.created_at desc limit 20)
    union all
    (select 'plan_confirmed', null, mp.confirmed_at, to_char(mp.week_start, 'YYYY-MM-DD'), null
     from public.meal_plans mp
     where mp.household_id = (select id from hh) and mp.confirmed_at is not null
     order by mp.confirmed_at desc limit 10)
    union all
    (select 'plan_drafted', null, j.finished_at, to_char(j.week_start, 'YYYY-MM-DD'), null
     from public.planning_jobs j
     where j.household_id = (select id from hh) and j.status = 'drafted'
     order by j.finished_at desc limit 10)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', e.kind,
      'actorName', case when e.actor is null then null
                        when e.actor = (select auth.uid()) then 'You'
                        when exists (select 1 from public.household_members m where m.household_id = (select id from hh) and m.user_id = e.actor)
                          then coalesce(nullif(btrim(p.display_name), ''), 'A household member')
                        else 'A former member' end,
      'isYou', e.actor is not null and e.actor = (select auth.uid()),
      'at', e.at,
      'subject', left(e.subject, 160),
      'detail', e.detail) order by e.at desc), '[]'::jsonb)
  from (select * from events where at is not null order by at desc limit least(greatest(coalesce(max_items, 40), 1), 100)) e
  left join public.profiles p on p.id = e.actor
  where (select id from hh) is not null and public.is_household_member((select id from hh));
$$;
revoke all on function public.household_activity(integer) from public, anon;
grant execute on function public.household_activity(integer) to authenticated;

-- Live updates for "who's eating" (row-level security still decides who receives what).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.meal_attendance, public.meal_guests;
  end if;
end $$;
