-- One Store vs. Best Deals smoke test: shopping settings are personal, a
-- chosen trip only organises the household's own list, practice stores can't
-- be saved, and the advisor has its own AI limit. Rolls back.
begin;
insert into auth.users (id, email) values
  ('b1000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('b1000000-0000-0000-0000-0000000000b2', 'bob@example.com'),
  ('b1000000-0000-0000-0000-0000000000c3', 'carol@example.com');
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v uuid);
grant all on results, vars to authenticated;
set role authenticated;

-- Alice's household, with Bob as a member; Carol has her own.
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 3, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
insert into vars select 'hh', public.current_household_id();
insert into vars select 'list', public.current_grocery_list();
insert into public.grocery_list_items (grocery_list_id, name, department) select v, 'Milk', 'dairy' from vars where k = 'list';
insert into public.grocery_list_items (grocery_list_id, name, department) select v, 'Apples', 'produce' from vars where k = 'list';
insert into public.grocery_list_items (grocery_list_id, name, department) select v, 'Rice', 'pantry' from vars where k = 'list';
insert into vars select 'milk', id from public.grocery_list_items where name = 'Milk';
insert into vars select 'apples', id from public.grocery_list_items where name = 'Apples';
insert into vars select 'rice', id from public.grocery_list_items where name = 'Rice';
reset role;
insert into public.household_members (household_id, user_id, role) select v, 'b1000000-0000-0000-0000-0000000000b2', 'member' from vars where k = 'hh';
insert into public.profiles (id, active_household_id) select 'b1000000-0000-0000-0000-0000000000b2', v from vars where k = 'hh'
  on conflict (id) do update set active_household_id = excluded.active_household_id;
set role authenticated;

-- Personal settings
insert into public.shopping_preferences (household_id, max_stops, fuel_cents_per_gallon, start_address, loyalty_retailers, compare_store_ids, preferred_stores)
  select v, 3, 329, '123 Main St, Oak Creek WI', '{kroger}', '{01400376,01400441}', '{kroger:01400376}' from vars where k = 'hh';
insert into results select 'a member saves their own shopping settings', (select max_stops from public.shopping_preferences) = 3;
do $$ begin
  update public.shopping_preferences set max_stops = 5;
  insert into results values ('more than four stops is refused', false);
exception when check_violation then insert into results values ('more than four stops is refused', true);
end $$;
do $$ begin
  update public.shopping_preferences set preferred_stores = '{"sample:store-a"}';
  insert into results values ('only real store keys are saved', false);
exception when check_violation then insert into results values ('only real store keys are saved', true);
end $$;
do $$ begin
  update public.shopping_preferences set compare_store_ids = '{a,b,c,d,e,f,g}';
  insert into results values ('at most six stores are compared', false);
exception when check_violation then insert into results values ('at most six stores are compared', true);
end $$;
do $$ begin
  update public.shopping_preferences set loyalty_retailers = array['<script>'];
  insert into results values ('loyalty names are plain text', false);
exception when check_violation then insert into results values ('loyalty names are plain text', true);
end $$;

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b2', true);
insert into results select 'another member can''t see someone''s settings', (select count(*) from public.shopping_preferences) = 0;
update public.shopping_preferences set max_stops = 1;
do $$ begin
  insert into public.shopping_preferences (user_id, household_id) select 'b1000000-0000-0000-0000-0000000000a1', v from vars where k = 'hh';
  insert into results values ('nobody writes settings for someone else', false);
exception when insufficient_privilege then insert into results values ('nobody writes settings for someone else', true);
end $$;

-- Trips: Bob organises the shared list.
insert into vars select 'trip', public.save_shopping_trip(jsonb_build_object(
  'strategy', 'best_deals',
  'stops', jsonb_build_array(
    jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'Pick ''n Save Oak Creek', 'address', '1 Main St', 'itemIds', jsonb_build_array((select v from vars where k = 'milk'), (select v from vars where k = 'rice'))),
    jsonb_build_object('storeKey', 'kroger:01400441', 'name', 'Metro Market', 'address', null, 'itemIds', jsonb_build_array((select v from vars where k = 'apples')))
  )));
insert into results select 'a member saves a two-store trip', (select count(*) from public.shopping_trip_stops where trip_id = (select v from vars where k = 'trip')) = 2
  and (select count(*) from public.shopping_trip_items where trip_id = (select v from vars where k = 'trip')) = 3;

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000a1', true);
insert into results select 'the household sees the trip', (select strategy from public.shopping_trips where status = 'active') = 'best_deals';
insert into results select 'Alice''s settings are unchanged by Bob', (select max_stops from public.shopping_preferences) = 3;
do $$ begin
  insert into public.shopping_trips (household_id, grocery_list_id, strategy) select (select v from vars where k = 'hh'), (select v from vars where k = 'list'), 'one_store';
  insert into results values ('trips can''t be written directly', false);
