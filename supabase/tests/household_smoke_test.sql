-- Shared household smoke test: invitations, permissions, shared data and the
-- shared grocery list. Runs in a transaction and rolls back.
-- Usage (with `supabase start` running):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/household_smoke_test.sql
-- Every result row should end in "t" (true).
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('b0000000-0000-0000-0000-0000000000b2', 'bob@example.com'),
  ('c0000000-0000-0000-0000-0000000000c3', 'carol@example.com'),
  ('d0000000-0000-0000-0000-0000000000d4', 'dan@example.com');

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
create temp table tokens (who text, token text, id uuid);
grant all on results, tokens to authenticated, anon;

create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;

-- Everyone onboards into their own household. Bob has a peanut allergy and never wants mushrooms.
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile(jsonb_set(jsonb_set((select body from onboarding_payload),
  '{diet,allergies}', '["peanut"]'), '{diet,neverRecommend}', '["mushrooms"]')) is not null as b_onboarded;
select public.set_skill_level(5::smallint);
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as c_onboarded;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as a_onboarded;
insert into public.pantry_items (name, category, storage_location) values ('Rice', 'rice', 'pantry');
insert into tokens values ('alice_household', null, public.current_household_id());

-- Alice (owner) creates two invites: an open link and one for Dan's email.
insert into tokens select 'open', token, invite_id from public.create_household_invite();
insert into tokens select 'dan', token, invite_id from public.create_household_invite('Dan@Example.com');
insert into results select 'tokens are long random hex and only their hash is stored',
  (select bool_and(token ~ '^[0-9a-f]{64}$') from tokens)
  and not exists (select 1 from public.household_invites i join tokens t on t.token = i.token_hash)
  and (select count(*) from public.household_invites) = 2;
insert into results select 'email invites are stored lower-case',
  (select email = 'dan@example.com' from public.household_invites where id = (select id from tokens where who = 'dan'));

-- Bob reads and accepts the open invite.
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'invite details show the household and inviter',
  (select status = 'valid' and household_name = 'My household' and invited_by = 'alice'
     from public.household_invite_details((select token from tokens where who = 'open')));
select public.accept_household_invite((select token from tokens where who = 'open')) is not null as b_joined;
insert into results select 'accepting makes you a member and switches your active household',
  public.current_household_id() = (select id from tokens where who = 'alice_household')
  and (select role = 'member' from public.household_member_list() where is_you);
insert into results select 'the joining member''s allergy and exclusions now count for the household',
  exists (select 1 from public.household_allergies where household_id = public.current_household_id() and allergen_code = 'peanut')
  and exists (select 1 from public.dietary_restrictions where household_id = public.current_household_id() and kind = 'exclude' and value = 'mushrooms');
insert into results select 'your own profile still shows only your own allergies',
  (select public.get_onboarding_profile() -> 'diet' -> 'allergies') = '["peanut"]'::jsonb;
insert into results select 'shared kitchen: the new member sees the household pantry',
  exists (select 1 from public.pantry_items where name = 'Rice');
insert into results select 'personal preferences stay personal',
  (select skill_level = 5 from public.user_preferences)
  and (select count(*) from public.user_preferences) = 1;
insert into results select 'member list shows names and roles',
  (select array_agg(display_name || ':' || role order by joined_at) from public.household_member_list()) = array['alice:owner', 'bob:member'];
insert into results select 'my_households lists both of Bob''s households',
  (select count(*) from public.my_households()) = 2 and (select count(*) from public.my_households() where is_active) = 1;

-- Alice: her profile stays hers; editing it can't drop Bob's allergy.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'the owner''s own diet is unchanged; the household list combines everyone',
  (select public.get_onboarding_profile() -> 'diet' -> 'allergies') = '[]'::jsonb
  and (select public.get_onboarding_profile() -> 'householdDiet' -> 'allergies') = '["peanut"]'::jsonb
  and (select (public.get_onboarding_profile() -> 'householdDiet' ->> 'memberCount')::int) = 2;
select public.save_onboarding_profile((select body from onboarding_payload)) is not null as a_resaved;
insert into results select 'editing your own profile can''t remove someone else''s allergy',
  exists (select 1 from public.household_allergies where household_id = public.current_household_id() and allergen_code = 'peanut');
insert into results select 'personal allergy rows are private to each person',
  not exists (select 1 from public.member_allergies where user_id = 'b0000000-0000-0000-0000-0000000000b2');
do $$ begin
  perform public.refresh_household_diet(public.current_household_id());
  insert into results values ('the internal rebuild function can''t be called by the app', false);
exception when insufficient_privilege then insert into results values ('the internal rebuild function can''t be called by the app', true);
end $$;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');

do $$ begin
  perform public.accept_household_invite((select token from tokens where who = 'open'));
  insert into results values ('re-using your own accepted invite just switches back', true);
exception when others then insert into results values ('re-using your own accepted invite just switches back', false);
end $$;

