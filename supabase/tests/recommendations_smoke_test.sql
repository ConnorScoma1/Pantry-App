-- Recommendation history smoke test. Runs in a transaction and rolls back.
-- Usage (with `supabase start` running):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/recommendations_smoke_test.sql
-- Every result row should end in "t" (true).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'events-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'events-b@example.com');

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
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000b1', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as b_onboarded;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as a_onboarded;

-- Alice opens the chili, dismisses it, then the quesadillas; undoes the quesadillas.
insert into public.recommendation_events (recipe_id, event, surface, created_at) values
  ('7e570000-0000-4000-8000-000000000005', 'opened', 'recipes', now() - interval '3 minutes'),
  ('7e570000-0000-4000-8000-000000000005', 'dismissed', 'detail', now() - interval '2 minutes'),
  ('7e570000-0000-4000-8000-000000000002', 'dismissed', 'recipes', now() - interval '2 minutes'),
  ('7e570000-0000-4000-8000-000000000002', 'undismissed', 'recipes', now() - interval '1 minute');

insert into results select 'events default to own user and household',
  (select bool_and(user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and household_id = public.current_household_id())
     from public.recommendation_events);
insert into results select 'latest dismiss wins, undo restores',
  (select array_agg(id) from public.dismissed_recipe_ids() id) = array['7e570000-0000-4000-8000-000000000005']::uuid[];

do $$ begin
  update public.recommendation_events set event = 'cooked';
  insert into results values ('history cannot be rewritten', not exists (select 1 from public.recommendation_events where event = 'cooked'));
end $$;
do $$ begin
  delete from public.recommendation_events;
  insert into results values ('history cannot be deleted', (select count(*) from public.recommendation_events) = 4);
end $$;
do $$ begin
  insert into public.recommendation_events (recipe_id, event, surface) values ('7e570000-0000-4000-8000-000000000001', 'liked', 'home');
  insert into results values ('unknown event rejected', false);
exception when check_violation then insert into results values ('unknown event rejected', true);
end $$;
do $$ begin
  insert into public.recommendation_events (recipe_id, user_id, event, surface)
  values ('7e570000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'dismissed', 'home');
  insert into results values ('cannot log as someone else', false);
exception when insufficient_privilege then insert into results values ('cannot log as someone else', true);
end $$;

-- Bob sees none of Alice's history and has nothing dismissed.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000b1', true);
insert into results select 'other households see no events', not exists (select 1 from public.recommendation_events);
insert into results select 'dismissals are per household', not exists (select 1 from public.dismissed_recipe_ids());

reset role;
set role anon;
do $$ begin
  perform 1 from public.recommendation_events;
  insert into results values ('anon cannot read history', false);
exception when insufficient_privilege then insert into results values ('anon cannot read history', true);
end $$;
reset role;
select name, ok from results;
rollback;
