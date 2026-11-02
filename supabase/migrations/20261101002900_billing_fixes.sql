-- =============================================================================
-- Subscription fixes from the billing review (apply after …2800).
--
-- Review before applying. Changes functions and adds one column; deletes
-- nothing. Billing stays switched off until you turn it on.
--
--   * A fair trial when billing is switched on: the trial now starts at the
--     later of sign-up and the moment billing was first enforced
--     (billing_settings.enforced_since, set automatically). Without this,
--     everyone who signed up more than 14 days earlier would be locked out
--     the moment billing went on.
--   * Household sharing covers the subscriber's ACTIVE household only, so
--     one subscription can't cover many households.
--   * Webhooks with the same timestamp: the stronger status wins (active
--     beats incomplete), so a late "created" event can't undo "active".
--   * Store transfers: when the App Store / Google Play purchase moves to
--     another Kitchen Pantry account ("Restore purchases"), the subscription
--     moves with it (transfer_store_subscriptions, service role only).
--   * delete_my_account refuses while a website subscription would still
--     renew (cancel it first; the website does this for you).
--   * The older reserve_ai_request(feature, limit) checks the subscription too.
-- =============================================================================

alter table public.billing_settings add column if not exists enforced_since timestamptz;

create or replace function public.billing_settings_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.enforced and new.enforced_since is null then
    new.enforced_since := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists billing_settings_stamp on public.billing_settings;
create trigger billing_settings_stamp before update on public.billing_settings
  for each row execute function public.billing_settings_stamp();
-- Already on before this migration: count from now.
update public.billing_settings set enforced_since = now() where enforced and enforced_since is null;

