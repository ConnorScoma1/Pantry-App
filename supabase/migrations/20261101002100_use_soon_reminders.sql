-- =============================================================================
-- Use-soon reminders (spec 01 Phase 6: expiration reminders).
--
-- Review before applying. Adds columns, one table and a server-only
-- function; nothing existing is deleted. (Old use-soon notices are tidied
-- away after a week, because they're about dates that have passed.)
--
--   * notification_preferences gains, per person:
--       use_soon_in_app — a notice in the bell (on by default),
--       use_soon_push   — a phone notification (off until turned on),
--       time_zone       — so "the morning" means this person's morning.
--   * notifications may now be 'use_soon', and gain expires_at: a use-soon
--     notice disappears at the end of the person's day, so an old notice
--     can never suggest cooking something whose date has since passed.
--   * Leaving a household removes your notices about it.
--   * A person can have at most 10 phones registered (the oldest is dropped).
--   * use_soon_runs — one row per person per local day, so nobody hears
--     about it twice in one day however often the job runs.
--   * use_soon_reminders(max_people) — run by the server (service role)
--     only, once an hour. Between 8 AM and 8 PM local time it tells each
--     person what in their active household's kitchen is due today or
--     tomorrow (by the use-by date the household entered). Staples, used-up
--     items and anything already past its date are left out — Home and
--     My Kitchen already flag those, and we never suggest eating past a date.
-- =============================================================================

alter table public.notification_preferences
  add column if not exists use_soon_in_app boolean not null default true,
  add column if not exists use_soon_push boolean not null default false,
  add column if not exists time_zone text check (time_zone is null or char_length(time_zone) between 1 and 64);

create or replace function public.notification_preferences_check_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.time_zone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger notification_preferences_time_zone
  before insert or update of time_zone on public.notification_preferences
  for each row execute function public.notification_preferences_check_time_zone();

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('plan_ready', 'use_soon'));
alter table public.notifications add column if not exists expires_at timestamptz;

-- Expired notices are hidden (and tidied away by the job later).
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and (expires_at is null or expires_at > now()));

-- Leaving a household (or being removed) takes your notices about it with you.
create or replace function public.forget_household_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n where n.user_id = old.user_id and n.household_id = old.household_id;
  return old;
end;
$$;
revoke all on function public.forget_household_notifications() from public, anon, authenticated;
create trigger household_members_forget_notifications
  after delete on public.household_members
  for each row execute function public.forget_household_notifications();

-- At most 10 phones per person: registering an 11th drops the longest-unused.
create or replace function public.push_tokens_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_tokens t
  where t.id in (
    select x.id from public.push_tokens x
    where x.user_id = new.user_id and x.token <> new.token
    order by x.last_seen_at desc nulls last, x.created_at desc
    offset 9
  );
  return new;
end;
$$;
revoke all on function public.push_tokens_cap() from public, anon, authenticated;
create trigger push_tokens_cap
  before insert on public.push_tokens
  for each row execute function public.push_tokens_cap();

