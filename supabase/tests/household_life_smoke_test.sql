-- Shared household part 2 smoke test: who's eating, guests, portions and the
-- activity feed stay inside the household. Rolls back. Every row should end in "t".
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('b0000000-0000-0000-0000-0000000000b2', 'bob@example.com'),
  ('c0000000-0000-0000-0000-0000000000c3', 'carol@example.com');

create temp table onboarding_payload as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":1,"cookingFor":3,"dinnersPerWeek":5,
                "mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],
           "cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
grant select on onboarding_payload to authenticated;
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v jsonb);
grant all on results, vars to authenticated;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
update public.profiles set display_name = 'Alice' where id = 'a0000000-0000-0000-0000-0000000000a1';
insert into vars select 'invite', to_jsonb(token) from public.create_household_invite();
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select public.accept_household_invite((select v #>> '{}' from vars where k = 'invite')) is not null;
update public.profiles set display_name = 'Bob' where id = 'b0000000-0000-0000-0000-0000000000b2';
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;

-- Bob is out tomorrow and eats a big portion; Alice adds two guests.
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.set_meal_attendance(current_date + 1, false);
insert into results select 'portions are rounded to quarters', public.set_my_portion(1.6) = 1.5;
do $$ begin
  perform public.set_my_portion(5);
  insert into results values ('a silly portion is refused', false);
exception when check_violation then insert into results values ('a silly portion is refused', true);
end $$;
do $$ begin
  perform public.set_meal_attendance(current_date + 200, true);
  insert into results values ('only the next two months', false);
exception when check_violation then insert into results values ('only the next two months', true);
end $$;
do $$ begin
  insert into public.meal_attendance (household_id, day, user_id, eating)
    values (public.current_household_id(), current_date, 'a0000000-0000-0000-0000-0000000000a1', false);
  insert into results values ('nobody can answer for someone else', false);
exception when insufficient_privilege then insert into results values ('nobody can answer for someone else', true);
end $$;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.set_meal_guests(current_date + 1, 2);

insert into vars select 'range', public.meal_attendance_range(current_date, current_date + 6);
insert into results select 'everyone sees the members, portions and answers',
  (select jsonb_array_length(v -> 'members') = 2
      and (v -> 'members' -> 0 ->> 'name') = 'Alice' and (v -> 'members' -> 0 ->> 'isYou')::boolean
      and (select (m ->> 'portion')::numeric = 1.5 from jsonb_array_elements(v -> 'members') m where m ->> 'name' = 'Bob')
      and (v -> 'answers' -> 0 ->> 'eating')::boolean = false
      and (v -> 'guests' -> 0 ->> 'guests')::int = 2
   from vars where k = 'range');
select public.set_meal_guests(current_date + 1, 0);
insert into results select 'zero guests clears the day', (select count(*) = 0 from public.meal_guests);
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.set_meal_attendance(current_date + 1, null);
insert into results select 'clearing an answer goes back to the default', (select count(*) = 0 from public.meal_attendance);
select public.set_meal_attendance(current_date + 2, false);

-- Activity.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into public.pantry_items (household_id, name, category, storage_location) values (public.current_household_id(), 'Baby spinach', 'produce', 'fridge');
select public.pantry_remove_item((select id from public.pantry_items where name = 'Baby spinach'), 'consumed');
insert into public.grocery_spending (spent_on, amount_cents, store_name) values (current_date, 4200, 'Kroger');
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into vars select 'feed_b', public.household_activity(20);
insert into results select 'the feed names who did what (and "You" for yourself)',
  (select bool_or(e ->> 'kind' = 'pantry_consumed' and e ->> 'actorName' = 'Alice' and e ->> 'subject' = 'Baby spinach')
      and bool_or(e ->> 'kind' = 'shop_logged' and e ->> 'detail' = '4200')
      and not bool_or((e ->> 'isYou')::boolean)
   from vars, jsonb_array_elements(v) e where k = 'feed_b');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
insert into results select 'other households see none of it',
  jsonb_array_length(public.household_activity(20)) = 0
  and jsonb_array_length(public.meal_attendance_range(current_date, current_date + 6) -> 'answers') = 0
  and (select count(*) = 0 from public.meal_attendance) and (select count(*) = 0 from public.meal_guests);

reset role;
select name, ok from results;
rollback;
