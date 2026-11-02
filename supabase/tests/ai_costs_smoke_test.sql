-- AI cost logging smoke test: monthly person limit, app-wide spending cap,
-- costs recorded once and capped, bookkeeping private. Rolls back.
begin;
insert into auth.users (id, email) values ('a7000000-0000-0000-0000-0000000000a1', 'ana@example.com'), ('b7000000-0000-0000-0000-0000000000b2', 'ben@example.com');
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v text);
grant all on results, vars to authenticated, service_role;
create or replace function pg_temp.v(key text) returns text language sql as $$ select v from vars where k = key $$;
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":1,"children":0,"cookingFor":1,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
grant select on payload to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile((select body from payload)) is not null;
-- Two requests allowed this month for Ana.
insert into vars select 'r1', public.reserve_ai_request('meal_plan', 10, 2, 1000000)::text;
select public.finish_ai_request(pg_temp.v('r1')::uuid, 'ok', 'gemini-3.1-flash-lite', 4000, 600, 1900);
insert into vars select 'r2', public.reserve_ai_request('cooking_help', 10, 2, 1000000)::text;
select public.finish_ai_request(pg_temp.v('r2')::uuid, 'ok', 'gemini-3.1-flash-lite', 1000, 200, 999999999);
insert into results select 'requests are reserved while under the limits', pg_temp.v('r1') is not null and pg_temp.v('r2') is not null;
insert into results select 'the monthly limit per person applies across features', public.reserve_ai_request('recipe_draft', 10, 2, 1000000) is null;
insert into results select 'without a monthly limit, the daily ones still apply', public.reserve_ai_request('recipe_draft', 10, null, null) is not null;
insert into results select 'cost is recorded and capped per request', (select sum(cost_microusd) from public.ai_usage where outcome = 'ok') = 1900 + 100000;
select public.finish_ai_request(pg_temp.v('r1')::uuid, 'ok', 'x', 1, 1, 50000);
do $$ begin
  perform 1 from public.ai_spend_months;
  insert into results values ('monthly spend is private', false);
exception when insufficient_privilege then insert into results values ('monthly spend is private', true);
end $$;

-- Ben: the app has spent $0.1019 this month; a $0.10 budget stops new AI requests.
select set_config('request.jwt.claim.sub', 'b7000000-0000-0000-0000-0000000000b2', true);
select public.save_onboarding_profile((select body from payload)) is not null;
insert into results select 'the app-wide spending cap stops new AI requests', public.reserve_ai_request('meal_plan', 10, 60, 100000) is null;
insert into results select 'a higher cap still allows them', public.reserve_ai_request('meal_plan', 10, 60, 200000) is not null;
do $$ begin
  perform public.ai_month_spend(0);
  insert into results values ('only the server reads the month''s spend', false);
exception when insufficient_privilege then insert into results values ('only the server reads the month''s spend', true);
end $$;
reset role;
insert into results select 'each request is added to the month once', (select cost_microusd = 101900 and requests = 2 from public.ai_spend_months where month = date_trunc('month', now())::date);
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into results select 'the weekly job adds its own spend', public.ai_month_spend(5000) = 106900;
select set_config('request.jwt.claim.role', '', true);
reset role;
insert into results select 'only counts, models and costs are stored', not exists (
  select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage' and column_name in ('prompt', 'response', 'content', 'text'));

select name, ok from results;
rollback;