-- When this person's free trial ends.
create or replace function public.trial_ends_at(target uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(u.created_at, coalesce(st.enforced_since, u.created_at)) + make_interval(days => st.trial_days)
  from auth.users u, public.billing_settings st
  where u.id = target and st.id;
$$;

-- Someone else's live subscription covers this person: they share the subscriber's active household.
create or replace function public.covered_by_household(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members me
    join public.profiles sp on sp.active_household_id = me.household_id and sp.id <> target
    join public.household_members sm on sm.household_id = me.household_id and sm.user_id = sp.id
    join public.subscriptions s on s.user_id = sp.id
    where me.user_id = target and public.subscription_active(s)
  );
$$;

create or replace function public.user_has_access(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  st public.billing_settings;
begin
  select * into st from public.billing_settings where id;
  if st is null or not st.enforced then
    return true;
  end if;
  if target is null then
    return false;
  end if;
  if now() < coalesce(public.trial_ends_at(target), '-infinity'::timestamptz) then
    return true;
  end if;
  if exists (select 1 from public.subscriptions s where s.user_id = target and public.subscription_active(s)) then
    return true;
  end if;
  return st.household_sharing and public.covered_by_household(target);
end;
$$;

create or replace function public.my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  st public.billing_settings;
  trial_end timestamptz;
  own public.subscriptions;
  shared boolean := false;
  reason text;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  select * into st from public.billing_settings where id;
  trial_end := coalesce(public.trial_ends_at(uid), now() + make_interval(days => coalesce(st.trial_days, 14)));
  select * into own from public.subscriptions s
    where s.user_id = uid and s.status <> 'incomplete'
    order by public.subscription_active(s) desc, s.expires_at desc nulls last
    limit 1;
  if coalesce(st.household_sharing, true) then
    shared := public.covered_by_household(uid);
  end if;
  reason := case
    when own.id is not null and public.subscription_active(own) then 'subscribed'
    when shared then 'household'
    when now() < trial_end then 'trial'
    else 'expired'
  end;
  return jsonb_build_object(
    'enforced', coalesce(st.enforced, false),
    'access', not coalesce(st.enforced, false) or reason <> 'expired',
    'reason', reason,
    'trialEndsAt', trial_end,
    'trialDays', coalesce(st.trial_days, 14),
    'subscription', case when own.id is null then null else jsonb_build_object(
      'source', own.source, 'status', own.status, 'expiresAt', own.expires_at, 'willRenew', own.will_renew,
      'active', public.subscription_active(own)
    ) end
  );
end;
$$;

-- Strength of a status, to break ties between events with the same timestamp.
create or replace function public.subscription_status_rank(status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case status when 'active' then 6 when 'trialing' then 5 when 'past_due' then 4 when 'canceled' then 3 when 'expired' then 2 else 1 end;
$$;

create or replace function public.subscription_event_newer(new_at timestamptz, new_status text, old_at timestamptz, old_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select new_at > old_at or (new_at = old_at and public.subscription_status_rank(new_status) >= public.subscription_status_rank(old_status));
$$;

create or replace function public.apply_subscription_event(
  event_id text,
  event_source text,
  target_user uuid,
  sub_source text,
  sub_external_id text,
  sub_status text,
  sub_product_id text,
  sub_expires_at timestamptz,
  sub_will_renew boolean,
  sub_customer_id text,
  event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_events (id, source) values (left(event_id, 200), left(event_source, 40)) on conflict (id) do nothing;
  if not found then
    return false;
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    return false;
  end if;
  insert into public.subscriptions as s (user_id, source, external_id, status, product_id, expires_at, will_renew, stripe_customer_id, last_event_at)
  values (target_user, sub_source, sub_external_id, sub_status, sub_product_id, sub_expires_at, coalesce(sub_will_renew, false), sub_customer_id, coalesce(event_at, now()))
  on conflict (source, external_id) do update set
    -- Newer wins; at the same instant the stronger status wins. An older event never overwrites a newer one.
    status = case when public.subscription_event_newer(excluded.last_event_at, excluded.status, s.last_event_at, s.status) then excluded.status else s.status end,
    product_id = case when public.subscription_event_newer(excluded.last_event_at, excluded.status, s.last_event_at, s.status) then coalesce(excluded.product_id, s.product_id) else s.product_id end,
    expires_at = case when public.subscription_event_newer(excluded.last_event_at, excluded.status, s.last_event_at, s.status) then excluded.expires_at else s.expires_at end,
    will_renew = case when public.subscription_event_newer(excluded.last_event_at, excluded.status, s.last_event_at, s.status) then excluded.will_renew else s.will_renew end,
    user_id = case when public.subscription_event_newer(excluded.last_event_at, excluded.status, s.last_event_at, s.status) then excluded.user_id else s.user_id end,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    last_event_at = greatest(excluded.last_event_at, s.last_event_at);
  return true;
end;
$$;


-- A store purchase moved to another account (RevenueCat TRANSFER): move its rows.
create or replace function public.transfer_store_subscriptions(event_id text, from_users uuid[], to_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  insert into public.billing_events (id, source) values (left(event_id, 200), 'revenuecat') on conflict (id) do nothing;
  if not found then
    return 0;
  end if;
  if not exists (select 1 from auth.users where id = to_user) then
    return 0;
  end if;
  update public.subscriptions
  set user_id = to_user, last_event_at = greatest(last_event_at, now())
  where user_id = any (from_users) and user_id <> to_user and source in ('app_store', 'play_store', 'revenuecat');
  get diagnostics moved = row_count;
  return moved;
end;
$$;

-- The older two-argument reservation checks the subscription too (same body as …2000, plus the check).
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
  if feature_name not in ('meal_plan', 'cooking_help', 'recipe_draft', 'shopping_advice', 'receipt_import') then
    raise exception 'Unknown feature' using errcode = 'check_violation';
  end if;
  if not public.user_has_access(uid) then
    return null;
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

-- Deleting an account while a website subscription would renew would leave
-- Stripe charging an account that no longer exists: refuse (the website
-- turns renewal off first, then deletes).

create or replace function public.has_renewing_web_subscription(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = target and s.source = 'stripe' and (s.will_renew or s.status = 'past_due') and public.subscription_active(s)
  );
$$;

-- Wrap delete_my_account: the original (…2600) becomes delete_my_account_now, called after the check.
alter function public.delete_my_account(text) rename to delete_my_account_now;
revoke all on function public.delete_my_account_now(text) from public, anon, authenticated;

create or replace function public.delete_my_account(confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and public.has_renewing_web_subscription((select auth.uid())) then
    raise exception 'Cancel your website subscription first (Profile on the website → Subscription), then delete your account.'
      using errcode = 'P0001', hint = 'cancel_subscription_first';
  end if;
  perform public.delete_my_account_now(confirm);
end;
$$;

revoke all on function public.trial_ends_at(uuid) from public, anon, authenticated;
revoke all on function public.covered_by_household(uuid) from public, anon, authenticated;
revoke all on function public.subscription_status_rank(text) from public, anon;
revoke all on function public.subscription_event_newer(timestamptz, text, timestamptz, text) from public, anon;
revoke all on function public.transfer_store_subscriptions(text, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.has_renewing_web_subscription(uuid) from public, anon, authenticated;
revoke all on function public.delete_my_account(text) from public, anon;
revoke all on function public.reserve_ai_request(text, integer) from public, anon;
revoke all on function public.billing_settings_stamp() from public, anon, authenticated;
grant execute on function public.trial_ends_at(uuid) to service_role;
grant execute on function public.covered_by_household(uuid) to service_role;
grant execute on function public.subscription_status_rank(text) to authenticated, service_role;
grant execute on function public.subscription_event_newer(timestamptz, text, timestamptz, text) to service_role;
grant execute on function public.transfer_store_subscriptions(text, uuid[], uuid) to service_role;
grant execute on function public.has_renewing_web_subscription(uuid) to service_role;
grant execute on function public.delete_my_account(text) to authenticated;
grant execute on function public.reserve_ai_request(text, integer) to authenticated;
