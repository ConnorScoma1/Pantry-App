-- =============================================================================
-- Cooking mode (spec 01 §11–12, milestone 16) and security fixes.
--
-- Review before applying. Widens two check constraints and replaces a few
-- functions; nothing is deleted.
--   * ai_usage.feature also allows 'cooking_help', so the cooking
--     assistant's questions are counted against their own daily limit
--     (AI_DAILY_HELP_LIMIT, default 30 per household) for cost control.
--   * reserve_ai_request / finish_ai_request: a request takes its slot in
--     the daily limit BEFORE Claude is called (under a per-household lock),
--     so many requests sent at once can't all slip under the limit.
--   * register_push_token no longer lets one account take over a phone
--     address that another account registered recently.
--   * invite_emails_today: a persisted cap on invite emails per person.
-- Finishing a recipe in cooking mode logs the existing "cooked"
-- recommendation event; no new tables are needed.
-- =============================================================================

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check check (feature in ('meal_plan', 'cooking_help'));

-- 'reserved': a slot taken before the model is called; 'unused': a reserved
-- slot given back because the model wasn't needed after all.
alter table public.ai_usage drop constraint if exists ai_usage_outcome_check;
alter table public.ai_usage
  add constraint ai_usage_outcome_check check (outcome in ('ok', 'fallback', 'cached', 'limited', 'reserved', 'unused'));

-- Reserved slots count until they're finished (a crashed request keeps its
-- slot for 24 hours: fail closed).
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
    and outcome in ('ok', 'fallback', 'reserved')
    and created_at > now() - interval '24 hours';
$$;
revoke all on function public.ai_requests_last_day(text) from public;
grant execute on function public.ai_requests_last_day(text) to authenticated;

-- Take one slot of the household's daily allowance for a feature, or return
-- null when it's used up. Counting and inserting happen under a lock held for
-- the transaction, so parallel requests are serialised.
create or replace function public.reserve_ai_request(feature_name text, daily_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  used integer;
  cap integer := least(greatest(coalesce(daily_limit, 0), 0), 1000);
  rid uuid;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if feature_name not in ('meal_plan', 'cooking_help') then
    raise exception 'Unknown feature' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || hh::text || ':' || feature_name, 0));
  select count(*)::integer into used
  from public.ai_usage
  where household_id = hh and feature = feature_name
    and outcome in ('ok', 'fallback', 'reserved')
    and created_at > now() - interval '24 hours';
  if used >= cap then
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

-- Record how a reserved request went. Only the person who reserved it, only
-- once. 'cached' and 'unused' give the slot back.
create or replace function public.finish_ai_request(request_id uuid, final_outcome text, model_name text, tokens_in integer, tokens_out integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if final_outcome not in ('ok', 'fallback', 'cached', 'unused') then
    raise exception 'Unknown outcome' using errcode = 'check_violation';
  end if;
  update public.ai_usage
  set outcome = final_outcome,
      model = left(model_name, 80),
      input_tokens = least(greatest(coalesce(tokens_in, 0), 0), 10000000),
      output_tokens = least(greatest(coalesce(tokens_out, 0), 0), 10000000)
  where id = request_id and user_id = (select auth.uid()) and outcome = 'reserved';
end;
$$;
revoke all on function public.finish_ai_request(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.finish_ai_request(uuid, text, text, integer, integer) to authenticated;

-- A phone's address moves to a new account only when its current owner is
-- the caller, or nobody has used it for 30 days. (Signing out removes it, so
-- handing a phone to someone else still works.) Returns whether it's yours.
drop function if exists public.register_push_token(text, text);
create or replace function public.register_push_token(push_token text, device_platform text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  owner uuid;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if push_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' or device_platform not in ('ios', 'android') then
    raise exception 'That notification address is not valid' using errcode = 'check_violation';
  end if;
  insert into public.push_tokens as t (user_id, token, platform)
  values (uid, push_token, device_platform)
  on conflict (token) do update
    set user_id = uid, platform = excluded.platform, last_seen_at = now()
    where t.user_id = uid or t.last_seen_at < now() - interval '30 days';
  select user_id into owner from public.push_tokens where token = push_token;
  return owner = uid;
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Invites with an email address that this person created in the last day
-- (an upper bound on the invite emails the server sent for them).
create or replace function public.invite_emails_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.household_invites
  where created_by = (select auth.uid())
    and email is not null
    and created_at > now() - interval '1 day';
$$;
revoke all on function public.invite_emails_today() from public, anon;
grant execute on function public.invite_emails_today() to authenticated;
