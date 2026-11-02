-- AI plan cache smoke test: answers are saved per household, private to it,
-- well-formed only, expire, and each household keeps at most 20.
-- Rolls back. Every result row should end in "t".
begin;
insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('f2000000-0000-0000-0000-0000000000b2', 'ben@example.com'),
  ('f3000000-0000-0000-0000-0000000000c3', 'cy@example.com');
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v text);
grant all on results, vars to authenticated, service_role;
create or replace function pg_temp.v(key text) returns text language sql as $$ select v from vars where k = key $$;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body,
'{"meals":[{"date":"2026-11-09","recipeId":"r-1","why":"Quick Monday dinner."}],"summary":"A simple week."}'::jsonb as answer,
repeat('a', 64) as k1,
repeat('b', 64) as k2;
grant select on payload to authenticated, service_role;

set role authenticated;
-- Ana and Ben share a household; Cy has his own.
select pg_temp.as_user('f1000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into vars select 'invite', token from public.create_household_invite();
select pg_temp.as_user('f3000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from payload)) is not null;
select pg_temp.as_user('f2000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from payload)) is not null;
select public.accept_household_invite(pg_temp.v('invite')) is not null;

select pg_temp.as_user('f1000000-0000-0000-0000-0000000000a1');
insert into results select 'nothing saved yet', public.get_ai_plan((select k1 from payload)) is null;
insert into results select 'an answer can be saved', public.put_ai_plan((select k1 from payload), (select answer from payload));
insert into results select 'and read back', public.get_ai_plan((select k1 from payload)) = (select answer from payload);
select public.put_ai_plan((select k1 from payload), (select answer from payload) || '{"summary":"Updated."}'::jsonb, 24);
insert into results select 'saving again refreshes it', public.get_ai_plan((select k1 from payload)) ->> 'summary' = 'Updated.';
insert into results select 'another key misses', public.get_ai_plan((select k2 from payload)) is null;

select pg_temp.as_user('f2000000-0000-0000-0000-0000000000b2');
insert into results select 'household members share answers', public.get_ai_plan((select k1 from payload)) ->> 'summary' = 'Updated.';

select pg_temp.as_user('f3000000-0000-0000-0000-0000000000c3');
insert into results select 'other households can''t read them', public.get_ai_plan((select k1 from payload)) is null;

do $$ begin
  perform * from public.ai_plan_cache;
  insert into results values ('the table isn''t readable directly', false);
exception when insufficient_privilege then insert into results values ('the table isn''t readable directly', true);
end $$;
do $$ begin
  insert into public.ai_plan_cache (household_id, cache_key, answer, expires_at)
  values (public.current_household_id(), repeat('c', 64), (select answer from payload), now() + interval '1 hour');
  insert into results values ('the table isn''t writable directly', false);
exception when insufficient_privilege then insert into results values ('the table isn''t writable directly', true);
end $$;
do $$ begin
  perform public.put_ai_plan('not-a-hash', (select answer from payload));
  insert into results values ('keys must be SHA-256 hex', false);
exception when check_violation then insert into results values ('keys must be SHA-256 hex', true);
end $$;
do $$ begin
  perform public.put_ai_plan((select k2 from payload), '{"meals":[{"date":"2026-11-09","recipeId":"r-1","why":"x","price":"$4"}],"summary":"x"}');
  insert into results values ('extra fields are refused', false);
exception when check_violation then insert into results values ('extra fields are refused', true);
end $$;
do $$ begin
  perform public.put_ai_plan((select k2 from payload), '{"meals":[],"summary":"x"}');
  insert into results values ('empty answers are refused', false);
exception when check_violation then insert into results values ('empty answers are refused', true);
end $$;
do $$ begin
  perform public.put_ai_plan((select k2 from payload), (select answer from payload), 500);
  insert into results values ('kept at most a week', false);
exception when check_violation then insert into results values ('kept at most a week', true);
end $$;

-- Signed out: nothing.
select set_config('request.jwt.claim.sub', '', true);
insert into results select 'signed out reads nothing', public.get_ai_plan((select k1 from payload)) is null;
do $$ begin
  perform public.put_ai_plan((select k2 from payload), (select answer from payload));
  insert into results values ('signed out saves nothing', false);
exception when insufficient_privilege then insert into results values ('signed out saves nothing', true);
end $$;

-- Service role (the weekly job) writes directly; expired answers stop being served and
-- each household keeps its newest 20.
reset role;
insert into vars select 'hh', household_id::text from public.household_members where user_id = 'f1000000-0000-0000-0000-0000000000a1';
update public.ai_plan_cache set created_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
  where household_id = pg_temp.v('hh')::uuid;
set role service_role;
insert into public.ai_plan_cache (household_id, cache_key, answer, created_at, expires_at)
select pg_temp.v('hh')::uuid, lpad(to_hex(i), 64, '0'), (select answer from payload), now() - make_interval(secs => i), now() + interval '1 day'
from generate_series(1, 25) i;
insert into results select 'each household keeps its newest 20 (expired ones removed)',
  (select count(*) from public.ai_plan_cache where household_id = pg_temp.v('hh')::uuid) = 20
  and not exists (select 1 from public.ai_plan_cache where cache_key = (select k1 from payload));
reset role;

select name, ok from results order by name;
rollback;
