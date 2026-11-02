-- =============================================================================
-- "Your free trial ends soon" reminders (apply after …2900).
--
-- Review before applying. Changes one check and adds one table and one
-- function; deletes nothing. Does nothing while billing is switched off.
--
--   * notifications.kind may be 'trial_ending'.
--   * trial_reminder_runs — who has been reminded (once per trial). Private.
--   * trial_reminders(max_people) — service role only, called by the hourly
--     job. People whose free trial ends within the next 2 days, who don't
--     have a subscription and aren't covered by a household one, get one
--     notice in the app (it disappears when the trial ends) and, if they
--     have the app on a phone, a push notification. Each person is reminded
--     once. The date is written out, so the words stay true however late
--     they're read.
-- =============================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('plan_ready', 'use_soon', 'trial_ending'));

create table public.trial_reminder_runs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_ends_at timestamptz not null,
  reminded_at timestamptz not null default now()
);
alter table public.trial_reminder_runs enable row level security;
revoke all on public.trial_reminder_runs from anon, authenticated;
grant select, insert, delete on public.trial_reminder_runs to service_role;

create or replace function public.trial_reminders(max_people integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.billing_settings;
  budget integer := least(greatest(coalesce(max_people, 500), 1), 5000);
  p record;
  people integer := 0;
  pushes jsonb := '[]'::jsonb;
  msg_title text;
  msg_body text;
begin
  select * into st from public.billing_settings where id;
  if st is null or not st.enforced then
    return jsonb_build_object('people', 0, 'push', pushes);
  end if;

  for p in
    select u.id as user_id, public.trial_ends_at(u.id) as ends, pr.active_household_id as household_id,
           coalesce(np.time_zone, 'UTC') as tz
    from auth.users u
    join public.profiles pr on pr.id = u.id
    left join public.notification_preferences np on np.user_id = u.id
    where public.trial_ends_at(u.id) between now() and now() + interval '2 days'
      and not exists (select 1 from public.trial_reminder_runs r where r.user_id = u.id)
      and not exists (select 1 from public.subscriptions s where s.user_id = u.id and public.subscription_active(s))
      and not (st.household_sharing and public.covered_by_household(u.id))
    order by u.id
    limit budget
  loop
    insert into public.trial_reminder_runs (user_id, trial_ends_at) values (p.user_id, p.ends) on conflict do nothing;
    continue when not found;
    people := people + 1;
    msg_title := 'Your free trial ends ' || to_char(p.ends at time zone p.tz, 'Mon FMDD');
    msg_body := 'Subscribe to keep your meal plans, kitchen and lists going. Everything you''ve saved stays either way.';
    insert into public.notifications (user_id, household_id, kind, title, body, link, expires_at)
    values (p.user_id, p.household_id, 'trial_ending', msg_title, msg_body, '/profile', p.ends);
    pushes := pushes || jsonb_build_object('userId', p.user_id, 'title', msg_title, 'body', msg_body);
  end loop;

  return jsonb_build_object('people', people, 'push', pushes);
end;
$$;
revoke all on function public.trial_reminders(integer) from public, anon, authenticated;
grant execute on function public.trial_reminders(integer) to service_role;
