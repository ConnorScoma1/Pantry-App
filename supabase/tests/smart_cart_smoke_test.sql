-- Smart Cart smoke test: shared review, approval, one send per key,
-- interrupted sends, purchase status and token privacy. Rolls back.
-- Every result row should end in "t".
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
grant all on results, vars to authenticated, service_role;
create or replace function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true);
$$;

set role authenticated;
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
insert into vars select 'token', to_jsonb(token) from public.create_household_invite();
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.accept_household_invite((select v #>> '{}' from vars where k = 'token')) is not null;

-- Alice builds a Kroger cart; Bob sees and edits it.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into vars select 'draft', public.save_cart_draft(null, 'kroger', '01400376', 'Kroger Oak Creek', 'pickup', '[{"id":"x","name":"Milk","options":[],"count":1,"include":false,"approved":true}]', null);
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'household members see the same cart',
  (public.current_cart_draft() ->> 'id') = (select v ->> 'id' from vars where k = 'draft');
insert into vars select 'v2', public.save_cart_draft((select (v ->> 'id')::uuid from vars where k = 'draft'), 'kroger', '01400376', 'Kroger Oak Creek', 'delivery', '[{"id":"x","name":"Milk","options":[],"count":1,"include":false,"approved":true},{"id":"y","name":"Eggs","options":[],"count":2,"include":false,"approved":true}]', 1);
insert into results select 'a member can edit; the version goes up', (select (v ->> 'version')::int = 2 and v ->> 'fulfillment' = 'delivery' from vars where k = 'v2');
do $$ begin
  perform public.save_cart_draft((select (v ->> 'id')::uuid from vars where k = 'draft'), 'kroger', null, null, 'pickup', '[]', 1);
  insert into results values ('a stale edit is rejected (someone else changed it)', false);
exception when raise_exception then insert into results values ('a stale edit is rejected (someone else changed it)', true);
end $$;
do $$ begin
  perform public.approve_cart_draft((select (v ->> 'id')::uuid from vars where k = 'draft'), null);
  insert into results values ('approving needs the version you saw', false);
exception when raise_exception then insert into results values ('approving needs the version you saw', true);
end $$;
do $$ begin
  perform public.save_cart_draft((select (v ->> 'id')::uuid from vars where k = 'draft'), 'kroger', null, null, 'pickup', '[{"id":"z"}]', 2);
  insert into results values ('malformed lines are rejected', false);
exception when invalid_parameter_value then insert into results values ('malformed lines are rejected', true);
end $$;
do $$ begin
  insert into public.cart_drafts (household_id, retailer) values (public.current_household_id(), 'mock');
  insert into results values ('no direct writes to carts', false);
exception when insufficient_privilege then insert into results values ('no direct writes to carts', true);
end $$;

-- Carol (another household) can't see or touch it.
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
insert into results select 'other households can''t see the cart', public.current_cart_draft() is null and (select count(*) from public.cart_drafts) = 0;
do $$ begin
  perform public.approve_cart_draft((select (v ->> 'id')::uuid from vars where k = 'draft'), 2);
  insert into results values ('other households can''t approve it', false);
exception when no_data_found then insert into results values ('other households can''t approve it', true);
end $$;

-- Alice approves → a transfer key. Members can't start or finish a real send themselves.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into vars select 'approved', public.approve_cart_draft((select (v ->> 'id')::uuid from vars where k = 'draft'), 2);
insert into results select 'approval records who and creates a transfer key',
  (select v ->> 'status' = 'approved' and v ->> 'approvedBy' = 'a0000000-0000-0000-0000-0000000000a1' and v ->> 'transferKey' is not null from vars where k = 'approved');
do $$ begin
  perform public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'));
  insert into results values ('a member can''t start a real-retailer send (only the server can)', false);
exception when insufficient_privilege then insert into results values ('a member can''t start a real-retailer send (only the server can)', true);
end $$;

-- The server (service role) sends on Alice's behalf: exactly one send per key.
reset role;
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into vars select 'go', public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'), 'a0000000-0000-0000-0000-0000000000a1');
insert into results select 'the server''s first send goes ahead', (select v ->> 'action' = 'go' from vars where k = 'go');
insert into results select 'a second tap while sending is told to wait',
  public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'), 'a0000000-0000-0000-0000-0000000000a1') ->> 'action' = 'busy';
do $$ begin
  perform public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'), 'c0000000-0000-0000-0000-0000000000c3');
  insert into results values ('the server can''t act for someone outside the household', false);
exception when no_data_found then insert into results values ('the server can''t act for someone outside the household', true);
end $$;
do $$ begin
  perform public.finish_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'), 'sent',
    '{"kind":"cart_confirmed","added":2,"checkoutUrl":"javascript:alert(1)","confirmedBy":"retailer_api","at":"x"}', null, 'a0000000-0000-0000-0000-0000000000a1');
  insert into results values ('a result with a non-https link is refused', false);
exception when invalid_parameter_value then insert into results values ('a result with a non-https link is refused', true);
end $$;
select public.finish_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'), 'sent',
  '{"kind":"cart_confirmed","added":2,"checkoutUrl":"https://www.kroger.com/cart","confirmedBy":"retailer_api","at":"2026-11-01T22:00:00Z"}', null, 'a0000000-0000-0000-0000-0000000000a1') is not null;
