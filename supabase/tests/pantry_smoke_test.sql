-- My Kitchen inventory smoke test. Runs in a transaction and rolls back.
-- Usage (with `supabase start` running):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/pantry_smoke_test.sql
-- Every result row should end in "t" (true).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cook-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cook-b@example.com');

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

-- Both cooks onboard (each gets their own household).
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as bob_onboarded;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as alice_onboarded;

-- Insert without household_id: defaults to the caller's household.
insert into public.pantry_items (name, category, quantity, unit, normalized_quantity, normalized_unit, storage_location, use_by)
values ('Chicken thighs', 'protein', 1.5, 'lb', 680.3886, 'g', 'fridge', current_date + 2);
insert into results select 'defaults to own household',
  (select household_id = public.current_household_id() from public.pantry_items where name = 'Chicken thighs');
insert into results select 'insert logged as added',
  exists (select 1 from public.pantry_transactions where reason = 'added' and item_name = 'Chicken thighs' and quantity_delta = 1.5);

update public.pantry_items set quantity = 1, normalized_quantity = 453.5924 where name = 'Chicken thighs';
insert into results select 'quantity change logged as adjusted',
  exists (select 1 from public.pantry_transactions where reason = 'adjusted' and quantity_delta = -0.5);

update public.pantry_items set storage_location = 'freezer' where name = 'Chicken thighs';
insert into results select 'non-quantity edit not logged',
  (select count(*) from public.pantry_transactions where item_name = 'Chicken thighs') = 2;

insert into public.pantry_items (name, category, is_staple, source) values ('Kosher salt', 'spice', true, 'bulk_staple');
insert into results select 'staple without quantity allowed',
  exists (select 1 from public.pantry_items where name = 'Kosher salt' and quantity is null);

-- ---------- Bob tries to interfere ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
do $$
declare alice_item uuid; alice_household uuid;
begin
  reset role;
  select id, household_id into alice_item, alice_household from public.pantry_items where name = 'Chicken thighs';
  set role authenticated;
  begin
    perform public.pantry_remove_item(alice_item, 'consumed');
    insert into results values ('bob cannot remove alice''s item', false);
  exception when no_data_found then insert into results values ('bob cannot remove alice''s item', true);
  end;
  begin
    insert into public.pantry_items (household_id, name) values (alice_household, 'sneaky');
    insert into results values ('bob cannot insert into alice''s kitchen', false);
  exception when insufficient_privilege then insert into results values ('bob cannot insert into alice''s kitchen', true);
  end;
end $$;
insert into results select 'bob sees none of alice''s transactions',
  not exists (select 1 from public.pantry_transactions where item_name = 'Chicken thighs');

-- ---------- Alice uses the chicken ----------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select public.pantry_remove_item((select id from public.pantry_items where name = 'Chicken thighs'), 'consumed');
insert into results select 'removed item is gone', not exists (select 1 from public.pantry_items where name = 'Chicken thighs');
insert into results select 'removal logged with reason and name',
  exists (select 1 from public.pantry_transactions where reason = 'consumed' and item_name = 'Chicken thighs' and quantity_delta = -1);
do $$ begin
  perform public.pantry_remove_item((select id from public.pantry_items where name = 'Kosher salt'), 'stolen');
  insert into results values ('unknown removal reason rejected', false);
exception when invalid_parameter_value then insert into results values ('unknown removal reason rejected', true);
end $$;

insert into results select 'search by name', exists (select 1 from public.search_ingredients('garl') where canonical_name = 'garlic');
insert into results select 'search by alias', exists (select 1 from public.search_ingredients('mayo') where canonical_name = 'mayonnaise');
insert into results select 'search tolerates typos', exists (select 1 from public.search_ingredients('papirka') where canonical_name = 'paprika');

-- Deleting a household with inventory must not fail on the log trigger.
reset role;
delete from public.households where id = (select active_household_id from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001');
insert into results select 'household delete cascades cleanly',
  not exists (select 1 from public.pantry_items where name = 'Kosher salt');

select name, ok from results;
rollback;
