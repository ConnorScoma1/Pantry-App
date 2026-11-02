-- Weekly drafts smoke test: opt-in settings, server-only jobs, drafts only
-- into empty weeks, confirmed/started weeks left alone, notices and phone
-- addresses per person. Rolls back. Every result row should end in "t".
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
  "diet": {"allergies":["peanut"],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],
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
create or replace function pg_temp.v(key text) returns jsonb language sql as $$ select v from vars where k = key $$;

insert into vars select 'recipe', to_jsonb(r.id) from public.recipes r where r.visibility = 'public' order by r.title limit 1;

set role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
insert into vars select 'invite', to_jsonb(token) from public.create_household_invite();
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select public.accept_household_invite((select v #>> '{}' from vars where k = 'invite')) is not null;
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;
select pg_temp.as_user('d0000000-0000-0000-0000-0000000000d4');
select public.save_onboarding_profile((select body from onboarding_payload)) is not null;

-- Off by default.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'weekly drafts are off until someone turns them on',
  (public.get_weekly_planning() ->> 'enabled')::boolean = false;

-- Alice turns them on (Monday 00:00 = always due, for the test).
insert into results select 'a member can turn weekly drafts on',
  (public.save_weekly_planning('{"enabled":true,"runDay":1,"runHour":0,"timeZone":"America/Chicago","mode":"balanced"}') ->> 'enabledByYou')::boolean;
do $$ begin
  perform public.save_weekly_planning('{"enabled":true,"runDay":1,"runHour":0,"timeZone":"Mars/Olympus","mode":"balanced"}');
  insert into results values ('an unknown time zone is rejected', false);
exception when check_violation then insert into results values ('an unknown time zone is rejected', true);
end $$;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'other members see who turned drafts on',
  (public.get_weekly_planning() ->> 'enabled')::boolean and public.get_weekly_planning() ->> 'enabledByName' is not null
  and not (public.get_weekly_planning() ->> 'enabledByYou')::boolean;

-- Bob: no in-app notices, but phone notifications on, and a phone registered.
insert into public.notification_preferences (plan_ready_in_app, plan_ready_push) values (false, true);
select public.register_push_token('ExponentPushToken[bobsPhone123456]', 'ios');
insert into results select 'a person sees their own phone address', (select count(*) = 1 from public.push_tokens);

-- Members can't touch jobs directly or run the server's functions.
do $$ begin
  insert into public.planning_jobs (household_id, week_start) values (public.current_household_id(), date_trunc('week', now())::date + 7);
  insert into results values ('members cannot create planning jobs', false);
exception when insufficient_privilege then insert into results values ('members cannot create planning jobs', true);
end $$;
do $$ begin
  perform * from public.claim_planning_jobs(5);
  insert into results values ('members cannot claim jobs', false);
exception when insufficient_privilege then insert into results values ('members cannot claim jobs', true);
end $$;
do $$ begin
  perform public.planning_job_context(gen_random_uuid());
  insert into results values ('members cannot read planning inputs', false);
exception when insufficient_privilege then insert into results values ('members cannot read planning inputs', true);
end $$;

-- Carol (own household) has drafts on and will start planning by hand mid-job.
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_weekly_planning('{"enabled":true,"runDay":1,"runHour":0,"timeZone":"Europe/London","mode":"balanced"}') is not null;
insert into results select 'nobody else sees Carol''s phone address or Bob''s', (select count(*) = 0 from public.push_tokens);
-- Dan confirmed next week already.
select pg_temp.as_user('d0000000-0000-0000-0000-0000000000d4');
select public.save_weekly_planning('{"enabled":true,"runDay":1,"runHour":0,"timeZone":"America/New_York","mode":"balanced"}') is not null;
select public.save_meal_plan(jsonb_build_object(
  'weekStart', (date_trunc('week', now() at time zone 'America/New_York')::date + 7),
  'mode', 'balanced', 'generatedBy', 'manual', 'summary', null, 'confirmedAt', now(),
  'meals', jsonb_build_array(jsonb_build_object('date', (date_trunc('week', now() at time zone 'America/New_York')::date + 7), 'customTitle', 'Tacos', 'servings', 2))
)) is not null;

-- The server claims due households — once per week.
reset role;
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
insert into vars select 'jobs', jsonb_agg(to_jsonb(c)) from public.claim_planning_jobs(10) c;
insert into results select 'the server claims each due household once', jsonb_array_length(pg_temp.v('jobs')) = 3;
insert into results select 'claiming again does nothing (one job per week)', (select count(*) = 0 from public.claim_planning_jobs(10));
insert into results select 'the job is for next week (Monday)',
  (select bool_and(extract(isodow from (x ->> 'week_start')::date) = 1 and (x ->> 'week_start')::date > current_date - 1) from jsonb_array_elements(pg_temp.v('jobs')) x);

insert into vars select 'job_a', to_jsonb(x ->> 'job_id') from jsonb_array_elements(pg_temp.v('jobs')) x
  where (x ->> 'household_id')::uuid = (select household_id from public.household_members where user_id = 'a0000000-0000-0000-0000-0000000000a1');
insert into vars select 'job_c', to_jsonb(x ->> 'job_id') from jsonb_array_elements(pg_temp.v('jobs')) x
  where (x ->> 'household_id')::uuid = (select household_id from public.household_members where user_id = 'c0000000-0000-0000-0000-0000000000c3');
insert into vars select 'job_d', to_jsonb(x ->> 'job_id') from jsonb_array_elements(pg_temp.v('jobs')) x
  where (x ->> 'household_id')::uuid = (select household_id from public.household_members where user_id = 'd0000000-0000-0000-0000-0000000000d4');

insert into vars select 'ctx_a', public.planning_job_context((pg_temp.v('job_a') #>> '{}')::uuid);
insert into results select 'planning inputs are read as the person who turned drafts on',
  pg_temp.v('ctx_a') ->> 'userId' = 'a0000000-0000-0000-0000-0000000000a1';
insert into results select 'inputs include everyone''s allergies and readable recipes',
  pg_temp.v('ctx_a') #> '{profile,householdDiet,allergies}' ? 'peanut' and jsonb_array_length(pg_temp.v('ctx_a') -> 'recipeIds') > 0;
insert into results select 'acting as a member does not outlast the call', public.cart_is_server();

insert into results select 'a confirmed week is skipped, not drafted',
  public.planning_job_context((pg_temp.v('job_d') #>> '{}')::uuid) ? 'skip';
select public.stop_planning_job((pg_temp.v('job_d') #>> '{}')::uuid, 'Next week is already confirmed.', true);

-- Draft Alice's week.
insert into vars select 'plan_a', jsonb_build_object(
  'weekStart', pg_temp.v('ctx_a') ->> 'weekStart', 'mode', 'balanced', 'generatedBy', 'rules',
  'summary', 'Five easy dinners.', 'confirmedAt', now(),
  'meals', jsonb_build_array(jsonb_build_object('date', pg_temp.v('ctx_a') ->> 'weekStart', 'recipeId', pg_temp.v('recipe') #>> '{}', 'servings', 2, 'note', 'Uses your spinach')));
insert into vars select 'done_a', public.finish_planning_job((pg_temp.v('job_a') #>> '{}')::uuid, pg_temp.v('plan_a'), '{"message":"Drafted 1 dinner.","source":"rules","useSoon":["spinach"]}');
insert into results select 'an empty week gets the draft', pg_temp.v('done_a') ->> 'status' = 'drafted';
insert into results select 'the draft is never confirmed by the job',
  (select confirmed_at is null and status = 'draft' and generated_by = 'rules' from public.meal_plans where id = (pg_temp.v('done_a') ->> 'mealPlanId')::uuid);
insert into results select 'phone notifications go only to people who turned them on',
  pg_temp.v('done_a') -> 'pushUsers' = '["b0000000-0000-0000-0000-0000000000b2"]'::jsonb;
do $$ begin
  perform public.finish_planning_job((pg_temp.v('job_a') #>> '{}')::uuid, pg_temp.v('plan_a'), '{}');
  insert into results values ('a finished job cannot be finished twice', false);
exception when others then insert into results values ('a finished job cannot be finished twice', true);
end $$;

-- Carol's job: inputs read, then she starts planning by hand before it finishes.
insert into vars select 'ctx_c', public.planning_job_context((pg_temp.v('job_c') #>> '{}')::uuid);
reset role;
set role authenticated;
select set_config('request.jwt.claim.role', '', true);
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select public.save_meal_plan(jsonb_build_object('weekStart', pg_temp.v('ctx_c') ->> 'weekStart', 'mode', 'balanced', 'generatedBy', 'manual',
  'meals', jsonb_build_array(jsonb_build_object('date', pg_temp.v('ctx_c') ->> 'weekStart', 'customTitle', 'Carol''s curry', 'servings', 2)))) is not null;
reset role;
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
insert into results select 'a week someone started meanwhile is left alone',
  public.finish_planning_job((pg_temp.v('job_c') #>> '{}')::uuid,
    jsonb_build_object('weekStart', pg_temp.v('ctx_c') ->> 'weekStart', 'mode', 'balanced', 'generatedBy', 'rules',
      'meals', jsonb_build_array(jsonb_build_object('date', pg_temp.v('ctx_c') ->> 'weekStart', 'recipeId', pg_temp.v('recipe') #>> '{}', 'servings', 2))),
    '{"message":"Drafted"}') ->> 'status' = 'skipped';
insert into results select 'Carol''s own plan is untouched',
  (select bool_and(pm.custom_title = 'Carol''s curry') and count(*) = 1 from public.planned_meals pm join public.meal_plans mp on mp.id = pm.meal_plan_id
   where mp.household_id = (select household_id from public.household_members where user_id = 'c0000000-0000-0000-0000-0000000000c3'));
insert into results select 'Dan''s confirmed week still has his meal',
  (select count(*) = 1 from public.planned_meals pm join public.meal_plans mp on mp.id = pm.meal_plan_id
   where mp.household_id = (select household_id from public.household_members where user_id = 'd0000000-0000-0000-0000-0000000000d4') and mp.confirmed_at is not null);

-- Members see the result; notices follow each person's preference.
reset role;
set role authenticated;
select set_config('request.jwt.claim.role', '', true);
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'Alice gets an in-app notice that links to the week',
  (select count(*) = 1 and bool_and(link like '/plan?week=%') from public.notifications);
insert into results select 'members see what the job did', (select status = 'drafted' from public.planning_jobs);
update public.notifications set read_at = now();
insert into results select 'a person can mark their notice read', (select bool_and(read_at is not null) from public.notifications);
do $$ begin
  update public.notifications set title = 'Hacked';
  insert into results values ('notice text cannot be changed by the reader', false);
exception when insufficient_privilege then insert into results values ('notice text cannot be changed by the reader', true);
end $$;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
insert into results select 'Bob turned in-app notices off, so he has none', (select count(*) = 0 from public.notifications);
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
insert into results select 'other households cannot see the job', (select count(*) = 1 and bool_and(status = 'skipped') from public.planning_jobs);

-- A phone's address can't be taken while Bob is using it (see the cooking
-- mode migration); once he signs out it follows whoever signs in.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'Alice can''t take Bob''s address while he uses it', not public.register_push_token('ExponentPushToken[bobsPhone123456]', 'ios') and (select count(*) = 0 from public.push_tokens);
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
select public.unregister_push_token('ExponentPushToken[bobsPhone123456]');
insert into results select 'Bob signing out removes his address', (select count(*) = 0 from public.push_tokens);
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'then Alice signing in on the phone gets it', public.register_push_token('ExponentPushToken[bobsPhone123456]', 'ios');
insert into results select 'and it is now hers', (select count(*) = 1 from public.push_tokens);
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000b2');
do $$ begin
  perform public.register_push_token('https://evil.example/hook', 'ios');
  insert into results values ('only Expo phone addresses are accepted', false);
exception when check_violation then insert into results values ('only Expo phone addresses are accepted', true);
end $$;

-- Turning drafts off clears who they were planned as.
select pg_temp.as_user('a0000000-0000-0000-0000-0000000000a1');
insert into results select 'turning drafts off is saved',
  (public.save_weekly_planning('{"enabled":false,"runDay":6,"runHour":9,"timeZone":"America/Chicago","mode":"balanced"}') ->> 'enabled')::boolean = false;
insert into results select 'and nobody is recorded as having them on', (select enabled_by is null from public.weekly_planning_settings);

reset role;
select name, ok from results;
rollback;