-- Carol can't reuse Bob's link, can't use Dan's, and can't join by inserting a row.
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
do $$ begin
  perform public.accept_household_invite((select token from tokens where who = 'open'));
  insert into results values ('a used invite can''t be used again', false);
exception when raise_exception then insert into results values ('a used invite can''t be used again', sqlerrm like '%already been used%');
end $$;
do $$ begin
  perform public.accept_household_invite((select token from tokens where who = 'dan'));
  insert into results values ('an email invite only works for that email', false);
exception when raise_exception then insert into results values ('an email invite only works for that email', sqlerrm like '%different email%');
end $$;
do $$ begin
  perform public.accept_household_invite('0000000000000000000000000000000000000000000000000000000000000000');
  insert into results values ('a made-up token is rejected', false);
exception when raise_exception then insert into results values ('a made-up token is rejected', true);
end $$;
do $$ begin
  insert into public.household_members (household_id, user_id, role)
  values ((select id from tokens where who = 'alice_household'), 'c0000000-0000-0000-0000-0000000000c3', 'owner');
  insert into results values ('nobody can add themselves to a household directly', false);
exception when insufficient_privilege then insert into results values ('nobody can add themselves to a household directly', true);
end $$;
insert into results select 'outsiders see none of the household''s data',
  not exists (select 1 from public.pantry_items where name = 'Rice')
  and not exists (select 1 from public.household_invites)
  and (select count(*) from public.household_member_list()) = 1;

-- Signed-out visitors can't read or use invites.
reset role;
select set_config('request.jwt.claim.sub', '', true);
set role anon;
do $$ begin
  perform public.household_invite_details((select token from tokens where who = 'dan'));
  insert into results values ('signed-out visitors can''t read invites', false);
exception when insufficient_privilege or invalid_authorization_specification then insert into results values ('signed-out visitors can''t read invites', true);
end $$;
do $$ begin
  perform public.accept_household_invite((select token from tokens where who = 'dan'));
  insert into results values ('signed-out visitors can''t accept invites', false);
exception when insufficient_privilege or invalid_authorization_specification then insert into results values ('signed-out visitors can''t accept invites', true);
end $$;
do $$ begin
  perform public.save_onboarding_profile('{}'::jsonb);
  insert into results values ('signed-out visitors can''t call earlier app functions', false);
exception when insufficient_privilege then insert into results values ('signed-out visitors can''t call earlier app functions', true);
end $$;
reset role;
set role authenticated;

-- Dan accepts his own email invite.
select pg_temp.as_user('d0000000-0000-0000-0000-0000000000d4');
select public.accept_household_invite((select token from tokens where who = 'dan')) is not null as d_joined;
insert into results select 'joining before onboarding: the household''s answers come back as a draft',
  public.get_onboarding_profile() is null
  and (select public.get_household_onboarding_draft() -> 'household' ->> 'postalCode') = '53132'
  and (select public.get_household_onboarding_draft() -> 'diet' -> 'allergies') = '[]'::jsonb;

-- Expired and revoked invites.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into tokens select 'old', token, invite_id from public.create_household_invite();
insert into tokens select 'cancel', token, invite_id from public.create_household_invite();
reset role;
update public.household_invites set created_at = now() - interval '9 days', expires_at = now() - interval '1 day'
  where id = (select id from tokens where who = 'old');
set role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.revoke_household_invite((select id from tokens where who = 'cancel'));
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
do $$ begin
  perform public.accept_household_invite((select token from tokens where who = 'old'));
  insert into results values ('expired invites are rejected', false);
exception when raise_exception then insert into results values ('expired invites are rejected', sqlerrm like '%expired%');
end $$;
do $$ begin
  perform public.accept_household_invite((select token from tokens where who = 'cancel'));
  insert into results values ('cancelled invites are rejected', false);
exception when raise_exception then insert into results values ('cancelled invites are rejected', sqlerrm like '%cancelled%');
end $$;

-- Seat limit: owner + 5. Alice, Bob, Dan are in; 3 more invites fill it.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select count(*) from (select public.create_household_invite() from generate_series(1, 3)) x;
do $$ begin
  perform public.create_household_invite();
  insert into results values ('a household tops out at 6 people including pending invites', false);
exception when raise_exception then insert into results values ('a household tops out at 6 people including pending invites', sqlerrm like '%up to 6%');
end $$;

-- Shared grocery list: Bob adds, Dan checks; attribution can't be spoofed.
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into tokens select 'list', null, public.current_grocery_list();
insert into public.grocery_list_items (grocery_list_id, name, added_by)
  values ((select id from tokens where who = 'list'), 'Milk', 'a0000000-0000-0000-0000-0000000000a1');
insert into results select 'added_by always comes from the session',
  (select added_by = 'b0000000-0000-0000-0000-0000000000b2' from public.grocery_list_items where name = 'Milk');
