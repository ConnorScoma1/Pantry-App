-- Recipe library smoke test: search filters and visibility, facets, the
-- server-only import, review rules and saved menus. Needs seed_recipes.sql.
-- Rolls back.
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'alice@example.com'),
  ('b0000000-0000-0000-0000-0000000000b2', 'bob@example.com');
create temp table results (name text, ok boolean);
create temp table vars (k text primary key, v jsonb);
grant all on results, vars to authenticated;
create temp table profile_body as select '{
  "household": {"country":"US","postalCode":"53132","adults":2,"children":0,"cookingFor":2,"dinnersPerWeek":5,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":12000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 3, "equipment": ["stove","oven"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb as body;
grant all on profile_body to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile((select body from profile_body)) is not null;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-0000000000b2', true);
select public.save_onboarding_profile((select body from profile_body)) is not null;
-- Bob's household has a private recipe that Alice must never find.
insert into public.recipes (source_id, household_id, visibility, title, slug, cuisine, skill_level, servings, status)
select (select id from public.recipe_sources where name = 'Household recipes'), public.current_household_id(), 'household', 'Bob''s Secret Thai Noodles', 'bobs-secret', 'thai', 2, 4, 'pending_review';
insert into vars select 'bob_recipe', to_jsonb(id) from public.recipes where slug = 'bobs-secret';
insert into results select 'a household finds its own recipe', exists (select 1 from public.search_recipes('{"text":"secret thai noodles"}') s join public.recipes r on r.id = s.recipe_id where r.slug = 'bobs-secret');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
insert into results select 'search never returns another household''s recipe', not exists (select 1 from public.search_recipes('{"text":"secret","limit":100}') s join public.recipes r on r.id = s.recipe_id where r.slug = 'bobs-secret');

-- Filters.
insert into results select 'cuisine filter', (select bool_and(r.cuisine = 'thai') and count(*) >= 4 from public.search_recipes('{"cuisines":["thai"],"limit":100}') s join public.recipes r on r.id = s.recipe_id);
insert into results select 'dish ideas are left out unless asked for', (select bool_and(r.status <> 'idea') from public.search_recipes('{"limit":100}') s join public.recipes r on r.id = s.recipe_id)
  and exists (select 1 from public.search_recipes('{"statuses":["idea"],"cuisines":["mexican"]}') s join public.recipes r on r.id = s.recipe_id where r.title = 'Mole Poblano');
insert into results select 'allergen exclusion', (select bool_and(not (r.allergens && array['peanut','shellfish'])) from public.search_recipes('{"excludeAllergens":["peanut","shellfish"],"limit":100}') s join public.recipes r on r.id = s.recipe_id)
  and not exists (select 1 from public.search_recipes('{"excludeAllergens":["peanut"],"text":"pad thai"}') s join public.recipes r on r.id = s.recipe_id where r.dish_key = 'pad-thai');
insert into results select 'diet tags must all match', (select bool_and(r.diet_tags @> array['vegan']) and count(*) > 0 from public.search_recipes('{"diet":["vegan"],"limit":100}') s join public.recipes r on r.id = s.recipe_id);
insert into results select 'equipment the household has (with stand-ins)', (select bool_and(r.required_equipment <@ public.equipment_covered(array['stove','oven'])) and bool_or('air_fryer' = any(public.equipment_covered(array['oven']))) from public.search_recipes('{"equipment":["stove","oven"],"limit":100}') s join public.recipes r on r.id = s.recipe_id)
  and not exists (select 1 from public.search_recipes('{"equipment":["stove"],"limit":100}') s join public.recipes r on r.id = s.recipe_id where 'oven' = any(r.required_equipment));
insert into results select 'time, skill and course', (select bool_and(r.total_minutes <= 30 and r.skill_level <= 2 and r.course = 'side') from public.search_recipes('{"maxMinutes":30,"maxSkill":2,"courses":["side"],"limit":100}') s join public.recipes r on r.id = s.recipe_id);
insert into results select 'ingredient search', exists (select 1 from public.search_recipes('{"ingredients":["chicken thigh"],"limit":100}') s join public.recipes r on r.id = s.recipe_id where r.dish_key = 'chicken-adobo');
insert into results select 'text search ranks the title first', (select r.dish_key from public.search_recipes('{"text":"carbonara"}') s join public.recipes r on r.id = s.recipe_id limit 1) = 'carbonara';
insert into results select 'regions', (select bool_and(r.cuisine = any(public.cuisines_in_regions(array['africa']))) and count(*) >= 2 from public.search_recipes('{"regions":["africa"],"limit":100}') s join public.recipes r on r.id = s.recipe_id);
insert into results select 'pages and total', (select count(*) = 5 and min(total) > 5 from public.search_recipes('{"limit":5,"seed":"a"}'))
  and not exists (select recipe_id from public.search_recipes('{"limit":5,"seed":"a"}') intersect select recipe_id from public.search_recipes('{"limit":5,"offset":5,"seed":"a"}'));
insert into results select 'facets count complete recipes and ideas', (select (f ->> 'complete')::int >= 200 and (f ->> 'ideas')::int >= 150 and (f -> 'cuisines' ->> 'thai')::int >= 4 from public.recipe_library_facets() f);
do $$ begin
  perform public.search_recipes('{"maxMinutes":"lots"}');
  insert into results values ('bad filter values are rejected', false);
exception when others then insert into results values ('bad filter values are rejected', true);
end $$;

-- AI drafts for one household.
create temp table draft as select jsonb_build_object(
  'variantOf', (select id from public.recipes where dish_key = 'pad-thai' and visibility = 'public' limit 1), 'variant', 'simplified',
  'status', 'tested', 'title', 'Simple Pad Thai', 'slug', 'simple-pad-thai-abc123', 'cuisine', 'thai', 'skillLevel', 2,
  'prepMinutes', 20, 'cookMinutes', 10, 'totalMinutes', 30, 'servings', 4, 'course', 'main', 'equipment', '["stove"]'::jsonb,
  'categories', '["dinner"]'::jsonb, 'methods', '["stir_fry"]'::jsonb, 'flavors', '[]'::jsonb, 'occasions', '[]'::jsonb, 'dishKey', 'pad-thai',
  'allergens', '["shellfish","fish"]'::jsonb, 'proteins', '["shellfish"]'::jsonb, 'dietTags', '[]'::jsonb, 'core', '["rice noodle"]'::jsonb,
  'ingredients', '[{"position":1,"rawText":"8 oz rice noodles","item":"rice noodles","quantity":8,"unit":"oz"},{"position":2,"rawText":"12 oz shrimp","item":"shrimp","quantity":12,"unit":"oz"}]'::jsonb,
  'steps', '[{"position":1,"body":"Soak the noodles until bendy."},{"position":2,"body":"Stir-fry the shrimp until opaque.","safeInternalTempC":62.8}]'::jsonb) as body;
grant all on draft to authenticated;
insert into vars select 'draft', to_jsonb(public.save_household_recipe((select body from draft)));
insert into results select 'a draft is saved for the household, never as tested', (select status = 'pending_review' and visibility = 'household' and variant = 'simplified' from public.recipes where id = (select (v #>> '{}')::uuid from vars where k = 'draft'));
insert into results select 'asking again returns the same draft', public.save_household_recipe((select body from draft)) = (select (v #>> '{}')::uuid from vars where k = 'draft');
do $$ begin
  perform public.save_household_recipe((select body from draft) || jsonb_build_object('variantOf', (select v #>> '{}' from vars where k = 'bob_recipe')));
  insert into results values ('drafts can''t be versions of another household''s recipe', false);
exception when insufficient_privilege then insert into results values ('drafts can''t be versions of another household''s recipe', true);
end $$;

-- Hardening: bounded search input, member writes, hidden reservations.
do $$ begin
  perform public.search_recipes(jsonb_build_object('ingredients', to_jsonb(array['a','b','c','d','e','f'])));
  insert into results values ('oversized search filters are refused', false);
exception when check_violation then insert into results values ('oversized search filters are refused', true);
end $$;
do $$ begin
  perform public.search_recipes(jsonb_build_object('ingredients', jsonb_build_array(repeat('%_', 500))));
  insert into results values ('long search terms are refused', false);
exception when check_violation then insert into results values ('long search terms are refused', true);
end $$;
insert into results select 'long text is cut, not searched in full', (select count(*) >= 0 from public.search_recipes(jsonb_build_object('text', repeat('chicken ', 20000))));
do $$ begin
  perform public.save_menu('{"templateCode":"x","title":"No courses","guests":2}'::jsonb);
  insert into results values ('a menu without courses is refused', false);
exception when check_violation then insert into results values ('a menu without courses is refused', true);
end $$;
update public.recipes set status = 'tested', reviewed_by = 'Me', reviewed_at = now() where id = (select (v #>> '{}')::uuid from vars where k = 'draft');
insert into results select 'members can''t mark their own recipes tested', (select status = 'pending_review' and reviewed_by is null from public.recipes where id = (select (v #>> '{}')::uuid from vars where k = 'draft'));
insert into public.recipes (source_id, household_id, visibility, title, slug, cuisine, skill_level, servings)
select (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), public.current_household_id(), 'household', 'Copycat', (select slug from public.recipes where dish_key = 'carbonara' and visibility = 'public' limit 1), 'italian', 2, 4;
insert into results select 'a household copy can''t take a public slug or source', (select slug <> (select slug from public.recipes where dish_key = 'carbonara' and visibility = 'public' limit 1) and source_id = (select id from public.recipe_sources where name = 'Household recipes') from public.recipes where title = 'Copycat');
do $$ begin
  insert into public.recipes (source_id, household_id, visibility, title, slug, cuisine, skill_level, servings, variant_of)
  select (select id from public.recipe_sources where name = 'Household recipes'), public.current_household_id(), 'household', 'Probe', 'probe-1', 'thai', 2, 4, (select (v #>> '{}')::uuid from vars where k = 'bob_recipe');
  insert into results values ('versions of unreadable recipes are refused', false);
exception when insufficient_privilege then insert into results values ('versions of unreadable recipes are refused', true);
end $$;
insert into vars select 'slot', to_jsonb(public.reserve_ai_request('recipe_draft', 5));
insert into results select 'in-progress AI reservations are hidden', not exists (select 1 from public.ai_usage where id = (select (v #>> '{}')::uuid from vars where k = 'slot'))
  and public.ai_requests_last_day('recipe_draft') = 1;
insert into results select 'the draft lookup is this household''s AI draft', public.find_household_draft((select id from public.recipes where dish_key = 'pad-thai' and visibility = 'public' limit 1), 'simplified') = (select (v #>> '{}')::uuid from vars where k = 'draft');

-- Import is server only.
do $$ begin
  perform public.import_recipe_batch('{"source":{"name":"X","kind":"partner","license":"owned"},"recipes":[]}');
  insert into results values ('members cannot import recipes', false);
exception when insufficient_privilege then insert into results values ('members cannot import recipes', true);
end $$;

-- Saved menus.
insert into vars select 'menu', to_jsonb(public.save_menu(jsonb_build_object(
  'templateCode', 'steakhouse', 'title', 'Steakhouse Dinner', 'guests', 6,
  'courses', jsonb_build_array(
    jsonb_build_object('course', 'main', 'label', 'Prime rib roast', 'recipeId', (select id from public.recipes where dish_key = 'prime-rib' limit 1)),
    jsonb_build_object('course', 'side', 'label', 'Horseradish cream', 'recipeId', null)))));
insert into results select 'a menu is saved with its courses', (select count(*) = 2 from public.menu_courses where menu_id = (select (v #>> '{}')::uuid from vars where k = 'menu'));
do $$ begin
  perform public.save_menu(jsonb_build_object('templateCode', 'x', 'title', 'Sneaky', 'guests', 2,
    'courses', jsonb_build_array(jsonb_build_object('course', 'main', 'label', 'Bob''s', 'recipeId', (select v #>> '{}' from vars where k = 'bob_recipe')))));
  insert into results values ('menus can''t use another household''s recipe', false);
exception when insufficient_privilege then insert into results values ('menus can''t use another household''s recipe', true);
end $$;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-0000000000b2', true);
insert into results select 'other households can''t see a menu', not exists (select 1 from public.menus) and not exists (select 1 from public.menu_courses);
insert into results select 'other households can''t see a draft', not exists (select 1 from public.recipes where id = (select (v #>> '{}')::uuid from vars where k = 'draft'));
do $$ begin
  perform public.save_menu(jsonb_build_object('id', (select v #>> '{}' from vars where k = 'menu'), 'templateCode', 'x', 'title', 'Taken', 'guests', 2,
    'courses', jsonb_build_array(jsonb_build_object('course', 'main', 'label', 'x'))));
  insert into results values ('another household can''t overwrite a menu', false);
exception when insufficient_privilege then insert into results values ('another household can''t overwrite a menu', true);
end $$;
reset role;

-- As the server: import, review rules, never overwriting another source's recipe.
select set_config('request.jwt.claim.role', 'service_role', true);
insert into vars select 'import', public.import_recipe_batch(jsonb_build_object(
  'file', 'partner.json', 'received', 2, 'rejected', 1,
  'source', jsonb_build_object('name', 'Example Partner', 'kind', 'partner', 'license', 'licensed:example-partner'),
  'recipes', jsonb_build_array(jsonb_build_object(
    'id', '11111111-2222-4333-8444-555555555555', 'externalId', 'p-1', 'title', 'Partner Lentil Soup', 'slug', 'partner-lentil-soup-111111',
    'cuisine', 'turkish', 'skillLevel', 1, 'prepMinutes', 10, 'cookMinutes', 30, 'totalMinutes', 40, 'servings', 4, 'course', 'main',
    'equipment', jsonb_build_array('stove'), 'tags', '[]'::jsonb, 'tips', '[]'::jsonb, 'status', 'tested', 'review', jsonb_build_object('by', 'Partner Bot', 'at', '2026-11-01'),
    'categories', jsonb_build_array('soup', 'dinner'), 'methods', jsonb_build_array('stew'), 'flavors', '[]'::jsonb, 'occasions', '[]'::jsonb,
    'dishKey', 'mercimek-corbasi', 'variant', 'classic', 'license', 'licensed:example-partner', 'allergens', '[]'::jsonb,
    'proteins', jsonb_build_array('beans'), 'dietTags', jsonb_build_array('vegan'), 'core', jsonb_build_array('red lentil'),
    'ingredients', jsonb_build_array(jsonb_build_object('position', 1, 'rawText', '1 cup red lentils', 'item', 'red lentils', 'quantity', 1, 'unit', 'cup')),
    'steps', jsonb_build_array(jsonb_build_object('position', 1, 'body', 'Simmer the lentils until soft.'))),
    jsonb_build_object('id', (select v #>> '{}' from vars where k = 'bob_recipe'), 'externalId', 'steal', 'title', 'Hijack', 'slug', 'hijack-1',
      'cuisine', 'thai', 'skillLevel', 1, 'servings', 4, 'course', 'main', 'status', 'pending_review', 'variant', 'classic', 'license', 'owned'))));
insert into results select 'import inserts and reports', (select (v ->> 'inserted')::int = 1 and (v ->> 'skipped')::int = 1 from vars where k = 'import')
  and (select received = 2 and rejected = 2 from public.recipe_import_batches order by created_at desc limit 1);
insert into results select 'feeds can''t mark recipes tested', (select status = 'pending_review' and reviewed_by is null from public.recipes where slug = 'partner-lentil-soup-111111');
insert into results select 'import never overwrites a household recipe', (select title = 'Bob''s Secret Thai Noodles' from public.recipes where slug = 'bobs-secret');
do $$ begin
  perform public.import_recipe_batch('{"source":{"name":"Kitchen Pantry Test Kitchen","kind":"original","license":"owned"},"recipes":[]}');
  insert into results values ('feeds can''t use a built-in source name', false);
exception when check_violation then insert into results values ('feeds can''t use a built-in source name', true);
end $$;
do $$ begin
  perform public.import_recipe_batch('{"source":{"name":"Example Partner","kind":"original","license":"owned"},"recipes":[]}');
  insert into results values ('feeds can''t borrow an existing source with another licence', false);
exception when check_violation then insert into results values ('feeds can''t borrow an existing source with another licence', true);
end $$;
insert into results select 'a new source stays hidden until approved', not (select is_approved from public.recipe_sources where name = 'Example Partner');
do $$ begin
  update public.recipes set status = 'tested' where slug = 'partner-lentil-soup-111111';
  insert into results values ('tested needs a named reviewer', false);
exception when check_violation then insert into results values ('tested needs a named reviewer', true);
end $$;
update public.recipes set status = 'reviewed', reviewed_by = 'Connor', reviewed_at = now() where slug = 'partner-lentil-soup-111111';
insert into results select 'search document follows the title', exists (select 1 from public.recipes where slug = 'partner-lentil-soup-111111' and search_document @@ websearch_to_tsquery('english', 'lentil soup'));

select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-0000000000a1', true);
set role authenticated;
insert into results select 'unapproved sources are not searchable', not exists (select 1 from public.search_recipes('{"text":"partner lentil"}'));
reset role;
select name, ok from results;
rollback;
