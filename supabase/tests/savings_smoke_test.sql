-- Smart Savings smoke test: the pantry log keeps price and use-by, spending
-- is shared within the household only, and the overview is per household.
-- Rolls back. Every result row should end in "t".
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('b0000000-0000-0000-0000-0000000000b2', 'bob@example.com'),
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
create temp table vars (k text primary key, v jsonb);
grant all on results, vars to authenticated;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
insert into vars select 'invite', to_jsonb(token) from public.create_household_invite();
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select public.accept_household_invite((select v #>> '{}' from vars where k = 'invite')) is not null;
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
insert into vars select 'carol_cart', public.save_cart_draft(null, 'mock', null, 'Sample Market', 'pickup', '[]', null);

-- Alice uses up spinach she paid $4.99 for, and throws out yogurt.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into public.pantry_items (household_id, name, category, storage_location, use_by, price_paid_cents)
  values (public.current_household_id(), 'Baby spinach', 'produce', 'fridge', current_date + 2, 499);
insert into public.pantry_items (household_id, name, category, storage_location, use_by, price_paid_cents)
  values (public.current_household_id(), 'Greek yogurt', 'dairy', 'fridge', current_date - 1, 300);
select public.pantry_remove_item((select id from public.pantry_items where name = 'Baby spinach'), 'consumed');
select public.pantry_remove_item((select id from public.pantry_items where name = 'Greek yogurt'), 'expired');
insert into results select 'the pantry log keeps what was paid and the use-by date after the item is gone',
  (select price_paid_cents = 499 and use_by = current_date + 2 from public.pantry_transactions where item_name = 'Baby spinach' and reason = 'consumed');

-- Spending.
insert into public.grocery_spending (spent_on, amount_cents, store_name) values (current_date, 8642, 'Kroger');
insert into results select 'a member can log a shop', (select count(*) = 1 from public.grocery_spending);
do $$ begin
  insert into public.grocery_spending (spent_on, amount_cents) values (current_date + 10, 100);
  insert into results values ('a shop in the future is refused', false);
exception when check_violation then insert into results values ('a shop in the future is refused', true);
end $$;
do $$ begin
  insert into public.grocery_spending (spent_on, amount_cents, created_by) values (current_date, 100, 'b0000000-0000-0000-0000-0000000000b2');
  insert into results values ('nobody can log a shop as someone else', false);
exception when insufficient_privilege then insert into results values ('nobody can log a shop as someone else', true);
end $$;
do $$ begin
  insert into public.grocery_spending (spent_on, amount_cents, cart_draft_id) values (current_date, 100, ((select v from vars where k = 'carol_cart') ->> 'id')::uuid);
  insert into results values ('another household''s order cannot be linked', false);
exception when check_violation then insert into results values ('another household''s order cannot be linked', true);
end $$;

select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'the rest of the household sees it', (select count(*) = 1 and bool_and(amount_cents = 8642) from public.grocery_spending);
update public.grocery_spending set amount_cents = 8700;
insert into results select 'and can correct the amount', (select amount_cents = 8700 from public.grocery_spending);
do $$ begin
  update public.grocery_spending set household_id = gen_random_uuid();
  insert into results values ('a shop cannot be moved to another household', false);
exception when insufficient_privilege then insert into results values ('a shop cannot be moved to another household', true);
end $$;
insert into results select 'the overview has this household''s food log, prices included',
  (select jsonb_array_length(o -> 'pantry') = 2
      and (select sum((p ->> 'pricePaidCents')::int) from jsonb_array_elements(o -> 'pantry') p) = 799
      and jsonb_array_length(o -> 'spending') = 1
      and jsonb_array_length(o -> 'carts') = 0
   from (select public.savings_overview(current_date - 30) as o) x);

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
insert into results select 'other households see none of it',
  (select count(*) = 0 from public.grocery_spending)
  and (select jsonb_array_length(o -> 'pantry') = 0 and jsonb_array_length(o -> 'spending') = 0 from (select public.savings_overview(current_date - 30) as o) x);
delete from public.grocery_spending;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'and cannot delete it', (select count(*) = 1 from public.grocery_spending);
delete from public.grocery_spending;
insert into results select 'a member can delete a mistaken entry', (select count(*) = 0 from public.grocery_spending);

reset role;
select name, ok from results;
rollback;