select pg_temp.as_user('d0000000-0000-0000-0000-0000000000d4');
insert into results select 'every member gets the same open list', public.current_grocery_list() = (select id from tokens where who = 'list');
update public.grocery_list_items set is_checked = true, checked_by = 'a0000000-0000-0000-0000-0000000000a1' where name = 'Milk';
insert into results select 'checked_by and checked_at come from the session',
  (select checked_by = 'd0000000-0000-0000-0000-0000000000d4' and checked_at is not null and added_by = 'b0000000-0000-0000-0000-0000000000b2'
     from public.grocery_list_items where name = 'Milk');
update public.grocery_list_items set name = 'Whole milk' where name = 'Milk';
insert into results select 'editing an item keeps who added and checked it',
  (select checked_by = 'd0000000-0000-0000-0000-0000000000d4' and added_by = 'b0000000-0000-0000-0000-0000000000b2'
     from public.grocery_list_items where name = 'Whole milk');
update public.grocery_list_items set is_checked = false where name = 'Whole milk';
insert into results select 'unchecking clears who checked it',
  (select checked_by is null and checked_at is null from public.grocery_list_items where name = 'Whole milk');

-- Plan items: replaced as a set; manual and bought items stay.
select public.replace_plan_grocery_items((select id from tokens where who = 'list'),
  '[{"key":"heavy cream","name":"heavy cream","department":"dairy","amount":"1 cup","neededFor":["Penne"]},
    {"key":"baby spinach","name":"baby spinach","department":"produce","amount":"5 oz","neededFor":["Penne"]}]'::jsonb);
update public.grocery_list_items set is_checked = true where item_key = 'baby spinach';
select public.replace_plan_grocery_items((select id from tokens where who = 'list'),
  '[{"key":"heavy cream","name":"heavy cream","department":"dairy","amount":"2 cups","neededFor":["Penne","Chicken"]},
    {"key":"baby spinach","name":"baby spinach","department":"produce","amount":"5 oz","neededFor":["Penne"]}]'::jsonb);
insert into results select 'refreshing plan items replaces them without duplicating bought ones',
  (select count(*) from public.grocery_list_items where item_key = 'heavy cream') = 1
  and (select amount_text = '2 cups' from public.grocery_list_items where item_key = 'heavy cream')
  and (select count(*) from public.grocery_list_items where item_key = 'baby spinach') = 1
  and exists (select 1 from public.grocery_list_items where name = 'Whole milk');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
insert into results select 'outsiders can''t see the shared list', not exists (select 1 from public.grocery_list_items);
update public.grocery_list_items set name = 'hacked';
delete from public.grocery_list_items;
do $$ begin
  insert into public.grocery_list_items (grocery_list_id, name) values ((select id from tokens where who = 'list'), 'Injected');
  insert into results values ('outsiders can''t add to the shared list', false);
exception when insufficient_privilege then insert into results values ('outsiders can''t add to the shared list', true);
end $$;
reset role;
insert into results select 'outsider updates and deletes had no effect',
  (select count(*) from public.grocery_list_items) = 3 and not exists (select 1 from public.grocery_list_items where name = 'hacked');
set role authenticated;

-- Roles: members can't remove people or invite; the owner can.
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
do $$ begin
  perform public.remove_household_member('d0000000-0000-0000-0000-0000000000d4');
  insert into results values ('members can''t remove people', false);
exception when insufficient_privilege then insert into results values ('members can''t remove people', true);
end $$;
do $$ begin
  perform public.create_household_invite();
  insert into results values ('members can''t invite people', false);
exception when insufficient_privilege then insert into results values ('members can''t invite people', true);
end $$;

select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.remove_household_member('b0000000-0000-0000-0000-0000000000b2');
do $$ begin
  perform public.leave_household();
  insert into results values ('the owner can''t walk away from the household', false);
exception when raise_exception then insert into results values ('the owner can''t walk away from the household', sqlerrm like '%Transfer ownership%');
end $$;

insert into results select 'a removed member''s allergy no longer applies to the household',
  not exists (select 1 from public.household_allergies where household_id = public.current_household_id() and allergen_code = 'peanut');
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'a removed member loses access and falls back to their own household',
  not exists (select 1 from public.pantry_items where name = 'Rice')
  and not exists (select 1 from public.grocery_list_items)
  and (select count(*) from public.my_households()) = 1
  and public.current_household_id() is not null;
insert into results select 'and it still applies in their own household',
  exists (select 1 from public.household_allergies where household_id = public.current_household_id() and allergen_code = 'peanut');

-- Ownership transfer, then Dan (now owner) can't be left ownerless; Alice leaves.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.transfer_household_ownership('d0000000-0000-0000-0000-0000000000d4');
select public.leave_household();
select pg_temp.as_user('d0000000-0000-0000-0000-0000000000d4');
insert into results select 'ownership transfers and the old owner can then leave',
  (select array_agg(display_name || ':' || role) from public.household_member_list()) = array['dan:owner'];
insert into results select 'the household''s data stays when people leave', exists (select 1 from public.pantry_items where name = 'Rice');

select public.set_display_name('  Dan the Cook ');
insert into results select 'display names can be changed', (select display_name = 'Dan the Cook' from public.household_member_list() where is_you);

reset role;
select name, ok from results;
rollback;
