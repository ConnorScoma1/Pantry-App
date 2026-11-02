-- Subscriptions smoke test: off by default; when enforced, a trial, then
-- access only with a live subscription (yours or a household member's);
-- webhooks apply each event once and never let an older event win;
-- nobody can grant themselves a subscription. Rolls back.
begin;
insert into auth.users (id, email, created_at) values
  ('5a000000-0000-0000-0000-0000000000a1', 'ana@example.com', now() - interval '20 days'),
  ('5b000000-0000-0000-0000-0000000000b2', 'ben@example.com', now() - interval '30 days'),
  ('5c000000-0000-0000-0000-0000000000c3', 'cy@example.com', now() - interval '2 days');
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v text);
grant select on payload to authenticated;
grant all on results, vars to authenticated, anon, service_role;
create or replace function pg_temp.v(key text) returns text language sql as $$ select v from vars where k = key $$;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;
select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into vars select 'invite', token from public.create_household_invite();
select pg_temp.as_user('5b000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from payload)) is not null;
select public.accept_household_invite(pg_temp.v('invite')) is not null;
select pg_temp.as_user('5c000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from payload)) is not null;

-- Off by default: everyone has access, nothing changes for anyone.
select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
insert into results select 'switched off by default: full access', (public.my_access() ->> 'enforced')::boolean = false and (public.my_access() ->> 'access')::boolean;
insert into results select 'AI still works while off', public.reserve_ai_request('meal_plan', 5, null, null) is not null;

reset role;
update public.billing_settings set enforced = true;
insert into results select 'switching billing on gives everyone a fresh trial from that moment',
  (select enforced_since from public.billing_settings) is not null
  and public.user_has_access('5b000000-0000-0000-0000-0000000000b2');
-- Pretend billing went on 60 days ago, so the trials below are judged from sign-up.
update public.billing_settings set enforced_since = now() - interval '60 days';
set role authenticated;

select pg_temp.as_user('5c000000-0000-0000-0000-0000000000c3');
insert into results select 'a new account is in its 14-day trial', public.my_access() ->> 'reason' = 'trial' and (public.my_access() ->> 'access')::boolean;
select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
insert into results select 'after the trial, no subscription: no access', public.my_access() ->> 'reason' = 'expired' and not (public.my_access() ->> 'access')::boolean;
insert into results select 'and no AI requests (either way of asking)', public.reserve_ai_request('meal_plan', 5, null, null) is null and public.reserve_ai_request('meal_plan', 5) is null;
do $$ begin
  insert into public.subscriptions (user_id, source, external_id, status, expires_at) values (auth.uid(), 'grant', 'me', 'active', now() + interval '1 year');
  insert into results values ('nobody can grant themselves a subscription', false);
exception when insufficient_privilege then insert into results values ('nobody can grant themselves a subscription', true);
end $$;
do $$ begin
  perform public.apply_subscription_event('evt_x', 'stripe', auth.uid(), 'stripe', 'sub_x', 'active', 'p', now() + interval '1 year', true, null, now());
  insert into results values ('the webhook function is server-only', false);
exception when insufficient_privilege then insert into results values ('the webhook function is server-only', true);
end $$;

-- Stripe webhook (service role): Ana subscribes.
reset role;
set role service_role;
insert into results select 'a subscription event is applied', public.apply_subscription_event('evt_1', 'stripe', '5a000000-0000-0000-0000-0000000000a1', 'stripe', 'sub_123', 'active', 'price_year', now() + interval '1 year', true, 'cus_ABC', now() - interval '1 minute');
insert into results select 'the same event twice is applied once', not public.apply_subscription_event('evt_1', 'stripe', '5a000000-0000-0000-0000-0000000000a1', 'stripe', 'sub_123', 'canceled', 'price_year', now(), false, null, now());
insert into results select 'an older event never overwrites a newer one',
  public.apply_subscription_event('evt_0', 'stripe', '5a000000-0000-0000-0000-0000000000a1', 'stripe', 'sub_123', 'incomplete', 'price_year', null, false, null, now() - interval '1 hour')
  and (select status from public.subscriptions where external_id = 'sub_123') = 'active';
insert into results select 'unknown people are ignored', not public.apply_subscription_event('evt_2', 'stripe', 'ffffffff-0000-0000-0000-000000000000', 'stripe', 'sub_zzz', 'active', null, now() + interval '1 year', true, null, now());
insert into results select 'the server can check access (weekly drafts)', public.user_has_access('5a000000-0000-0000-0000-0000000000a1') and not public.user_has_access('ffffffff-0000-0000-0000-000000000000');
reset role;
set role authenticated;

select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
insert into results select 'subscribed: access, AI and renewal details', public.my_access() ->> 'reason' = 'subscribed' and (public.my_access() -> 'subscription' ->> 'willRenew')::boolean and public.reserve_ai_request('meal_plan', 5, null, null) is not null;
insert into results select 'people see their own subscription', (select count(*) from public.subscriptions) = 1;
select pg_temp.as_user('5b000000-0000-0000-0000-0000000000b2');
insert into results select 'household members are covered by it', public.my_access() ->> 'reason' = 'household' and (public.my_access() ->> 'access')::boolean;
insert into results select 'but can''t read it', (select count(*) from public.subscriptions) = 0;

-- It ends (App Store expiration via RevenueCat style, newer event).
reset role;
set role service_role;
select public.apply_subscription_event('evt_3', 'stripe', '5a000000-0000-0000-0000-0000000000a1', 'stripe', 'sub_123', 'canceled', 'price_year', now() - interval '1 second', false, null, now());
reset role;
set role authenticated;
select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
insert into results select 'when it ends, access ends', public.my_access() ->> 'reason' = 'expired';
select pg_temp.as_user('5b000000-0000-0000-0000-0000000000b2');
insert into results select 'for the household too', public.my_access() ->> 'reason' = 'expired';

-- Sharing follows the subscriber's active household only.
reset role;
update public.profiles set active_household_id = (select household_id from public.household_members where user_id = '5b000000-0000-0000-0000-0000000000b2' and role = 'owner' limit 1)
  where id = '5a000000-0000-0000-0000-0000000000a1';
set role service_role;
select public.apply_subscription_event('evt_5', 'stripe', '5a000000-0000-0000-0000-0000000000a1', 'stripe', 'sub_456', 'active', 'price_year', now() + interval '1 year', true, 'cus_ABC', now());
reset role;
set role authenticated;
select pg_temp.as_user('5b000000-0000-0000-0000-0000000000b2');
insert into results select 'a subscriber covers only their active household', public.my_access() ->> 'reason' = 'expired';
reset role;
update public.profiles set active_household_id = (select household_id from public.household_members where user_id = '5a000000-0000-0000-0000-0000000000a1' and role = 'owner' limit 1)
  where id = '5a000000-0000-0000-0000-0000000000a1';
set role authenticated;
select pg_temp.as_user('5b000000-0000-0000-0000-0000000000b2');
insert into results select 'and covers it again when it is active', public.my_access() ->> 'reason' = 'household';

-- Same-second events: the stronger status wins, whatever order they arrive in.
reset role;
set role service_role;
select public.apply_subscription_event('evt_6', 'stripe', '5c000000-0000-0000-0000-0000000000c3', 'stripe', 'sub_same', 'active', 'p', now() + interval '1 year', true, null, '2026-11-02 12:00:00+00');
select public.apply_subscription_event('evt_7', 'stripe', '5c000000-0000-0000-0000-0000000000c3', 'stripe', 'sub_same', 'incomplete', 'p', null, false, null, '2026-11-02 12:00:00+00');
insert into results select 'a late "created" in the same second can''t undo "active"', (select status from public.subscriptions where external_id = 'sub_same') = 'active';
-- Store transfer (Restore purchases on another account).
select public.apply_subscription_event('evt_8', 'revenuecat', '5c000000-0000-0000-0000-0000000000c3', 'app_store', 'rc_cy', 'active', 'kp_year', now() + interval '1 year', true, null, now());
insert into vars select 'moved', public.transfer_store_subscriptions('evt_9', array['5c000000-0000-0000-0000-0000000000c3']::uuid[], '5b000000-0000-0000-0000-0000000000b2')::text;
insert into results select 'a store purchase moves with a transfer',
  pg_temp.v('moved') = '1'
  and (select user_id from public.subscriptions where external_id = 'rc_cy') = '5b000000-0000-0000-0000-0000000000b2'
  and (select user_id from public.subscriptions where external_id = 'sub_same') = '5c000000-0000-0000-0000-0000000000c3';
insert into results select 'a transfer is applied once', public.transfer_store_subscriptions('evt_9', array['5b000000-0000-0000-0000-0000000000b2']::uuid[], '5c000000-0000-0000-0000-0000000000c3') = 0;
-- Tidy up for the checks below: that store subscription and Ana's website one end.
select public.apply_subscription_event('evt_10', 'revenuecat', '5b000000-0000-0000-0000-0000000000b2', 'app_store', 'rc_cy', 'expired', 'kp_year', now() - interval '1 second', false, null, now() + interval '1 second');
select public.apply_subscription_event('evt_11', 'stripe', '5a000000-0000-0000-0000-0000000000a1', 'stripe', 'sub_456', 'canceled', 'price_year', now() - interval '1 second', false, null, now() + interval '1 second');
reset role;

-- Deleting an account with a renewing website subscription is refused.
set role authenticated;
select pg_temp.as_user('5c000000-0000-0000-0000-0000000000c3');
do $$ begin
  perform public.delete_my_account('DELETE');
  insert into results values ('can''t delete while a website subscription renews', false);
exception when raise_exception then insert into results values ('can''t delete while a website subscription renews', true);
end $$;
do $$ begin
  perform public.reserve_ai_request('meal_plan', 5);
  insert into results values ('the old reservation still works for people with access', true);
exception when others then insert into results values ('the old reservation still works for people with access', false);
end $$;
select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
reset role;

-- Household sharing can be switched off.
reset role;
set role service_role;
select public.apply_subscription_event('evt_4', 'revenuecat', '5a000000-0000-0000-0000-0000000000a1', 'app_store', 'rc_1', 'active', 'kp_year', now() + interval '1 year', true, null, now());
reset role;
update public.billing_settings set household_sharing = false;
set role authenticated;
select pg_temp.as_user('5b000000-0000-0000-0000-0000000000b2');
insert into results select 'household sharing can be switched off', public.my_access() ->> 'reason' = 'expired';
select pg_temp.as_user('5a000000-0000-0000-0000-0000000000a1');
insert into results select 'an App Store subscription counts', public.my_access() ->> 'reason' = 'subscribed' and public.my_access() -> 'subscription' ->> 'source' = 'app_store';
reset role;

set role anon;
do $$ begin
  perform public.my_access();
  insert into results values ('anon can''t ask', false);
exception when insufficient_privilege then insert into results values ('anon can''t ask', true);
end $$;
reset role;

select name, ok from results order by name;
rollback;
