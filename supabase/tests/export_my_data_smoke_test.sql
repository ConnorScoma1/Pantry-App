-- Download-my-data smoke test: the export has your data and your household's,
-- nothing from other households, no public library recipes, and needs a
-- signed-in person. Rolls back.
begin;
insert into auth.users (id, email) values
  ('ea000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('ec000000-0000-0000-0000-0000000000c3', 'cy@example.com');
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":["shellfish"],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
create temp table results (name text, ok boolean);
create temp table ex (who text, doc jsonb);
grant select on payload to authenticated;
grant all on results, ex to authenticated, anon;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into public.pantry_items (name, category, storage_location) values ('Cy secret saffron', 'other', 'pantry');

select pg_temp.as_user('ea000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into public.pantry_items (name, category, storage_location) values ('Rice', 'rice', 'pantry');
select public.save_grocery_list('Weekly basics', '[{"name":"Milk","department":"dairy"}]'::jsonb) is not null;
insert into ex select 'ana', public.export_my_data();

insert into results select 'it says what it is', (select doc ->> 'format' from ex where who = 'ana') = 'kitchen-pantry-export-v1';
insert into results select 'your kitchen and saved lists are in it',
  (select doc from ex where who = 'ana') -> 'pantry_items' @> '[{"name":"Rice"}]'
  and (select doc from ex where who = 'ana') -> 'saved_grocery_lists' @> '[{"name":"Weekly basics"}]';
insert into results select 'your allergies and profile are in it',
  (select doc from ex where who = 'ana') -> 'member_allergies' @> '[{"allergen_code":"shellfish"}]'
  and jsonb_array_length((select doc from ex where who = 'ana') -> 'profiles') >= 1;
insert into results select 'nothing from another household',
  position('Cy secret saffron' in (select doc::text from ex where who = 'ana')) = 0;
insert into results select 'public library recipes aren''t included',
  jsonb_array_length((select doc from ex where who = 'ana') -> 'recipes') = 0;
insert into results select 'server-only tables aren''t included',
  not ((select doc from ex where who = 'ana') ? 'retailer_connections') and not ((select doc from ex where who = 'ana') ? 'ai_plan_cache');
insert into results select 'every table the app shows made it in',
  (select doc from ex where who = 'ana') ?& array['user_preferences','households','household_members','meal_plans','grocery_lists','cooking_history','notification_preferences','ai_usage'];

select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.export_my_data();
  insert into results values ('signed out gets nothing', false);
exception when insufficient_privilege then insert into results values ('signed out gets nothing', true);
end $$;
reset role;
set role anon;
do $$ begin
  perform public.export_my_data();
  insert into results values ('anon can''t call it', false);
exception when insufficient_privilege then insert into results values ('anon can''t call it', true);
end $$;
reset role;

select name, ok from results order by name;
rollback;
