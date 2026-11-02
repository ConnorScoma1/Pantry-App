-- Cooking mode smoke test: assistant questions are logged under their own
-- feature and counted separately from meal plans; slots are reserved before
-- the model is called; push addresses and invite-email counts. Rolls back.
begin;
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'), ('a0000000-0000-0000-0000-0000000000c3', 'carol@example.com');
create temp table results (name text, ok boolean);
grant all on results to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 4, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
insert into public.ai_usage (feature, model, input_tokens, output_tokens, outcome) values ('cooking_help', 'claude-sonnet-5-5', 900, 80, 'ok');
insert into public.ai_usage (feature, model, input_tokens, output_tokens, outcome) values ('cooking_help', 'claude-sonnet-5-5', 0, 0, 'fallback');
insert into results select 'cooking questions count against their own limit', public.ai_requests_last_day('cooking_help') = 2 and public.ai_requests_last_day('meal_plan') = 0;
do $$ begin
  insert into public.ai_usage (feature, outcome) values ('something_else', 'ok');
  insert into results values ('unknown AI features are refused', false);
exception when check_violation then insert into results values ('unknown AI features are refused', true);
end $$;
-- Reservations: the limit holds, cached/unused slots are given back.
create temp table ids (id uuid);
grant all on ids to authenticated;
insert into ids select public.reserve_ai_request('cooking_help', 3);
insert into results select 'a slot is reserved within the limit', (select count(*) from ids where id is not null) = 1 and public.ai_requests_last_day('cooking_help') = 3;
insert into results select 'no slot past the limit', public.reserve_ai_request('cooking_help', 3) is null;
select public.finish_ai_request((select id from ids), 'unused', 'm', 0, 0);
insert into results select 'an unused slot is given back', public.ai_requests_last_day('cooking_help') = 2;
select public.finish_ai_request((select id from ids), 'ok', 'm', 10, 10);
insert into results select 'a finished slot can''t be changed again', (select outcome from public.ai_usage where id = (select id from ids)) = 'unused';
do $$ begin
  perform public.finish_ai_request(gen_random_uuid(), 'limited', 'm', 0, 0);
  insert into results values ('only real outcomes can be recorded', false);
exception when check_violation then insert into results values ('only real outcomes can be recorded', true);
end $$;

-- Push addresses: a recently used address can't be taken by another account.
insert into results select 'a phone address registers', public.register_push_token('ExponentPushToken[abcdefgh1234]', 'ios');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000c3', true);
insert into results select 'another account can''t take a recent address', not public.register_push_token('ExponentPushToken[abcdefgh1234]', 'android');
reset role;
update public.push_tokens set last_seen_at = now() - interval '31 days' where token = 'ExponentPushToken[abcdefgh1234]';
set role authenticated;
insert into results select 'a stale address can move to a new account', public.register_push_token('ExponentPushToken[abcdefgh1234]', 'android');
insert into results select 'invite emails are counted per person', public.invite_emails_today() = 0;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
reset role;
select name, ok from results;
rollback;