create table public.use_soon_runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  household_id uuid not null references public.households (id) on delete cascade,
  item_count integer not null check (item_count >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
-- Bookkeeping for the job only: no one signed in can read or change it.
alter table public.use_soon_runs enable row level security;
revoke all on public.use_soon_runs from anon, authenticated;

create or replace function public.use_soon_reminders(max_people integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  budget integer := least(greatest(coalesce(max_people, 500), 1), 5000);
  p record;
  n integer;
  first_name text;
  names text;
  msg_title text;
  msg_body text;
  added integer;
  people integer := 0;
  notices integer := 0;
  pushes jsonb := '[]'::jsonb;
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can send reminders' using errcode = 'insufficient_privilege';
  end if;

  delete from public.use_soon_runs r where r.local_date < current_date - 7;
  delete from public.notifications x where x.expires_at is not null and x.expires_at < now() - interval '1 day';

  -- Everyone due a reminder right now, worked out in one query: reminders on,
  -- a known time zone (else US Central), daytime there, not yet reminded
  -- today, and something in their active household due today or tomorrow.
  for p in
    with people as (
      select pr.id as user_id,
             pr.active_household_id as household_id,
             coalesce(np.use_soon_in_app, true) as in_app,
             coalesce(np.use_soon_push, false) as push,
             coalesce(z.name, 'America/Chicago') as tz
      from public.profiles pr
      join public.household_members m on m.user_id = pr.id and m.household_id = pr.active_household_id
      left join public.notification_preferences np on np.user_id = pr.id
      left join public.weekly_planning_settings w on w.household_id = pr.active_household_id
      left join pg_catalog.pg_timezone_names z on z.name = coalesce(np.time_zone, w.time_zone)
      where coalesce(np.use_soon_in_app, true) or coalesce(np.use_soon_push, false)
    ), local as (
      select pe.*, (now() at time zone pe.tz) as local_ts from people pe
    )
    select l.user_id, l.household_id, l.in_app, l.push, l.tz, l.local_ts::date as today
    from local l
    where extract(hour from l.local_ts) between 8 and 19
      and not exists (select 1 from public.use_soon_runs r where r.user_id = l.user_id and r.local_date = l.local_ts::date)
      and exists (
        select 1 from public.pantry_items pi
        where pi.household_id = l.household_id and not pi.is_staple
          and pi.use_by between l.local_ts::date and l.local_ts::date + 1
          and coalesce(pi.quantity, 1) > 0 and coalesce(pi.estimated_remaining_pct, 1) > 0)
    order by l.user_id
    limit budget
  loop
    select count(*)::integer,
           (array_agg(x.label order by x.use_by, x.label))[1],
           string_agg(x.label || ' (by ' || to_char(x.use_by, 'Mon FMDD') || ')', ', ' order by x.use_by, x.label) filter (where x.rn <= 3)
      into n, first_name, names
    from (
      select coalesce(nullif(left(btrim(regexp_replace(pi.name, '[[:cntrl:]]+', ' ', 'g')), 60), ''), 'An item') as label,
             pi.use_by,
             row_number() over (order by pi.use_by, pi.name) as rn
      from public.pantry_items pi
      where pi.household_id = p.household_id
        and not pi.is_staple
        and pi.use_by between p.today and p.today + 1
        and coalesce(pi.quantity, 1) > 0
        and coalesce(pi.estimated_remaining_pct, 1) > 0
    ) x;
    continue when n = 0;

    insert into public.use_soon_runs (user_id, local_date, household_id, item_count)
    values (p.user_id, p.today, p.household_id, n)
    on conflict do nothing;
    get diagnostics added = row_count;
    continue when added = 0;
    people := people + 1;

    -- Dates are written out ("by Nov 2"), never "today", so the words stay
    -- true however late they're read; the notice also expires tonight.
    msg_title := left('Use soon: ' || first_name || case when n > 1 then ' and ' || (n - 1) || ' more' else '' end, 120);
    msg_body := left(
      names || case when n > 3 then ' and ' || (n - 3) || ' more' else '' end
        || '. Plan a meal around ' || case when n = 1 then 'it' else 'them' end || ' before ' || case when n = 1 then 'that date' else 'those dates' end || '.',
      300);

    if p.in_app then
      insert into public.notifications (user_id, household_id, kind, title, body, link, expires_at)
      values (p.user_id, p.household_id, 'use_soon', msg_title, msg_body, '/kitchen', ((p.today + 1)::timestamp at time zone p.tz));
      notices := notices + 1;
    end if;
    if p.push then
      pushes := pushes || jsonb_build_object('userId', p.user_id, 'title', msg_title, 'body', msg_body);
    end if;
  end loop;

  return jsonb_build_object('people', people, 'notices', notices, 'push', pushes);
end;
$$;
revoke all on function public.use_soon_reminders(integer) from public, anon, authenticated;
grant execute on function public.use_soon_reminders(integer) to service_role;
