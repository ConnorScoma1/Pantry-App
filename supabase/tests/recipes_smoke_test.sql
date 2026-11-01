-- Recipes, ratings & favourites smoke test. Runs in a transaction and rolls back.
-- Usage (with `supabase start` running):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/recipes_smoke_test.sql
-- Every result row should end in "t" (true).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'rater-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'rater-b@example.com');

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
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-00000000000b', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as b_onboarded;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as a_onboarded;

insert into results select 'signed-in users see the Test Kitchen catalogue',
  (select count(*) from public.recipes) >= 15
  and exists (select 1 from public.recipe_ingredients) and exists (select 1 from public.recipe_instructions);

-- Alice rates the chili 5★ and favourites it.
insert into public.recipe_ratings (recipe_id, overall, would_cook_again)
values ('7e570000-0000-4000-8000-000000000005', 5, true);
insert into results select 'rating defaults to own user and household',
  (select user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and household_id = public.current_household_id()
     from public.recipe_ratings limit 1);
insert into public.user_favorites (recipe_id) values ('7e570000-0000-4000-8000-000000000005');
insert into results select 'favourite saved for self',
  exists (select 1 from public.user_favorites where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a');

-- Bob rates the same recipe 3★.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-00000000000b', true);
insert into public.recipe_ratings (recipe_id, overall, would_cook_again)
values ('7e570000-0000-4000-8000-000000000005', 3, false);
insert into results select 'bob cannot see alice''s rating rows', (select count(*) from public.recipe_ratings) = 1;
insert into results select 'bob cannot see alice''s favourites', not exists (select 1 from public.user_favorites);
insert into results select 'summary aggregates across households',
  (select average = 4.00 and rating_count = 2 and would_cook_again_pct = 50.0
     from public.recipe_rating_summaries(array['7e570000-0000-4000-8000-000000000005']::uuid[]));
insert into results select 'unrated recipes have no summary row',
  not exists (select 1 from public.recipe_rating_summaries(array['7e570000-0000-4000-8000-000000000001']::uuid[]));

do $$ begin
  insert into public.recipe_ratings (recipe_id, user_id, overall) values ('7e570000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 1);
  insert into results values ('cannot rate as someone else', false);
exception when insufficient_privilege then insert into results values ('cannot rate as someone else', true);
end $$;
do $$ begin
  insert into public.recipe_ratings (recipe_id, overall) values ('7e570000-0000-4000-8000-000000000001', 9);
  insert into results values ('rating range enforced', false);
exception when check_violation then insert into results values ('rating range enforced', true);
end $$;
do $$ begin
  insert into public.recipes (source_id, slug, title, skill_level, visibility) values
    ((select id from public.recipe_sources limit 1), 'hacked', 'Hacked public recipe', 1, 'public');
  insert into results values ('users cannot publish catalogue recipes', false);
exception when insufficient_privilege then insert into results values ('users cannot publish catalogue recipes', true);
end $$;

reset role;
select name, ok from results;
rollback;
