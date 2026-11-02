-- =============================================================================
-- Subscriptions: a free trial, then $24.99 a year.
--
-- Review before applying. Adds three tables and four functions; it changes
-- one existing function (reserve_ai_request) and deletes nothing.
--
-- SWITCHED OFF until you turn it on: billing_settings.enforced is false, so
-- everyone keeps full access. When you're ready to charge:
--   update public.billing_settings set enforced = true;
--
--   * billing_settings — one row: enforced (on/off), trial_days (default
--     14), household_sharing (one subscription covers everyone in the
--     subscriber's households; default on).
--   * subscriptions — one row per store subscription, written only by the
--     server from the store's own webhooks: Stripe (website) and RevenueCat
--     (App Store / Google Play). Access lasts until expires_at. People can
--     read their own rows; nobody can write them from the app.
--   * billing_events — provider event ids already handled (webhooks are
--     retried; each is applied once). Private.
--   * my_access() — what the app shows: trial, subscribed, covered by the
--     household, or expired; with dates. Never fails closed for reading.
--   * user_has_access(uid) — the same rule for the server (weekly drafts).
--   * apply_subscription_event(…) — the webhooks' single way in (service
--     role only): upserts a subscription and records the event id.
--   * reserve_ai_request(…4 args) now also refuses AI requests from people
--     without access when billing is enforced (AI costs money; everything
--     they've saved stays readable, and they can still export or delete).
-- =============================================================================

create table public.billing_settings (
  id boolean primary key default true check (id),
  enforced boolean not null default false,
  trial_days smallint not null default 14 check (trial_days between 0 and 90),
  household_sharing boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (true) on conflict do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from anon, authenticated;
grant select, update on public.billing_settings to service_role;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('stripe', 'app_store', 'play_store', 'revenuecat', 'grant')),
  -- Stripe subscription id, or RevenueCat's original transaction / product key.
  external_id text not null check (char_length(external_id) between 1 and 200),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired', 'incomplete')),
  product_id text check (char_length(product_id) <= 200),
  expires_at timestamptz,
  will_renew boolean not null default false,
  stripe_customer_id text check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,100}$'),
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);
create index subscriptions_user_idx on public.subscriptions (user_id, expires_at desc);
create trigger set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
alter table public.subscriptions enable row level security;
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.subscriptions from anon, authenticated;
grant select (id, source, status, product_id, expires_at, will_renew, stripe_customer_id, created_at, updated_at) on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

create table public.billing_events (
  id text primary key check (char_length(id) between 1 and 200),
  source text not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
grant select, insert, delete on public.billing_events to service_role;

-- A subscription gives access while it hasn't expired (Stripe "incomplete" never does).
create or replace function public.subscription_active(s public.subscriptions)
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.status <> 'incomplete' and s.expires_at is not null and s.expires_at > now();
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
  joined timestamptz;
begin
  select * into st from public.billing_settings where id;
  if st is null or not st.enforced then
    return true;
  end if;
  if target is null then
    return false;
  end if;
  select u.created_at into joined from auth.users u where u.id = target;
  if joined is not null and now() < joined + make_interval(days => st.trial_days) then
    return true;
  end if;
  if exists (select 1 from public.subscriptions s where s.user_id = target and public.subscription_active(s)) then
    return true;
  end if;
  return st.household_sharing and exists (
    select 1
    from public.household_members me
    join public.household_members other on other.household_id = me.household_id
    join public.subscriptions s on s.user_id = other.user_id
    where me.user_id = target and public.subscription_active(s)
  );
end;
$$;

-- What the app shows. Readable by the signed-in person only.
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
  joined timestamptz;
  trial_end timestamptz;
  own public.subscriptions;
  shared boolean := false;
  reason text;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  select * into st from public.billing_settings where id;
  select u.created_at into joined from auth.users u where u.id = uid;
  trial_end := coalesce(joined, now()) + make_interval(days => coalesce(st.trial_days, 14));
  select * into own from public.subscriptions s
    where s.user_id = uid and s.status <> 'incomplete'
    order by public.subscription_active(s) desc, s.expires_at desc nulls last
    limit 1;
  if coalesce(st.household_sharing, true) then
    shared := exists (
      select 1
      from public.household_members me
      join public.household_members other on other.household_id = me.household_id and other.user_id <> uid
      join public.subscriptions s on s.user_id = other.user_id
      where me.user_id = uid and public.subscription_active(s)
    );
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

-- The webhooks' single way in. Returns false for an event already applied.
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
    -- Webhooks can arrive out of order: an older event never overwrites a newer one.
    status = case when excluded.last_event_at >= s.last_event_at then excluded.status else s.status end,
    product_id = case when excluded.last_event_at >= s.last_event_at then coalesce(excluded.product_id, s.product_id) else s.product_id end,
    expires_at = case when excluded.last_event_at >= s.last_event_at then excluded.expires_at else s.expires_at end,
    will_renew = case when excluded.last_event_at >= s.last_event_at then excluded.will_renew else s.will_renew end,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    user_id = case when excluded.last_event_at >= s.last_event_at then excluded.user_id else s.user_id end,
    last_event_at = greatest(excluded.last_event_at, s.last_event_at);
  return true;
end;
$$;

-- AI costs money: no AI requests without access once billing is enforced.
create or replace function public.reserve_ai_request(feature_name text, daily_limit integer, monthly_limit integer, monthly_budget_microusd bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  month_start timestamptz := date_trunc('month', now());
  spent bigint;
  used integer;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if not public.user_has_access(uid) then
    return null;
  end if;
  -- The app's spending cap for this month.
  if monthly_budget_microusd is not null then
    select coalesce(sum(cost_microusd), 0) into spent from public.ai_spend_months where month = month_start::date;
    if spent >= greatest(monthly_budget_microusd, 0) then
      return null;
    end if;
  end if;
  -- This person's AI requests this month, all features together.
  if monthly_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended('ai_usage_month:' || uid::text, 0));
    select count(*)::integer into used from public.ai_usage
    where user_id = uid and created_at >= month_start and outcome in ('ok', 'fallback', 'reserved');
    if used >= greatest(monthly_limit, 0) then
      return null;
    end if;
  end if;
  -- Then the per-feature daily limits, exactly as before.
  return public.reserve_ai_request(feature_name, daily_limit);
end;
$$;

revoke all on function public.subscription_active(public.subscriptions) from public, anon;
revoke all on function public.user_has_access(uuid) from public, anon, authenticated;
revoke all on function public.my_access() from public, anon;
revoke all on function public.apply_subscription_event(text, text, uuid, text, text, text, text, timestamptz, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_ai_request(text, integer, integer, bigint) from public, anon;
grant execute on function public.subscription_active(public.subscriptions) to authenticated, service_role;
grant execute on function public.user_has_access(uuid) to service_role;
grant execute on function public.my_access() to authenticated;
grant execute on function public.apply_subscription_event(text, text, uuid, text, text, text, text, timestamptz, boolean, text, timestamptz) to service_role;
grant execute on function public.reserve_ai_request(text, integer, integer, bigint) to authenticated;
