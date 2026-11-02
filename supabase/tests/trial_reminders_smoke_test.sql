-- Trial reminders smoke test: nothing while billing is off; once on, people
-- in the last 2 days of their trial get one reminder, subscribers don't.
-- Rolls back.
begin;
insert into auth.users (id, email, created_at) values
  ('7a000000-0000-0000-0000-0000000000a1', 'ana@example.com', now() - interval '13 days'),
  ('7b000000-0000-0000-0000-0000000000b2', 'ben@example.com', now() - interval '13 days'),
  ('7c000000-0000-0000-0000-0000000000c3', 'cy@example.com', now() - interval '3 days');
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
create temp table results (name text, ok boolean);
create temp table runs (n integer, doc jsonb);
grant select on payload to authenticated;
grant all on results, runs to authenticated, service_role;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;
set role authenticated;
select pg_temp.as_user('7a000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from payload)) is not null;
select pg_temp.as_user('7b000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from payload)) is not null;
select pg_temp.as_user('7c000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from payload)) is not null;
reset role;

set role service_role;
insert into runs select 0, public.trial_reminders(100);
insert into results select 'nothing while billing is off', ((select doc from runs where n = 0) ->> 'people')::int = 0;
reset role;
update public.billing_settings set enforced = true;
update public.billing_settings set enforced_since = now() - interval '60 days';
set role service_role;
-- Ben subscribes.
select public.apply_subscription_event('evt_t1', 'stripe', '7b000000-0000-0000-0000-0000000000b2', 'stripe', 'sub_t1', 'active', 'p', now() + interval '1 year', true, null, now());
insert into runs select 1, public.trial_reminders(100);
insert into runs select 2, public.trial_reminders(100);
reset role;
insert into results select 'the person whose trial ends soon is reminded', (select doc from runs where n = 1) -> 'push' @> '[{"userId":"7a000000-0000-0000-0000-0000000000a1"}]';
insert into results select 'subscribers and people early in their trial aren''t', ((select doc from runs where n = 1) ->> 'people')::int = 1;
insert into results select 'once only', ((select doc from runs where n = 2) ->> 'people')::int = 0;
insert into results select 'a notice in the app that ends with the trial',
  exists (select 1 from public.notifications where user_id = '7a000000-0000-0000-0000-0000000000a1' and kind = 'trial_ending' and expires_at > now() and link = '/profile');
set role authenticated;
select pg_temp.as_user('7a000000-0000-0000-0000-0000000000a1');
insert into results select 'people can see their own reminder', (select count(*) from public.notifications where kind = 'trial_ending') = 1;
do $$ begin
  perform public.trial_reminders(10);
  insert into results values ('only the server can run it', false);
exception when insufficient_privilege then insert into results values ('only the server can run it', true);
end $$;
reset role;
select name, ok from results order by name;
rollback;
