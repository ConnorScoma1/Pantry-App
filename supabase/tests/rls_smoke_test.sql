-- RLS + onboarding smoke test. Runs inside a transaction and rolls back.
-- Usage (with `supabase start` running):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_smoke_test.sql
-- Every result row should end in "t" (true).
begin;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');
select 'profiles auto-created' as check, count(*) = 2 as ok from public.profiles;

-- ---------- Alice onboards ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":1,"cookingFor":3,"dinnersPerWeek":5,
                "mealsIncluded":["dinner","lunch"],"servingsByMeal":{"lunch":1}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner","lunch"],"priority":"balanced"},
  "goals": {"ranked":["save_money","reduce_waste"]},
  "diet": {"allergies":["peanut","sesame"],"style":"omnivore","restrictions":["halal"],
           "dislikes":["Olives","Mushrooms"],"neverRecommend":["Coconut"],"cuisines":["italian","thai"],
           "proteins":["chicken"],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":120}},
  "skillLevel": 3,
  "equipment": ["stove","oven","air_fryer"],
  "store": {"usualRetailer":"meijer","storeLocationId":null}
}'::jsonb) is not null as saved;
select public.get_onboarding_profile() -> 'diet' as alice_diet;
select (public.get_onboarding_profile() -> 'household' ->> 'cookingFor') = '3' as roundtrip_ok;

-- Re-saving updates the same household instead of creating a new one.
select public.save_onboarding_profile(public.get_onboarding_profile() || '{"skillLevel":5}'::jsonb) is not null;
select count(*) = 1 as one_household, (select skill_level from public.user_preferences) = 5 as skill_updated from public.households;

insert into public.pantry_items (household_id, name, category, quantity, unit, storage_location, use_by)
select active_household_id, 'Chicken thighs', 'protein', 1, 'lb', 'fridge', current_date + 2 from public.profiles;
select count(*) = 1 as alice_sees_pantry from public.pantry_items;
select count(*) > 0 as reference_readable from public.allergens;

-- ---------- Bob: must see nothing of Alice's ----------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) = 0 as bob_no_households from public.households;
select count(*) = 0 as bob_no_pantry from public.pantry_items;
select count(*) = 0 as bob_no_allergies from public.household_allergies;
select count(*) = 1 as bob_sees_own_profile_only from public.profiles;
select public.get_onboarding_profile() is null as bob_not_onboarded;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
create temp table if not exists results (name text, blocked boolean);
grant all on results to authenticated;
do $$
declare alice_h uuid;
begin
  -- Bob learns Alice's household id somehow (e.g. a leaked URL).
  reset role; select active_household_id into alice_h from public.profiles where id='11111111-1111-1111-1111-111111111111'; set role authenticated;
  begin insert into public.pantry_items (household_id, name) values (alice_h, 'evil'); insert into results values ('insert pantry into other household', false);
  exception when insufficient_privilege then insert into results values ('insert pantry into other household', true); end;
  begin insert into public.household_members (household_id, user_id, role) values (alice_h, '22222222-2222-2222-2222-222222222222', 'owner'); insert into results values ('join other household', false);
  exception when insufficient_privilege then insert into results values ('join other household', true); end;
  begin update public.profiles set active_household_id = alice_h where id = '22222222-2222-2222-2222-222222222222'; insert into results values ('point profile at other household', false);
  exception when insufficient_privilege then insert into results values ('point profile at other household', true); end;
  begin insert into public.households (created_by, postal_code) values ('11111111-1111-1111-1111-111111111111', '00000'); insert into results values ('create household as someone else', false);
  exception when insufficient_privilege then insert into results values ('create household as someone else', true); end;
  begin insert into public.allergens (code, name) values ('x','x'); insert into results values ('write reference data', false);
  exception when insufficient_privilege then insert into results values ('write reference data', true); end;
  begin insert into public.product_price_observations (retailer_product_id, provider, price_cents, observed_at) values (gen_random_uuid(), 'fake', 1, now()); insert into results values ('fabricate price observation', false);
  exception when insufficient_privilege then insert into results values ('fabricate price observation', true); end;
  update public.households set postal_code = '99999' where id = alice_h;
  insert into results values ('update other household is a no-op', (select postal_code from public.households where id = alice_h) is null);
  delete from public.households where id = alice_h;
end $$;
reset role;
select name, blocked from results;
select count(*) = 1 as alice_household_survived, bool_and(postal_code = '53132') as postal_unchanged from public.households;
-- anon sees nothing
set role anon;
select count(*) = 0 as anon_sees_no_allergens from public.allergens;
reset role;
rollback;
