-- Delete-my-account smoke test: only your own data goes; shared households
-- stay with the others (with a new owner and without your allergies); a
-- household that was only yours goes completely. Rolls back.
begin;
insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('db000000-0000-0000-0000-0000000000b2', 'ben@example.com'),
  ('dc000000-0000-0000-0000-0000000000c3', 'cy@example.com');
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v text);
grant select on payload to authenticated;
grant all on results, vars to authenticated, anon;
create or replace function pg_temp.v(key text) returns text language sql as $$ select v from vars where k = key $$;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;
-- Ana (shellfish allergy) owns a household and invites Ben (peanut allergy). Cy lives alone.
select pg_temp.as_user('da000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile(jsonb_set((select body from payload), '{diet,allergies}', '["shellfish"]')) is not null;
insert into vars values ('ana_hh', public.current_household_id()::text);
insert into vars select 'invite', token from public.create_household_invite();
insert into public.pantry_items (name, category, storage_location) values ('Rice', 'rice', 'pantry');
select public.save_grocery_list('Weekly basics', '[{"name":"Milk","department":"dairy"}]'::jsonb) is not null;

select pg_temp.as_user('db000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile(jsonb_set((select body from payload), '{diet,allergies}', '["peanut"]')) is not null;
insert into vars values ('ben_own_hh', public.current_household_id()::text);
select public.accept_household_invite(pg_temp.v('invite')) is not null;

select pg_temp.as_user('dc000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into vars values ('cy_hh', public.current_household_id()::text);

reset role;
insert into results select 'set-up: Ana and Ben share a household that avoids shellfish and peanuts',
  (select count(*) from public.household_members where household_id = pg_temp.v('ana_hh')::uuid) = 2
  and (select array_agg(allergen_code order by allergen_code) from public.household_allergies where household_id = pg_temp.v('ana_hh')::uuid) = array['peanut','shellfish'];
set role authenticated;

-- Wrong confirmation, signed out, and anon: nothing happens.
select pg_temp.as_user('da000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.delete_my_account('delete');
  insert into results values ('needs DELETE typed exactly', false);
exception when check_violation then insert into results values ('needs DELETE typed exactly', true);
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.delete_my_account('DELETE');
  insert into results values ('signed out can''t delete anyone', false);
exception when insufficient_privilege then insert into results values ('signed out can''t delete anyone', true);
end $$;
reset role;
set role anon;
do $$ begin
  perform public.delete_my_account('DELETE');
  insert into results values ('anon can''t call it', false);
exception when insufficient_privilege then insert into results values ('anon can''t call it', true);
end $$;
reset role;
set role authenticated;

-- Ana deletes her account.
select pg_temp.as_user('da000000-0000-0000-0000-0000000000a1');
select public.delete_my_account('DELETE');
reset role;
insert into results select 'Ana''s account is gone', not exists (select 1 from auth.users where id = 'da000000-0000-0000-0000-0000000000a1');
insert into results select 'and her profile and allergies with it',
  not exists (select 1 from public.profiles where id = 'da000000-0000-0000-0000-0000000000a1')
  and not exists (select 1 from public.member_allergies where user_id = 'da000000-0000-0000-0000-0000000000a1');
insert into results select 'the shared household stays, with Ben as owner',
  exists (select 1 from public.households where id = pg_temp.v('ana_hh')::uuid and created_by = 'db000000-0000-0000-0000-0000000000b2')
  and (select role from public.household_members where household_id = pg_temp.v('ana_hh')::uuid and user_id = 'db000000-0000-0000-0000-0000000000b2') = 'owner';
insert into results select 'its allergies no longer include Ana''s shellfish',
  (select array_agg(allergen_code) from public.household_allergies where household_id = pg_temp.v('ana_hh')::uuid) = array['peanut'];
insert into results select 'shared things Ana added stay for Ben',
  exists (select 1 from public.pantry_items where household_id = pg_temp.v('ana_hh')::uuid and name = 'Rice')
  and exists (select 1 from public.saved_grocery_lists where household_id = pg_temp.v('ana_hh')::uuid and created_by is null);
insert into results select 'other people are untouched',
  exists (select 1 from public.households where id = pg_temp.v('cy_hh')::uuid) and exists (select 1 from auth.users where id = 'dc000000-0000-0000-0000-0000000000c3');

-- Ben deletes too: both households now only his go completely.
set role authenticated;
select pg_temp.as_user('db000000-0000-0000-0000-0000000000b2');
select public.delete_my_account('DELETE');
reset role;
insert into results select 'a household that was only yours is deleted with its data',
  not exists (select 1 from public.households where id in (pg_temp.v('ana_hh')::uuid, pg_temp.v('ben_own_hh')::uuid))
  and not exists (select 1 from public.pantry_items where household_id = pg_temp.v('ana_hh')::uuid)
  and not exists (select 1 from public.saved_grocery_lists where household_id = pg_temp.v('ana_hh')::uuid);

-- Cy (alone, owner) deletes: his household goes.
set role authenticated;
select pg_temp.as_user('dc000000-0000-0000-0000-0000000000c3');
select public.delete_my_account('DELETE');
reset role;
insert into results select 'a single-person household is deleted', not exists (select 1 from public.households where id = pg_temp.v('cy_hh')::uuid);

select name, ok from results order by name;
rollback;
