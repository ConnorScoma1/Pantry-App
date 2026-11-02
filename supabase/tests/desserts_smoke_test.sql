-- Desserts smoke test: preferences, meal-plan desserts and the catalogue.
-- Runs in a transaction and rolls back. Every result row should end in "t".
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

-- Carol onboards without dessert answers (older app): she gets the default.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as c_onboarded;
insert into results select 'without dessert answers the default is once a week, any category, same skill',
  (select public.get_onboarding_profile() -> 'desserts') = '{"frequency":"weekly","categories":[],"skillLevel":null}'::jsonb;

-- Alice answers the dessert question.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile(jsonb_set((select body from onboarding_payload), '{desserts}',
  '{"frequency":"twice_weekly","skillLevel":4,"categories":["cakes","pastries"]}')) is not null as a_onboarded;
insert into results select 'dessert answers are saved: frequency and categories on the household, skill on the person',
  (select dessert_frequency = 'twice_weekly' and dessert_categories = array['cakes','pastries'] from public.households where id = public.current_household_id())
  and (select dessert_skill_level = 4 and skill_level = 2 from public.user_preferences where user_id = 'a0000000-0000-0000-0000-0000000000a1');
insert into results select 'the profile returns them',
  (select (public.get_onboarding_profile() -> 'desserts' ->> 'frequency') = 'twice_weekly'
     and (public.get_onboarding_profile() -> 'desserts' ->> 'skillLevel')::int = 4);

select public.save_dessert_preferences('{"frequency":"never","skillLevel":null,"categories":[]}');
insert into results select 'desserts can be switched off and the dessert skill reset',
  (select dessert_frequency = 'never' from public.households where id = public.current_household_id())
  and (select dessert_skill_level is null from public.user_preferences where user_id = 'a0000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.save_dessert_preferences('{"frequency":"daily","skillLevel":null,"categories":[]}');
  insert into results values ('there is no "every day" option', false);
exception when check_violation then insert into results values ('there is no "every day" option', true);
end $$;
do $$ begin
  perform public.save_dessert_preferences('{"frequency":"weekly","skillLevel":9,"categories":[]}');
  insert into results values ('dessert skill is 1–5', false);
exception when check_violation then insert into results values ('dessert skill is 1–5', true);
end $$;

-- Meal plans: a dinner and a dessert on the same day; never two desserts.
select public.save_meal_plan(jsonb_build_object('weekStart', '2026-11-09', 'meals', jsonb_build_array(
  jsonb_build_object('date', '2026-11-14', 'mealType', 'dinner', 'recipeId', '7e570000-0000-4000-8000-000000000015', 'servings', 4),
  jsonb_build_object('date', '2026-11-14', 'mealType', 'dessert', 'recipeId', '7e570000-0000-4000-8000-000000000017', 'servings', 8)
))) is not null as saved;
insert into results select 'a dessert is stored next to that day''s dinner, with its type',
  (select array_agg(meal_type order by meal_type) from public.planned_meals pm join public.meal_plans mp on mp.id = pm.meal_plan_id
     where mp.week_start = '2026-11-09') = array['dessert', 'dinner'];
do $$ begin
  perform public.save_meal_plan(jsonb_build_object('weekStart', '2026-11-09', 'meals', jsonb_build_array(
    jsonb_build_object('date', '2026-11-14', 'mealType', 'dessert', 'recipeId', '7e570000-0000-4000-8000-000000000016', 'servings', 4),
    jsonb_build_object('date', '2026-11-14', 'mealType', 'dessert', 'recipeId', '7e570000-0000-4000-8000-000000000017', 'servings', 4)
  )));
  insert into results values ('only one dessert per day', false);
exception when check_violation then insert into results values ('only one dessert per day', true);
end $$;

-- Carol's settings were not touched by Alice.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
insert into results select 'dessert settings are per household',
  (select (public.get_onboarding_profile() -> 'desserts' ->> 'frequency') = 'weekly');

reset role;
insert into results select 'catalogue desserts are marked as desserts with a category and chill time',
  (select count(*) from public.recipes where course = 'dessert') >= 9
  and not exists (select 1 from public.recipes where course = 'dessert' and dessert_category is null)
  and (select chill_minutes = 240 from public.recipes where slug = 'dark-chocolate-pots-de-creme')
  and (select course = 'main' from public.recipes where slug = 'sheet-pan-lemon-herb-chicken-potatoes');
do $$ begin
  update public.recipes set dessert_category = 'cakes' where slug = 'sheet-pan-lemon-herb-chicken-potatoes';
  insert into results values ('only desserts have a dessert category', false);
exception when check_violation then insert into results values ('only desserts have a dessert category', true);
end $$;

select name, ok from results;
rollback;