exception when insufficient_privilege then insert into results values ('trips can''t be written directly', true);
end $$;
do $$ begin
  update public.shopping_trip_items set stop_position = 1;
  insert into results values ('trip items can''t be edited directly', (select count(*) from public.shopping_trip_items where stop_position = 2) = 0 and false);
exception when insufficient_privilege then insert into results values ('trip items can''t be edited directly', true);
end $$;

-- A new choice replaces the old one without deleting it.
insert into vars select 'trip2', public.save_shopping_trip(jsonb_build_object('strategy', 'one_store',
  'stops', jsonb_build_array(jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'Pick ''n Save', 'itemIds', jsonb_build_array((select v from vars where k = 'milk'))))));
insert into results select 'choosing again cancels the previous trip', (select status from public.shopping_trips where id = (select v from vars where k = 'trip')) = 'cancelled'
  and (select count(*) from public.shopping_trips where status = 'active') = 1;

do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'best_deals', 'stops', jsonb_build_array(
    jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'A', 'itemIds', jsonb_build_array((select v from vars where k = 'milk'))),
    jsonb_build_object('storeKey', 'kroger:01400441', 'name', 'B', 'itemIds', jsonb_build_array((select v from vars where k = 'milk'))))));
  insert into results values ('an item is bought at only one store', false);
exception when check_violation then insert into results values ('an item is bought at only one store', true);
end $$;
do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'best_deals', 'stops', jsonb_build_array(
    jsonb_build_object('storeKey', 'sample:store-a', 'name', 'Sample Supermarket A', 'itemIds', '[]'::jsonb))));
  insert into results values ('practice stores can''t be saved', false);
exception when check_violation then insert into results values ('practice stores can''t be saved', true);
end $$;
do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'best_deals', 'stops', '[{},{},{},{},{}]'::jsonb));
  insert into results values ('five stops are refused', false);
exception when check_violation then insert into results values ('five stops are refused', true);
end $$;
do $$ begin
  perform public.save_shopping_trip('{"strategy":"one_store"}'::jsonb);
  insert into results values ('a trip without stops is refused', false);
exception when check_violation then insert into results values ('a trip without stops is refused', true);
end $$;
do $$ begin
  perform public.save_shopping_trip('{"strategy":"one_store","stops":[{"storeKey":"kroger:01400376","name":"A"}]}'::jsonb);
  insert into results values ('a stop without items is refused', false);
exception when check_violation then insert into results values ('a stop without items is refused', true);
end $$;
do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'best_deals', 'stops', jsonb_build_array(
    jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'A', 'itemIds', jsonb_build_array((select v from vars where k = 'milk'))),
    jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'A', 'itemIds', jsonb_build_array((select v from vars where k = 'rice'))))));
  insert into results values ('a store appears once per trip', false);
exception when check_violation then insert into results values ('a store appears once per trip', true);
end $$;
insert into results select 'the active trip survived the refused saves', (select count(*) from public.shopping_trips where status = 'active') = 1;
do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'cheapest_ever', 'stops', '[]'::jsonb));
  insert into results values ('unknown strategies are refused', false);
exception when check_violation then insert into results values ('unknown strategies are refused', true);
end $$;
do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'one_store', 'stops', jsonb_build_array(
    jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'A', 'itemIds', jsonb_build_array('not-a-uuid')))));
  insert into results values ('bad item ids are refused', false);
exception when check_violation then insert into results values ('bad item ids are refused', true);
end $$;

-- Carol can't see the trip or put Alice's items on hers.
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000c3', true);
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"60601","adults":1,"children":0,"cookingFor":1,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["save_money"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
select public.current_grocery_list() is not null;
insert into results select 'another household can''t see the trip', (select count(*) from public.shopping_trips) = 0 and (select count(*) from public.shopping_trip_items) = 0;
do $$ begin
  perform public.save_shopping_trip(jsonb_build_object('strategy', 'one_store', 'stops', jsonb_build_array(
    jsonb_build_object('storeKey', 'kroger:01400376', 'name', 'A', 'itemIds', jsonb_build_array((select v from vars where k = 'milk'))))));
  insert into results values ('items from another household''s list are refused', false);
exception when check_violation then insert into results values ('items from another household''s list are refused', true);
end $$;
insert into results select 'another household can''t end the trip', not public.end_shopping_trip((select v from vars where k = 'trip2'), 'cancelled');

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000a1', true);
insert into results select 'a member marks the trip done', public.end_shopping_trip((select v from vars where k = 'trip2'), 'done');
insert into results select 'the trip is no longer active', (select status from public.shopping_trips where id = (select v from vars where k = 'trip2')) = 'done';

-- AI advisor limit
insert into results select 'the advisor has its own AI limit', public.reserve_ai_request('shopping_advice', 1) is not null and public.reserve_ai_request('shopping_advice', 1) is null
  and public.reserve_ai_request('cooking_help', 1) is not null;

reset role;
select name, ok from results;
rollback;
