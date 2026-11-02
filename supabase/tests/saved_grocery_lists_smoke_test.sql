-- Saved grocery lists smoke test: shared within the household, private to
-- it, well-formed items only, and adding skips what's already on the list.
-- Rolls back. Every result row should end in "t".
begin;
insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('f2000000-0000-0000-0000-0000000000b2', 'ben@example.com'),
  ('f3000000-0000-0000-0000-0000000000c3', 'cy@example.com');
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v text);
grant all on results, vars to authenticated;
create or replace function pg_temp.v(key text) returns text language sql as $$ select v from vars where k = key $$;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;
create temp table payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
grant select on payload to authenticated;

set role authenticated;
select pg_temp.as_user('f1000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into vars select 'invite', token from public.create_household_invite();
insert into vars select 'list', public.current_grocery_list()::text;
insert into vars select 'saved', public.save_grocery_list('Weekly basics', '[
  {"name":"Milk","department":"dairy","amount":"1 gal","note":null},
  {"name":"Bananas","department":"produce"},
  {"name":"Eggs","department":"dairy","amount":"1 dozen"},
  {"name":"milk","department":"dairy"}
]'::jsonb)::text;
insert into results select 'a list can be saved', pg_temp.v('saved') is not null;
insert into results select 'saving again by the same name replaces it',
  public.save_grocery_list('  weekly BASICS ', '[{"name":"Milk","department":"dairy"},{"name":"Bananas","department":"produce"},{"name":"Eggs","department":"dairy"},{"name":"milk","department":"dairy"}]'::jsonb)::text = pg_temp.v('saved')
  and (select count(*) from public.saved_grocery_lists) = 1;
do $$ begin
  perform public.save_grocery_list('Bad', '[{"name":"x","department":"weapons"}]'::jsonb);
  insert into results values ('unknown aisles are refused', false);
exception when check_violation then insert into results values ('unknown aisles are refused', true);
end $$;
do $$ begin
  perform public.save_grocery_list('Bad', '[{"name":"x","department":"other","price":1}]'::jsonb);
  insert into results values ('extra fields are refused', false);
exception when check_violation then insert into results values ('extra fields are refused', true);
end $$;
do $$ begin
  perform public.save_grocery_list('Empty', '[]'::jsonb);
  insert into results values ('empty lists are refused', false);
exception when check_violation then insert into results values ('empty lists are refused', true);
end $$;
do $$ begin
  insert into public.saved_grocery_lists (name, items) values ('Direct', '[{"name":"x","department":"other"}]');
  insert into results values ('lists are only saved through the function', false);
exception when insufficient_privilege then insert into results values ('lists are only saved through the function', true);
end $$;

-- Milk is already on the list (not bought yet): only bananas and eggs are added, once.
insert into public.grocery_list_items (grocery_list_id, name, department) values (pg_temp.v('list')::uuid, 'MILK', 'dairy');
insert into results select 'adding skips what is already on the list', public.add_saved_list(pg_temp.v('saved')::uuid, pg_temp.v('list')::uuid) = 2;
insert into results select 'each item is added once', (select count(*) from public.grocery_list_items where grocery_list_id = pg_temp.v('list')::uuid) = 3;
insert into results select 'adding twice adds nothing new', public.add_saved_list(pg_temp.v('saved')::uuid, pg_temp.v('list')::uuid) = 0;

-- Ben joins: he can see and use the household's saved list.
select pg_temp.as_user('f2000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from payload)) is not null;
select public.accept_household_invite(pg_temp.v('invite')) is not null;
insert into results select 'household members share saved lists', (select count(*) from public.saved_grocery_lists where id = pg_temp.v('saved')::uuid) = 1;
update public.saved_grocery_lists set name = 'Basics' where id = pg_temp.v('saved')::uuid;
insert into results select 'members can rename a saved list', (select name from public.saved_grocery_lists where id = pg_temp.v('saved')::uuid) = 'Basics';
do $$ begin
  update public.saved_grocery_lists set household_id = gen_random_uuid() where id = (select v::uuid from vars where k = 'saved');
  insert into results values ('a saved list cannot be moved to another household', false);
exception when insufficient_privilege then insert into results values ('a saved list cannot be moved to another household', true);
end $$;

-- Cy, in another household, sees nothing and can't use it.
select pg_temp.as_user('f3000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from payload)) is not null;
insert into vars select 'cylist', public.current_grocery_list()::text;
insert into results select 'other households cannot see it', not exists (select 1 from public.saved_grocery_lists);
do $$ begin
  perform public.add_saved_list((select v::uuid from vars where k = 'saved'), (select v::uuid from vars where k = 'cylist'));
  insert into results values ('other households cannot use it', false);
exception when insufficient_privilege then insert into results values ('other households cannot use it', true);
end $$;
delete from public.saved_grocery_lists where id = pg_temp.v('saved')::uuid;
reset role;
insert into results select 'other households cannot delete it', exists (select 1 from public.saved_grocery_lists where id = pg_temp.v('saved')::uuid);

select name, ok from results;
rollback;