insert into results select 'a retry after success sends nothing and returns the stored result',
  (select r ->> 'action' = 'done' and r #>> '{draft,result,added}' = '2'
     from (select public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), (select (v ->> 'transferKey')::uuid from vars where k = 'approved'), 'a0000000-0000-0000-0000-0000000000a1') as r) x);
insert into results select 'a wrong key is refused',
  public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'draft'), gen_random_uuid(), 'a0000000-0000-0000-0000-0000000000a1') ->> 'action' = 'invalid';
-- Retailer tokens: only the server stores them.
insert into public.retailer_connections (user_id, retailer, token_ciphertext, scope) values ('a0000000-0000-0000-0000-0000000000a1', 'kroger', 'v1.ciphertext', 'cart.basic:write');
select set_config('request.jwt.claim.role', '', true);
reset role;
set role authenticated;

select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'a person can see whether they are connected — not the tokens', public.retailer_connected('kroger');
do $$ begin
  perform token_ciphertext from public.retailer_connections;
  insert into results values ('clients can''t read token ciphertext', false);
exception when insufficient_privilege then insert into results values ('clients can''t read token ciphertext', true);
end $$;
do $$ begin
  insert into public.retailer_connections (user_id, retailer, token_ciphertext) values ('a0000000-0000-0000-0000-0000000000a1', 'kroger', 'v1.x');
  insert into results values ('clients can''t write tokens', false);
exception when insufficient_privilege then insert into results values ('clients can''t write tokens', true);
end $$;

-- Purchase status is separate from the list and from the send.
insert into results select 'the household reports the order; the list is untouched',
  public.set_cart_purchase((select (v ->> 'id')::uuid from vars where k = 'draft'), true) ->> 'purchase' = 'ordered';

-- A practice (mock) cart: members run it themselves, but can't fake a real retailer's answer.
insert into vars select 'd2', public.save_cart_draft(null, 'mock', null, 'Sample Market', 'pickup', '[{"id":"x","name":"Milk","options":[],"count":1,"include":false,"approved":true}]', null);
insert into vars select 'a2', public.approve_cart_draft((select (v ->> 'id')::uuid from vars where k = 'd2'), 1);
select public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'd2'), (select (v ->> 'transferKey')::uuid from vars where k = 'a2')) is not null;
do $$ begin
  perform public.finish_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'd2'), (select (v ->> 'transferKey')::uuid from vars where k = 'a2'), 'sent',
    '{"kind":"cart_confirmed","added":9,"checkoutUrl":"https://evil.example/","confirmedBy":"retailer_api","at":"x"}', null);
  insert into results values ('a member can''t record a fake retailer confirmation', false);
exception when invalid_parameter_value then insert into results values ('a member can''t record a fake retailer confirmation', true);
end $$;
select public.finish_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'd2'), (select (v ->> 'transferKey')::uuid from vars where k = 'a2'), 'not_sent', null, 'Practice failure') is not null;
insert into results select 'a send that never reached the retailer can be approved again with the same key',
  (select (public.approve_cart_draft((select (v ->> 'id')::uuid from vars where k = 'd2'), (public.current_cart_draft() ->> 'version')::int) ->> 'transferKey') = (select v ->> 'transferKey' from vars where k = 'a2'));

-- An interrupted send: unknown until a person checks the retailer cart.
select public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'd2'), (select (v ->> 'transferKey')::uuid from vars where k = 'a2')) is not null;
reset role;
update public.cart_drafts set sending_started_at = now() - interval '10 minutes' where id = (select (v ->> 'id')::uuid from vars where k = 'd2');
set role authenticated;
insert into results select 'a stuck send becomes "unknown" instead of sending again',
  public.begin_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'd2'), (select (v ->> 'transferKey')::uuid from vars where k = 'a2')) ->> 'action' = 'unknown';
insert into vars select 'r', public.resolve_cart_transfer((select (v ->> 'id')::uuid from vars where k = 'd2'), false);
insert into results select 'after checking, nothing was added: a fresh key for a safe retry',
  (select v ->> 'status' = 'approved' and v ->> 'transferKey' <> (select v ->> 'transferKey' from vars where k = 'a2') from vars where k = 'r');

select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'connections are personal', not public.retailer_connected('kroger');

reset role;
select name, ok from results;
rollback;
