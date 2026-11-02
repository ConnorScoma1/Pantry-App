-- Store prices smoke test: choosing a store, its validation, and plan amounts.
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
create temp table ids (who text, id uuid);
grant all on results, ids to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as c_onboarded;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as a_onboarded;
insert into ids values ('alice', public.current_household_id());

update public.households set pricing_provider = 'kroger', pricing_store_id = '01400376',
  pricing_store_name = 'Kroger Main St', pricing_store_set_at = now() where id = public.current_household_id();
insert into results select 'a member can choose the household''s store',
  (select pricing_store_id = '01400376' from public.households where id = public.current_household_id());

do $$ begin
  update public.households set pricing_store_id = 'x/../y' where id = public.current_household_id();
  insert into results values ('store ids are checked', false);
exception when check_violation then insert into results values ('store ids are checked', true);
end $$;
do $$ begin
  update public.households set pricing_provider = null where id = public.current_household_id();
  insert into results values ('a store id always comes with its provider', false);
exception when check_violation then insert into results values ('a store id always comes with its provider', true);
end $$;

-- Plan lines keep a structured amount; odd amounts are dropped, not guessed.
select public.replace_plan_grocery_items(public.current_grocery_list(),
  '[{"key":"baby spinach","name":"Baby spinach","department":"produce","amount":"3½ cups","neededFor":["Penne"],"quantity":{"value":828.06,"unit":"ml"}},
    {"key":"garlic","name":"Garlic","department":"produce","amount":"3 cloves + 1 tbsp","neededFor":["Penne"],"quantity":null},
    {"key":"salt","name":"Salt","department":"spices","amount":null,"neededFor":[],"quantity":{"value":"lots","unit":"g"}}]'::jsonb);
insert into results select 'plan amounts are stored for package math',
  (select required_quantity = 828.06 and required_unit = 'ml' from public.grocery_list_items where item_key = 'baby spinach')
  and (select required_quantity is null and required_unit is null from public.grocery_list_items where item_key = 'garlic')
  and (select required_quantity is null and required_unit is null from public.grocery_list_items where item_key = 'salt');

-- Another household can't see or change Alice's store.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000c3', true);
update public.households set pricing_provider = 'kroger', pricing_store_id = 'ZZZZ9999' where id = (select id from ids where who = 'alice');
insert into results select 'outsiders can''t read another household''s store',
  not exists (select 1 from public.households where id = (select id from ids where who = 'alice'));
reset role;
insert into results select 'outsiders can''t change another household''s store',
  (select pricing_store_id = '01400376' from public.households where id = (select id from ids where who = 'alice'));

select name, ok from results;
rollback;
