-- Meal planning smoke test. Runs in a transaction and rolls back.
-- Usage (with `supabase start` running):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/meal_plans_smoke_test.sql
-- Every result row should end in "t" (true).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'planner-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-0000000000c2', 'planner-b@example.com');

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
grant all on results to authenticated, anon;

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000c2', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as b_onboarded;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000c1', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as a_onboarded;

-- Alice saves a draft week: two recipes and a custom meal.
select public.save_meal_plan('{
  "weekStart": "2026-11-09", "mode": "budget_first", "generatedBy": "ai", "summary": "A thrifty week.",
  "meals": [
    {"date":"2026-11-09","recipeId":"7e570000-0000-4000-8000-000000000003","servings":2,"locked":true,"note":"Quick Monday"},
    {"date":"2026-11-11","recipeId":"7e570000-0000-4000-8000-000000000005","servings":4,"locked":false,"note":null},
    {"date":"2026-11-13","customTitle":"Leftovers","servings":2}
  ]}'::jsonb) is not null as saved;

insert into results select 'plan saved to own household as a draft',
  (select household_id = public.current_household_id() and status = 'draft' and planning_mode = 'budget_first'
          and generated_by = 'ai' and summary = 'A thrifty week.' from public.meal_plans);
insert into results select 'meals saved in order with locks, servings and notes',
  (select array_agg(coalesce(custom_title, recipe_id::text) order by position) from public.planned_meals)
    = array['7e570000-0000-4000-8000-000000000003','7e570000-0000-4000-8000-000000000005','Leftovers']
  and (select is_locked and note = 'Quick Monday' from public.planned_meals where planned_date = '2026-11-09')
  and (select servings = 4 from public.planned_meals where planned_date = '2026-11-11');

-- Re-saving replaces the meals (no duplicates).
select public.save_meal_plan('{"weekStart":"2026-11-09","mode":"balanced","generatedBy":"rules",
  "meals":[{"date":"2026-11-10","recipeId":"7e570000-0000-4000-8000-000000000001","servings":2}]}'::jsonb);
insert into results select 're-saving replaces the week',
  (select count(*) from public.meal_plans) = 1 and (select count(*) from public.planned_meals) = 1;

-- Confirm, then try to overwrite without and with permission.
select public.save_meal_plan('{"weekStart":"2026-11-09","mode":"balanced","generatedBy":"rules","confirmedAt":"2026-11-08T18:00:00Z",
  "meals":[{"date":"2026-11-10","recipeId":"7e570000-0000-4000-8000-000000000001","servings":2}]}'::jsonb);
insert into results select 'confirming makes the plan active', (select status = 'active' and confirmed_at is not null from public.meal_plans);
do $$ begin
  perform public.save_meal_plan('{"weekStart":"2026-11-09","mode":"balanced","generatedBy":"ai","meals":[]}'::jsonb);
  insert into results values ('confirmed week is not overwritten silently', false);
exception when raise_exception then
  insert into results values ('confirmed week is not overwritten silently',
    (select count(*) from public.planned_meals) = 1);
end $$;
select public.save_meal_plan('{"weekStart":"2026-11-09","mode":"balanced","generatedBy":"ai","meals":[]}'::jsonb, true);
insert into results select 'explicit overwrite of a confirmed week works',
  (select count(*) from public.planned_meals) = 0 and (select status = 'draft' from public.meal_plans);

do $$ begin
  perform public.save_meal_plan('{"weekStart":"2026-11-10","meals":[]}'::jsonb);
  insert into results values ('week must start on Monday', false);
exception when check_violation then insert into results values ('week must start on Monday', true);
end $$;
do $$ begin
  perform public.save_meal_plan('{"weekStart":"2026-11-09","meals":[{"date":"2026-11-20","recipeId":"7e570000-0000-4000-8000-000000000001","servings":2}]}'::jsonb, true);
  insert into results values ('meals must fall inside the week', false);
exception when check_violation then insert into results values ('meals must fall inside the week', true);
end $$;
do $$ begin
  perform public.save_meal_plan('{"weekStart":"2026-11-09","meals":[{"date":"2026-11-10","servings":2}]}'::jsonb, true);
  insert into results values ('a meal needs a recipe or a title', false);
exception when check_violation then insert into results values ('a meal needs a recipe or a title', true);
end $$;

-- AI usage: logged as self; counts only real model calls.
insert into public.ai_usage (feature, model, input_tokens, output_tokens, outcome) values
  ('meal_plan', 'claude-sonnet-5-5', 1800, 200, 'ok'),
  ('meal_plan', 'claude-sonnet-5-5', 0, 0, 'cached'),
  ('meal_plan', 'claude-sonnet-5-5', 1700, 0, 'fallback');
insert into results select 'usage counts only calls that reached the model', public.ai_requests_last_day('meal_plan') = 2;
do $$ begin
  insert into public.ai_usage (feature, user_id, outcome) values ('meal_plan', 'bbbbbbbb-0000-0000-0000-0000000000c2', 'ok');
  insert into results values ('cannot log usage as someone else', false);
exception when insufficient_privilege then insert into results values ('cannot log usage as someone else', true);
end $$;

-- Bob sees nothing of Alice's and can't touch her week.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000c2', true);
insert into results select 'other households see no plans or usage',
  not exists (select 1 from public.meal_plans) and not exists (select 1 from public.planned_meals)
  and not exists (select 1 from public.ai_usage) and public.ai_requests_last_day('meal_plan') = 0;
select public.save_meal_plan('{"weekStart":"2026-11-09","mode":"balanced","generatedBy":"manual","meals":[]}'::jsonb);
reset role;
insert into results select 'same week for another household is a separate plan',
  (select count(*) from public.meal_plans where week_start = '2026-11-09') = 2;

set role anon;
do $$ begin
  -- Either no privilege at all, or RLS returns nothing.
  insert into results values ('anon cannot read plans',
    not exists (select 1 from public.meal_plans) and not exists (select 1 from public.planned_meals));
exception when insufficient_privilege then insert into results values ('anon cannot read plans', true);
end $$;
reset role;
select name, ok from results;
rollback;
