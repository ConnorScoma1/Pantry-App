-- Use-soon reminders smoke test: server-only, daytime only, once a day per
-- person, only items due today or tomorrow, each person's own choices.
-- Rolls back. Every result row should end in "t".
begin;
insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('e2000000-0000-0000-0000-0000000000b2', 'ben@example.com'),
  ('e3000000-0000-0000-0000-0000000000c3', 'cy@example.com');
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v text);
grant all on results, vars to authenticated, service_role;
-- A time zone where it's midday now, and one where it's the middle of the night.
insert into vars select 'day', name from pg_timezone_names where extract(hour from now() at time zone name) = 12 and name like '%/%' order by name limit 1;
insert into vars select 'night', name from pg_timezone_names where extract(hour from now() at time zone name) = 3 and name like '%/%' order by name limit 1;
insert into vars select 'today', ((now() at time zone (select v from vars where k = 'day'))::date)::text;
create or replace function pg_temp.v(key text) returns text language sql as $$ select v from vars where k = key $$;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;
create or replace function pg_temp.as_server(on_ boolean) returns void language sql as $$
  select set_config('request.jwt.claim.role', case when on_ then 'service_role' else '' end, true);
$$;

set role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
insert into vars select 'invite', token from public.create_household_invite();
insert into public.notification_preferences (user_id, time_zone, use_soon_push) values ('e1000000-0000-0000-0000-0000000000a1', pg_temp.v('day'), true);
insert into public.pantry_items (name, category, storage_location, use_by, quantity, unit) values
  ('Chicken thighs', 'protein', 'fridge', pg_temp.v('today')::date, 2, 'lb'),
  ('Spinach', 'produce', 'fridge', pg_temp.v('today')::date + 1, 5, 'oz'),
  ('Yogurt', 'dairy', 'fridge', pg_temp.v('today')::date + 1, null, null),
  ('Old milk', 'dairy', 'fridge', pg_temp.v('today')::date - 1, 1, 'gal'),
  ('Rice', 'rice', 'pantry', pg_temp.v('today')::date + 30, 2, 'lb'),
  ('Butter', 'dairy', 'fridge', pg_temp.v('today')::date, 1, 'lb'),
  ('Cream', 'dairy', 'fridge', pg_temp.v('today')::date, 0, 'cup');
update public.pantry_items set is_staple = true where name = 'Butter';

