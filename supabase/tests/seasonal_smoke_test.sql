-- Seasonal preferences smoke test. Runs in a transaction and rolls back.
-- Every result row should end in "t".
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('c0000000-0000-0000-0000-0000000000c3', 'carol@example.com');

create temp table onboarding_payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,
                "mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],
           "cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
grant select on onboarding_payload to authenticated;
create temp table results (name text, ok boolean);
grant all on results to authenticated;

set role authenticated;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as c_onboarded;
insert into results select 'without answers, seasonal recipes are on with sensible defaults and no holidays assumed',
  (select public.get_onboarding_profile() -> 'seasonal') = '{"enabled":true,"produce":true,"meals":true,"desserts":true,"holidays":true,"deals":false,"holidayOptIns":[],"region":null}'::jsonb;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile(jsonb_set((select body from onboarding_payload), '{seasonal}',
  '{"enabled":true,"produce":true,"meals":false,"desserts":true,"holidays":true,"deals":true,"holidayOptIns":["thanksgiving","diwali"],"region":"north-temperate"}')) is not null as a_onboarded;
insert into results select 'answers are saved: personal settings on the person, region on the household',
  (select seasonal ->> 'meals' = 'false' and seasonal -> 'holidayOptIns' = '["thanksgiving","diwali"]'::jsonb
     from public.user_preferences where user_id = 'a0000000-0000-0000-0000-0000000000a1')
  and (select seasonal_region = 'north-temperate' from public.households where id = public.current_household_id())
  and (select (public.get_onboarding_profile() -> 'seasonal' ->> 'deals')::boolean);

select public.save_seasonal_preferences('{"enabled":false,"produce":true,"meals":true,"desserts":true,"holidays":true,"deals":false,"holidayOptIns":[],"region":null}');
insert into results select 'seasonal recipes can be switched off and the region set back to automatic',
  (select (public.get_onboarding_profile() -> 'seasonal' ->> 'enabled')::boolean = false
     and public.get_onboarding_profile() -> 'seasonal' -> 'region' = 'null'::jsonb);
do $$ begin
  perform public.save_seasonal_preferences('{"enabled":"yes"}');
  insert into results values ('malformed settings are rejected', false);
exception when invalid_parameter_value then insert into results values ('malformed settings are rejected', true);
end $$;
do $$ begin
  perform public.save_seasonal_preferences('{"enabled":true,"produce":true,"meals":true,"desserts":true,"holidays":true,"deals":false,"holidayOptIns":[],"region":"mars"}');
  insert into results values ('only known regions', false);
exception when check_violation then insert into results values ('only known regions', true);
end $$;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
insert into results select 'one person''s settings don''t touch another household',
  (select (public.get_onboarding_profile() -> 'seasonal' ->> 'enabled')::boolean);

reset role;
select name, ok from results;
rollback;
