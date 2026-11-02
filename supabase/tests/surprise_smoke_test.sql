-- Surprise Me smoke test: suggestions are remembered under the 'surprise'
-- surface (so they aren't repeated), only for your own household. Rolls back.
-- Every result row should end in "t".
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('c0000000-0000-0000-0000-0000000000c3', 'carol@example.com');
create temp table results (name text, ok boolean);
grant all on results to authenticated;
create temp table onboarding_payload as select '{"household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},"budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},"goals": {"ranked":["reduce_waste"]},"diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},"skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}}'::jsonb as body;
grant select on onboarding_payload to authenticated;
set role authenticated;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;

insert into public.recommendation_events (recipe_id, event, surface) select id, 'shown', 'surprise' from public.recipes order by slug limit 3;
insert into results select 'Surprise Me suggestions are recorded', (select count(*) = 3 from public.recommendation_events where surface = 'surprise');
do $$ begin
  insert into public.recommendation_events (recipe_id, event, surface) select id, 'shown', 'elsewhere' from public.recipes limit 1;
  insert into results values ('unknown surfaces are still rejected', false);
exception when check_violation then insert into results values ('unknown surfaces are still rejected', true);
end $$;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
insert into results select 'another household can''t see them', (select count(*) = 0 from public.recommendation_events where surface = 'surprise');

reset role;
select name, ok from results;
rollback;