-- Ben: same household, wants nothing in the app or on the phone.
select pg_temp.as_user('e2000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":1,"children":0,"cookingFor":1,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
select public.accept_household_invite(pg_temp.v('invite')) is not null;
insert into public.notification_preferences (user_id, time_zone, use_soon_in_app, use_soon_push) values ('e2000000-0000-0000-0000-0000000000b2', pg_temp.v('day'), false, false);

-- Cy: own household, asleep (their time zone is in the middle of the night).
select pg_temp.as_user('e3000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":1,"children":0,"cookingFor":1,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
insert into public.notification_preferences (user_id, time_zone) values ('e3000000-0000-0000-0000-0000000000c3', pg_temp.v('night'));
insert into public.pantry_items (name, category, storage_location, use_by) values ('Salmon', 'protein', 'fridge', (now() at time zone pg_temp.v('night'))::date);

do $$ begin
  update public.notification_preferences set time_zone = 'Mars/Olympus' where user_id = 'e3000000-0000-0000-0000-0000000000c3';
  insert into results values ('a made-up time zone is refused', false);
exception when check_violation then insert into results values ('a made-up time zone is refused', true);
end $$;
do $$ begin
  perform public.use_soon_reminders(10);
  insert into results values ('people cannot run the reminder job', false);
exception when insufficient_privilege then insert into results values ('people cannot run the reminder job', true);
end $$;
do $$ begin
  perform 1 from public.use_soon_runs;
  insert into results values ('the job''s bookkeeping is private', false);
exception when insufficient_privilege then insert into results values ('the job''s bookkeeping is private', true);
end $$;

reset role;
set role service_role;
select pg_temp.as_server(true);
insert into vars select 'run1', public.use_soon_reminders(100)::text;
insert into vars select 'run2', public.use_soon_reminders(100)::text;
select pg_temp.as_server(false);
reset role;

insert into results select 'one person reminded in the daytime', (pg_temp.v('run1')::jsonb ->> 'people')::int = 1;
insert into results select 'only items due today or tomorrow, not staples, used-up or past-date ones',
  (select title = 'Use soon: Chicken thighs and 2 more' and body = 'Chicken thighs (by ' || to_char(pg_temp.v('today')::date, 'Mon FMDD') || '), Spinach (by ' || to_char(pg_temp.v('today')::date + 1, 'Mon FMDD') || '), Yogurt (by ' || to_char(pg_temp.v('today')::date + 1, 'Mon FMDD') || '). Plan a meal around them before those dates.' and link = '/kitchen' and expires_at > now() and expires_at <= now() + interval '1 day'
   from public.notifications where user_id = 'e1000000-0000-0000-0000-0000000000a1' and kind = 'use_soon');
insert into results select 'phone notification only for the person who turned it on',
  (pg_temp.v('run1')::jsonb -> 'push') = jsonb_build_array(jsonb_build_object('userId', 'e1000000-0000-0000-0000-0000000000a1', 'title', 'Use soon: Chicken thighs and 2 more',
    'body', (select body from public.notifications where user_id = 'e1000000-0000-0000-0000-0000000000a1' and kind = 'use_soon')));
insert into results select 'someone who turned reminders off hears nothing', not exists (select 1 from public.notifications where user_id = 'e2000000-0000-0000-0000-0000000000b2');
insert into results select 'nobody is reminded in the middle of their night', not exists (select 1 from public.notifications where user_id = 'e3000000-0000-0000-0000-0000000000c3');
insert into results select 'running again the same day sends nothing new',
  (pg_temp.v('run2')::jsonb ->> 'people')::int = 0 and (select count(*) from public.notifications where kind = 'use_soon') = 1;

set role authenticated;
select pg_temp.as_user('e2000000-0000-0000-0000-0000000000b2');
insert into results select 'notices stay private to each person', not exists (select 1 from public.notifications where kind = 'use_soon');
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000a1');
insert into results select 'a person sees their own reminder', (select count(*) from public.notifications where kind = 'use_soon') = 1;
-- Phones: an 11th registration drops the longest-unused one.
select public.register_push_token('ExponentPushToken[phone' || lpad(g::text, 4, '0') || ']', 'ios') from generate_series(1, 11) g;
reset role;
insert into results select 'at most 10 phones per person', (select count(*) from public.push_tokens where user_id = 'e1000000-0000-0000-0000-0000000000a1') = 10;

-- A notice past the end of its day can't be seen any more.
update public.notifications set expires_at = now() - interval '1 minute' where kind = 'use_soon';
set role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000a1');
insert into results select 'yesterday''s reminder is gone', not exists (select 1 from public.notifications where kind = 'use_soon');
reset role;
update public.notifications set expires_at = now() + interval '1 hour' where kind = 'use_soon';

-- Leaving a household takes your notices about it with you; a stale active
-- household is never used.
delete from public.household_members where user_id = 'e1000000-0000-0000-0000-0000000000a1';
insert into results select 'leaving a household removes its notices', not exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-0000000000a1');
delete from public.use_soon_runs;
update public.notification_preferences set use_soon_in_app = true where user_id = 'e2000000-0000-0000-0000-0000000000b2';
-- Ana's profile still points at the household she left.
set role service_role;
select pg_temp.as_server(true);
insert into vars select 'run3', public.use_soon_reminders(100)::text;
select pg_temp.as_server(false);
reset role;
insert into results select 'only current members are reminded about a household',
  not exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-0000000000a1')
  and exists (select 1 from public.notifications where user_id = 'e2000000-0000-0000-0000-0000000000b2' and kind = 'use_soon');

select name, ok from results;
rollback;
