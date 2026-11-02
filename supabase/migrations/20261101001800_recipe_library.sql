-- =============================================================================
-- Recipe library (spec 08, milestone 18).
--
-- Review before applying. Adds columns, tables, indexes and functions;
-- nothing is deleted. Existing recipes become "not yet reviewed"
-- (pending_review): nobody has signed them off as tested yet.
--
--   * recipes: status (tested / reviewed / pending_review / idea / retired),
--     more courses (side, starter, sauce, breakfast), categories, methods,
--     flavours, occasions, region, authenticity, dish key and version,
--     storage and safety notes, text licence and attribution, reviewer —
--     plus facts worked out at import for fast filtering: allergens,
--     proteins, diet tags and core ingredients, and a full-text document.
--   * search_recipes(query): the library search behind "Explore". Filters
--     run in SQL with indexes; only recipes the caller may read come back
--     (public recipes from approved sources, and their own household's).
--   * recipe_library_facets(): counts for the filter chips.
--   * recipe_import_batches + import_recipe_batch(batch): the server-only
--     bulk import, with a report of what was accepted, updated and rejected.
--     Imports run from scripts/recipes (dry run by default), never on start-up.
--   * menus + menu_courses + save_menu(menu): a household's saved menus.
--   * save_household_recipe(recipe): AI drafts (a simpler / budget /
--     elevated / traditional version, or a full recipe for a dish idea),
--     saved only for the household that asked, always "pending_review";
--     ai_usage gets a 'recipe_draft' feature with its own daily limit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Recipes: library columns
-- -----------------------------------------------------------------------------
alter table public.recipes drop constraint if exists recipes_course_check;
alter table public.recipes
  add constraint recipes_course_check check (course in ('main', 'side', 'starter', 'sauce', 'breakfast', 'dessert'));

alter table public.recipes
  add column status text not null default 'pending_review'
    check (status in ('tested', 'reviewed', 'pending_review', 'idea', 'retired')),
  add column categories text[] not null default '{}',
  add column methods text[] not null default '{}',
  add column flavors text[] not null default '{}',
  add column occasions text[] not null default '{}',
  add column region text check (char_length(region) <= 60),
  add column authenticity text check (authenticity in ('traditional', 'regional', 'adapted', 'fusion')),
  add column dish_key text check (dish_key ~ '^[a-z0-9-]{1,60}$'),
  add column variant text not null default 'classic' check (variant in ('classic', 'simplified', 'budget', 'elevated')),
  add column variant_of uuid references public.recipes (id) on delete set null,
  add column storage_notes text check (char_length(storage_notes) <= 400),
  add column safety_note text check (char_length(safety_note) <= 400),
  add column text_license text check (text_license ~* '^(owned|public-domain|cc0|cc-by-4\.0|cc-by-sa-4\.0|licensed:[a-z0-9][a-z0-9 ._-]{1,60}|unknown)$'),
  add column attribution text check (char_length(attribution) <= 300),
  add column reviewed_by text check (char_length(reviewed_by) <= 80),
  add column reviewed_at timestamptz,
  add column nutrition_source text check (char_length(nutrition_source) <= 80),
  -- Worked out from the ingredients at import time (recipe-engine library/facets.ts).
  add column allergens text[] not null default '{}',
  add column proteins text[] not null default '{}',
  add column diet_tags text[] not null default '{}',
  add column core_ingredients text[] not null default '{}',
  add column fingerprint text check (char_length(fingerprint) <= 2000),
  add column search_document tsvector,
  -- Nothing is "tested" or "reviewed" without a named reviewer.
  add constraint recipes_reviewed_has_reviewer check (status not in ('tested', 'reviewed') or (reviewed_by is not null and reviewed_at is not null)),
  -- Nutrition is shown only when we know how it was worked out.
  add constraint recipes_nutrition_has_source check (calories_per_serving is null or nutrition_source is not null);

update public.recipes set text_license = 'owned'
where text_license is null and source_id in (select id from public.recipe_sources where kind = 'original');

-- Search text: title and dish weigh most, then cuisine/region/ingredients, then the rest.
create or replace function public.recipes_search_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', replace(coalesce(new.dish_key, ''), '-', ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.cuisine, '') || ' ' || coalesce(new.region, '') || ' ' || array_to_string(new.core_ingredients, ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(new.tags, ' ') || ' ' || replace(array_to_string(new.categories, ' '), '_', ' ') || ' ' || replace(array_to_string(new.methods, ' '), '_', ' ')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'D');
  return new;
end;
$$;
create trigger recipes_search_document
  before insert or update of title, dish_key, cuisine, region, core_ingredients, tags, categories, methods, description
  on public.recipes
  for each row execute function public.recipes_search_document();
update public.recipes set title = title; -- fill search_document for existing rows

create index recipes_search_idx on public.recipes using gin (search_document);
create index recipes_status_course_idx on public.recipes (status, course, cuisine);
create index recipes_dish_idx on public.recipes (dish_key);
create index recipes_categories_idx on public.recipes using gin (categories);
create index recipes_allergens_idx on public.recipes using gin (allergens);
create index recipes_proteins_idx on public.recipes using gin (proteins);
create index recipes_diet_idx on public.recipes using gin (diet_tags);
create index recipes_core_idx on public.recipes using gin (core_ingredients);
create index recipes_occasions_idx on public.recipes using gin (occasions);

-- -----------------------------------------------------------------------------
-- Search
-- -----------------------------------------------------------------------------
-- What the household owns, plus what it can stand in for (mirrors
-- EQUIPMENT_ALTERNATIVES in recipe-engine eligibility.ts).
create or replace function public.equipment_covered(have text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select unnest(have) as x
    union
    select req from (values
      ('air_fryer', 'oven'), ('slow_cooker', 'dutch_oven'), ('slow_cooker', 'pressure_cooker'),
      ('pressure_cooker', 'dutch_oven'), ('pressure_cooker', 'slow_cooker'), ('cast_iron', 'stove'),
      ('dutch_oven', 'slow_cooker'), ('grill', 'cast_iron'), ('grill', 'oven'),
      ('food_processor', 'blender'), ('blender', 'food_processor'), ('microwave', 'stove')
    ) as alt(req, owned)
    where owned = any(have)
  ) t;
$$;

-- A text array from a jsonb array, refusing oversized input (the app's own
-- limits are in packages/validation/src/library.ts; this repeats them for
-- anyone calling the API directly).
create or replace function public.bounded_text_array(value jsonb, max_items integer, max_len integer)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  out text[];
begin
  if value is null or jsonb_typeof(value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > max_items then
    raise exception 'Search filter too large' using errcode = 'check_violation';
  end if;
  select array_agg(x) into out from jsonb_array_elements_text(value) x;
  if exists (select 1 from unnest(coalesce(out, '{}')) x where char_length(x) > max_len) then
    raise exception 'Search filter too large' using errcode = 'check_violation';
  end if;
  return coalesce(out, '{}');
end;
$$;
revoke all on function public.bounded_text_array(jsonb, integer, integer) from public, anon;
grant execute on function public.bounded_text_array(jsonb, integer, integer) to authenticated, service_role;

-- The library search (same filters as LibraryQuery in recipe-engine
-- library/search.ts). Returns ids in order with the total; the app then
-- loads those rows (RLS applies) and ranks them for the household. Every
-- input is bounded before it's used, so a direct API call can't make it slow.
create or replace function public.search_recipes(query jsonb)
returns table (recipe_id uuid, rank real, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  q text := left(nullif(btrim(coalesce(query ->> 'text', '')), ''), 200);
  q_like text := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  tsq tsquery := case when q is null then null else websearch_to_tsquery('english', q) end;
  lim integer := least(greatest(coalesce((query ->> 'limit')::integer, 24), 1), 400);
  off integer := least(greatest(coalesce((query ->> 'offset')::integer, 0), 0), 10000);
  sort text := coalesce(query ->> 'sort', case when q is null then 'rotate' else 'relevance' end);
  seed text := left(coalesce(query ->> 'seed', ''), 80);
  statuses text[] := coalesce(
    (select array_agg(x) from unnest(public.bounded_text_array(query -> 'statuses', 4, 20)) x where x in ('tested', 'reviewed', 'pending_review', 'idea')),
    array['tested', 'reviewed', 'pending_review']
  );
  f_cuisines text[] := public.bounded_text_array(query -> 'cuisines', 40, 40);
  f_regions text[] := public.bounded_text_array(query -> 'regions', 7, 20);
  f_categories text[] := public.bounded_text_array(query -> 'categories', 20, 40);
  f_proteins text[] := public.bounded_text_array(query -> 'proteins', 20, 40);
  f_methods text[] := public.bounded_text_array(query -> 'methods', 20, 40);
  f_flavors text[] := public.bounded_text_array(query -> 'flavors', 20, 40);
  f_courses text[] := public.bounded_text_array(query -> 'courses', 20, 40);
  f_authenticity text[] := public.bounded_text_array(query -> 'authenticity', 4, 20);
  f_variants text[] := public.bounded_text_array(query -> 'variants', 4, 20);
  f_occasions text[] := public.bounded_text_array(query -> 'occasions', 10, 40);
  f_diet text[] := public.bounded_text_array(query -> 'diet', 5, 20);
  f_allergens text[] := public.bounded_text_array(query -> 'excludeAllergens', 10, 20);
  f_ingredients text[] := (select array_agg(lower(x)) from unnest(public.bounded_text_array(query -> 'ingredients', 5, 60)) x);
  f_needs text[] := public.bounded_text_array(query -> 'needsEquipment', 5, 40);
  f_exclude uuid[] := (select array_agg(x::uuid) from unnest(public.bounded_text_array(query -> 'excludeIds', 200, 36)) x);
  have text[] := case when query ? 'equipment' then public.equipment_covered(public.bounded_text_array(query -> 'equipment', 20, 40)) end;
  min_skill smallint := (query ->> 'minSkill')::smallint;
  max_skill smallint := (query ->> 'maxSkill')::smallint;
  max_minutes smallint := (query ->> 'maxMinutes')::smallint;
  region_cuisines text[] := case when f_regions is null then null else public.cuisines_in_regions(f_regions) end;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  return query
  with mine as (
    select household_id from public.household_members where user_id = uid
  ), hits as (
    select r.id, r.title, r.total_minutes,
      case when tsq is null then 0::real
           else (ts_rank(r.search_document, tsq) + case when r.title ilike '%' || q_like || '%' then 1 else 0 end)::real
      end as score
    from public.recipes r
    join public.recipe_sources s on s.id = r.source_id
    where ((r.visibility = 'public' and s.is_approved) or (r.visibility = 'household' and r.household_id in (select household_id from mine)))
      and r.status = any(statuses)
      and (tsq is null or r.search_document @@ tsq or r.title operator(extensions.%) q)
      and (f_cuisines is null or r.cuisine = any(f_cuisines))
      and (f_categories is null or r.categories && f_categories)
      and (f_proteins is null or r.proteins && f_proteins)
      and (f_methods is null or r.methods && f_methods)
      and (f_flavors is null or r.flavors && f_flavors)
      and (f_courses is null or r.course = any(f_courses))
      and (f_authenticity is null or r.authenticity = any(f_authenticity))
      and (f_variants is null or r.variant = any(f_variants))
      and (f_occasions is null or r.occasions && f_occasions)
      and (f_diet is null or r.diet_tags @> f_diet)
      and (f_allergens is null or not (r.allergens && f_allergens))
      and (f_ingredients is null or exists (
            select 1 from unnest(f_ingredients) want, unnest(r.core_ingredients) c
            where strpos(c, want) > 0 or strpos(want, c) > 0))
      and (f_needs is null or r.required_equipment @> f_needs)
      and (have is null or r.required_equipment <@ have)
      and (f_exclude is null or r.id <> all(f_exclude))
      and (min_skill is null or r.skill_level >= min_skill)
      and (max_skill is null or r.skill_level <= max_skill)
      and (max_minutes is null or r.total_minutes <= max_minutes)
      and (region_cuisines is null or r.cuisine = any(region_cuisines))
  )
  select h.id, h.score, count(*) over ()
  from hits h
  order by
    case when sort = 'relevance' then -h.score end,
    case when sort = 'quickest' then h.total_minutes end,
    case when sort = 'rotate' then md5(seed || h.id::text) end,
    h.title
  limit lim offset off;
end;
$$;
revoke all on function public.search_recipes(jsonb) from public, anon;
grant execute on function public.search_recipes(jsonb) to authenticated;

-- Cuisine codes by region (mirrors worldCuisines in shared-types library.ts).
create or replace function public.cuisines_in_regions(regions text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(code), '{}') from (values
    ('american','americas'),('southern','americas'),('cajun_creole','americas'),('tex_mex','americas'),('hawaiian','americas'),
    ('canadian','americas'),('mexican','americas'),('caribbean','americas'),('jamaican','americas'),('cuban','americas'),
    ('puerto_rican','americas'),('peruvian','americas'),('argentine','americas'),('brazilian','americas'),('colombian','americas'),
    ('venezuelan','americas'),('salvadoran','americas'),
    ('italian','europe'),('french','europe'),('spanish','europe'),('portuguese','europe'),('greek','europe'),('british','europe'),
    ('irish','europe'),('german','europe'),('austrian','europe'),('swiss','europe'),('scandinavian','europe'),('polish','europe'),
    ('hungarian','europe'),('ukrainian','europe'),('russian','europe'),('georgian','europe'),
    ('mediterranean','mena'),('middle_eastern','mena'),('lebanese','mena'),('turkish','mena'),('persian','mena'),('israeli','mena'),
    ('moroccan','mena'),('egyptian','mena'),('tunisian','mena'),
    ('ethiopian','africa'),('nigerian','africa'),('ghanaian','africa'),('senegalese','africa'),('kenyan','africa'),('south_african','africa'),
    ('chinese','asia'),('sichuan','asia'),('cantonese','asia'),('taiwanese','asia'),('japanese','asia'),('korean','asia'),('thai','asia'),
    ('vietnamese','asia'),('filipino','asia'),('indonesian','asia'),('malaysian','asia'),('singaporean','asia'),('burmese','asia'),
    ('cambodian','asia'),('laotian','asia'),('indian','asia'),('pakistani','asia'),('bangladeshi','asia'),('sri_lankan','asia'),
    ('nepali','asia'),('afghan','asia'),('uzbek','asia'),
    ('australian','oceania'),('pacific_islands','oceania'),
    ('jewish','global'),('seafood','global'),('fusion','global')
  ) as c(code, region)
  where region = any(regions);
$$;

-- Counts for the filter chips: how many complete recipes and ideas per cuisine and category.
create or replace function public.recipe_library_facets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select r.cuisine, r.categories, r.status
    from public.recipes r
    join public.recipe_sources s on s.id = r.source_id
    where ((r.visibility = 'public' and s.is_approved)
       or (r.visibility = 'household' and public.is_household_member(r.household_id)))
      and r.status <> 'retired'
  )
  select jsonb_build_object(
    'complete', (select count(*) from visible where status <> 'idea'),
    'ideas', (select count(*) from visible where status = 'idea'),
    'cuisines', coalesce((select jsonb_object_agg(cuisine, n) from (select cuisine, count(*) n from visible where cuisine is not null and status <> 'idea' group by cuisine) c), '{}'::jsonb),
    'categories', coalesce((select jsonb_object_agg(cat, n) from (select unnest(categories) cat, count(*) n from visible where status <> 'idea' group by 1) c), '{}'::jsonb)
  );
$$;
revoke all on function public.recipe_library_facets() from public, anon;
grant execute on function public.recipe_library_facets() to authenticated;

-- -----------------------------------------------------------------------------
-- Bulk import (server only)
-- -----------------------------------------------------------------------------
create table public.recipe_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.recipe_sources (id),
  file_name text check (char_length(file_name) <= 200),
  received integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  rejected integer not null default 0,
  -- Errors and warnings from the import tool (capped there), for review.
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.recipe_import_batches enable row level security;
revoke all on public.recipe_import_batches from anon, authenticated;

-- One batch of recipes that already passed prepareRecipe(), from
-- scripts/recipes/import.ts with the service role. Upserts by
-- (source, external_id); replaces ingredients and steps; never touches
-- ratings or favourites.
create or replace function public.import_recipe_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  src jsonb := batch -> 'source';
  sid uuid;
  rec jsonb;
  rid uuid;
  existed boolean;
  n_ins integer := 0;
  n_upd integer := 0;
  n_skip integer := 0;
  touched integer;
  bid uuid;
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can import recipes.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_typeof(batch -> 'recipes'), '') <> 'array' or jsonb_array_length(batch -> 'recipes') > 500 then
    raise exception 'A batch holds 1 to 500 recipes.' using errcode = 'check_violation';
  end if;
  -- Built-in sources are seeded, never imported into; an existing source must
  -- match the feed's kind and licence, so a feed can't borrow an approved name.
  if src ->> 'name' in ('Kitchen Pantry Test Kitchen', 'Household recipes', 'AI suggestions') then
    raise exception 'That source name is reserved.' using errcode = 'check_violation';
  end if;
  select id into sid from public.recipe_sources
  where name = src ->> 'name';
  if sid is not null and not exists (
    select 1 from public.recipe_sources where id = sid and kind = src ->> 'kind' and coalesce(license_notes, '') = coalesce(src ->> 'license', '')
  ) then
    raise exception 'A source with that name already exists with a different kind or licence.' using errcode = 'check_violation';
  end if;
  if sid is null then
    insert into public.recipe_sources (name, kind, website, license_notes, attribution_required, is_approved)
    values (src ->> 'name', src ->> 'kind', src ->> 'url', src ->> 'license', coalesce((src ->> 'attributionRequired')::boolean, true), false)
    returning id into sid;
  end if;
  -- A new source starts unapproved: its recipes stay hidden until someone approves it
  -- (update recipe_sources set is_approved = true where name = …) after checking the licence.

  for rec in select * from jsonb_array_elements(batch -> 'recipes') loop
    rid := (rec ->> 'id')::uuid;
    select exists (select 1 from public.recipes where id = rid) into existed;
    insert into public.recipes (
      id, source_id, external_id, source_url, visibility, title, slug, description, cuisine, skill_level,
      prep_minutes, cook_minutes, total_minutes, servings, course, dessert_category, chill_minutes, required_equipment,
      tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative,
      calories_per_serving, protein_g, carbs_g, fat_g, nutrition_source,
      status, categories, methods, flavors, occasions, region, authenticity, dish_key, variant, storage_notes, safety_note,
      text_license, attribution, reviewed_by, reviewed_at, allergens, proteins, diet_tags, core_ingredients, fingerprint, is_mock
    ) values (
      rid, sid, rec ->> 'externalId', rec ->> 'sourceUrl', 'public', rec ->> 'title', rec ->> 'slug', rec ->> 'description', rec ->> 'cuisine',
      (rec ->> 'skillLevel')::smallint, (rec ->> 'prepMinutes')::smallint, (rec ->> 'cookMinutes')::smallint, (rec ->> 'totalMinutes')::smallint,
      (rec ->> 'servings')::smallint, rec ->> 'course', rec ->> 'dessertCategory', coalesce((rec ->> 'chillMinutes')::smallint, 0),
      array(select jsonb_array_elements_text(rec -> 'equipment')), array(select jsonb_array_elements_text(rec -> 'tags')),
      array(select jsonb_array_elements_text(rec -> 'tips')),
      rec #>> '{image,url}', rec #>> '{image,alt}', rec #>> '{image,creditName}', rec #>> '{image,creditUrl}', rec #>> '{image,sourceUrl}',
      rec #>> '{image,license}', (rec #>> '{image,representative}')::boolean,
      (rec #>> '{nutrition,calories}')::integer, (rec #>> '{nutrition,proteinG}')::numeric, (rec #>> '{nutrition,carbsG}')::numeric,
      (rec #>> '{nutrition,fatG}')::numeric, rec #>> '{nutrition,source}',
      -- Feeds can't mark anything tested or reviewed; a person does that afterwards.
      case when rec ->> 'status' = 'idea' then 'idea' else 'pending_review' end,
      array(select jsonb_array_elements_text(rec -> 'categories')), array(select jsonb_array_elements_text(rec -> 'methods')),
      array(select jsonb_array_elements_text(rec -> 'flavors')), array(select jsonb_array_elements_text(rec -> 'occasions')),
      rec ->> 'region', rec ->> 'authenticity', rec ->> 'dishKey', rec ->> 'variant', rec ->> 'storage', rec ->> 'safetyNote',
      rec ->> 'license', rec ->> 'attribution', null, null,
      array(select jsonb_array_elements_text(rec -> 'allergens')), array(select jsonb_array_elements_text(rec -> 'proteins')),
      array(select jsonb_array_elements_text(rec -> 'dietTags')), array(select jsonb_array_elements_text(rec -> 'core')),
      rec ->> 'fingerprint', false
    )
    on conflict (id) do update set
      external_id = excluded.external_id, source_url = excluded.source_url, title = excluded.title, slug = excluded.slug,
      description = excluded.description, cuisine = excluded.cuisine, skill_level = excluded.skill_level,
      prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes, total_minutes = excluded.total_minutes,
      servings = excluded.servings, course = excluded.course, dessert_category = excluded.dessert_category,
      chill_minutes = excluded.chill_minutes, required_equipment = excluded.required_equipment, tags = excluded.tags, tips = excluded.tips,
      image_url = excluded.image_url, image_alt = excluded.image_alt, image_credit = excluded.image_credit,
      image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url, image_license = excluded.image_license,
      image_is_representative = excluded.image_is_representative, calories_per_serving = excluded.calories_per_serving,
      protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, nutrition_source = excluded.nutrition_source,
      status = excluded.status, categories = excluded.categories, methods = excluded.methods, flavors = excluded.flavors,
      occasions = excluded.occasions, region = excluded.region, authenticity = excluded.authenticity, dish_key = excluded.dish_key,
      variant = excluded.variant, storage_notes = excluded.storage_notes, safety_note = excluded.safety_note,
      text_license = excluded.text_license, attribution = excluded.attribution, reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at, allergens = excluded.allergens, proteins = excluded.proteins,
      diet_tags = excluded.diet_tags, core_ingredients = excluded.core_ingredients, fingerprint = excluded.fingerprint,
      updated_at = now()
    where public.recipes.source_id = sid and public.recipes.visibility = 'public';
    get diagnostics touched = row_count;
    if touched = 0 then
      -- The id belongs to another source or a household recipe: never overwrite it.
      n_skip := n_skip + 1;
      continue;
    end if;

    delete from public.recipe_ingredients where recipe_id = rid;
    insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional)
    select rid, (i ->> 'position')::smallint, i ->> 'component', i ->> 'rawText', i ->> 'item', (i ->> 'quantity')::numeric, i ->> 'unit',
           i ->> 'preparation', coalesce((i ->> 'optional')::boolean, false)
    from jsonb_array_elements(coalesce(rec -> 'ingredients', '[]'::jsonb)) i;
    delete from public.recipe_instructions where recipe_id = rid;
    insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c)
    select rid, (s ->> 'position')::smallint, s ->> 'component', s ->> 'body', (s ->> 'timerSeconds')::integer,
           (s ->> 'temperatureC')::numeric, (s ->> 'safeInternalTempC')::numeric
    from jsonb_array_elements(coalesce(rec -> 'steps', '[]'::jsonb)) s;
    if existed then n_upd := n_upd + 1; else n_ins := n_ins + 1; end if;
  end loop;

  insert into public.recipe_import_batches (source_id, file_name, received, inserted, updated, rejected, report)
  values (sid, left(batch ->> 'file', 200), coalesce((batch ->> 'received')::integer, 0), n_ins, n_upd,
          coalesce((batch ->> 'rejected')::integer, 0) + n_skip, coalesce(batch -> 'report', '{}'::jsonb))
  returning id into bid;
  return jsonb_build_object('batch', bid, 'inserted', n_ins, 'updated', n_upd, 'skipped', n_skip);
end;
$$;
revoke all on function public.import_recipe_batch(jsonb) from public, anon, authenticated;
grant execute on function public.import_recipe_batch(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Saved menus (household)
-- -----------------------------------------------------------------------------
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_code text not null check (template_code ~ '^[a-z0-9:_-]{1,60}$'),
  title text not null check (char_length(title) between 1 and 120),
  guests smallint not null check (guests between 1 and 50),
  budget_cents integer check (budget_cents between 0 and 10000000),
  serve_on date,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menus_household_idx on public.menus (household_id, created_at desc);

create table public.menu_courses (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus (id) on delete cascade,
  position smallint not null check (position between 1 and 12),
  course text not null check (course in ('amuse', 'starter', 'raw_bar', 'soup', 'salad', 'fish', 'main', 'side', 'sauce', 'palate_cleanser', 'dessert')),
  label text not null check (char_length(label) between 1 and 80),
  recipe_id uuid references public.recipes (id) on delete set null,
  unique (menu_id, position)
);

alter table public.menus enable row level security;
alter table public.menu_courses enable row level security;
create policy menus_select on public.menus for select to authenticated using (public.is_household_member(household_id));
create policy menus_delete on public.menus for delete to authenticated using (public.is_household_member(household_id));
create policy menu_courses_select on public.menu_courses for select to authenticated
  using (exists (select 1 from public.menus m where m.id = menu_id and public.is_household_member(m.household_id)));
revoke all on public.menus, public.menu_courses from anon, authenticated;
grant select, delete on public.menus to authenticated;
grant select on public.menu_courses to authenticated;

-- Save (or replace) a menu in the current household. Recipes must be ones
-- the household can read.
create or replace function public.save_menu(menu jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  mid uuid := nullif(menu ->> 'id', '')::uuid;
  c jsonb;
  pos integer := 0;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_typeof(menu -> 'courses'), '') <> 'array' or jsonb_array_length(menu -> 'courses') not between 1 and 12 then
    raise exception 'A menu has 1 to 12 courses.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.menus where household_id = hh) >= 200 and mid is null then
    raise exception 'You have 200 saved menus — delete some first.' using errcode = 'check_violation';
  end if;
  if mid is not null then
    if not exists (select 1 from public.menus where id = mid and household_id = hh) then
      raise exception 'That menu is not in your household.' using errcode = 'insufficient_privilege';
    end if;
    update public.menus set template_code = menu ->> 'templateCode', title = menu ->> 'title', guests = (menu ->> 'guests')::smallint,
      budget_cents = (menu ->> 'budgetCents')::integer, serve_on = (menu ->> 'serveOn')::date, notes = menu ->> 'notes', updated_at = now()
    where id = mid;
    delete from public.menu_courses where menu_id = mid;
  else
    insert into public.menus (household_id, created_by, template_code, title, guests, budget_cents, serve_on, notes)
    values (hh, uid, menu ->> 'templateCode', menu ->> 'title', (menu ->> 'guests')::smallint, (menu ->> 'budgetCents')::integer,
            (menu ->> 'serveOn')::date, menu ->> 'notes')
    returning id into mid;
  end if;
  for c in select * from jsonb_array_elements(menu -> 'courses') loop
    pos := pos + 1;
    if (c ->> 'recipeId') is not null and not public.can_read_recipe((c ->> 'recipeId')::uuid) then
      raise exception 'That recipe is not available.' using errcode = 'insufficient_privilege';
    end if;
    insert into public.menu_courses (menu_id, position, course, label, recipe_id)
    values (mid, pos, c ->> 'course', c ->> 'label', (c ->> 'recipeId')::uuid);
  end loop;
  return mid;
end;
$$;
revoke all on function public.save_menu(jsonb) from public, anon;
grant execute on function public.save_menu(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- AI recipe drafts for one household (new versions, full recipes for ideas)
-- -----------------------------------------------------------------------------
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check check (feature in ('meal_plan', 'cooking_help', 'recipe_draft'));

create or replace function public.reserve_ai_request(feature_name text, daily_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  used integer;
  cap integer := least(greatest(coalesce(daily_limit, 0), 0), 1000);
  rid uuid;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if feature_name not in ('meal_plan', 'cooking_help', 'recipe_draft') then
    raise exception 'Unknown feature' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || hh::text || ':' || feature_name, 0));
  select count(*)::integer into used
  from public.ai_usage
  where household_id = hh and feature = feature_name
    and outcome in ('ok', 'fallback', 'reserved')
    and created_at > now() - interval '24 hours';
  if used >= cap then
    return null;
  end if;
  insert into public.ai_usage (household_id, user_id, feature, outcome)
  values (hh, uid, feature_name, 'reserved')
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.reserve_ai_request(text, integer) from public, anon;
grant execute on function public.reserve_ai_request(text, integer) to authenticated;

create unique index recipes_household_version_idx on public.recipes (household_id, variant_of, variant)
  where visibility = 'household' and variant_of is not null;

-- Save a validated AI draft (the server ran prepareRecipe() on it) as a
-- recipe only this household sees. Always "pending_review"; one per recipe
-- and version (asking again returns the saved one).
create or replace function public.save_household_recipe(recipe jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  base uuid := nullif(recipe ->> 'variantOf', '')::uuid;
  existing uuid;
  rid uuid;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if base is not null and not public.can_read_recipe(base) then
    raise exception 'That recipe is not available.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_typeof(recipe -> 'ingredients'), '') <> 'array' or coalesce(jsonb_typeof(recipe -> 'steps'), '') <> 'array'
     or jsonb_array_length(recipe -> 'ingredients') not between 2 and 80
     or jsonb_array_length(recipe -> 'steps') not between 2 and 60 then
    raise exception 'A recipe needs ingredients and steps.' using errcode = 'check_violation';
  end if;
  -- Bounded lists (the table checks repeat these).
  perform public.bounded_text_array(recipe -> 'categories', 20, 40), public.bounded_text_array(recipe -> 'methods', 20, 40),
          public.bounded_text_array(recipe -> 'flavors', 10, 40), public.bounded_text_array(recipe -> 'occasions', 10, 40),
          public.bounded_text_array(recipe -> 'allergens', 10, 20), public.bounded_text_array(recipe -> 'proteins', 10, 20),
          public.bounded_text_array(recipe -> 'dietTags', 5, 20), public.bounded_text_array(recipe -> 'core', 80, 80),
          public.bounded_text_array(recipe -> 'equipment', 14, 40);
  if (select count(*) from public.recipes where household_id = hh and visibility = 'household') >= 500 then
    raise exception 'Your household has 500 saved recipes — delete some first.' using errcode = 'check_violation';
  end if;
  select id into existing from public.recipes
  where household_id = hh and visibility = 'household' and variant_of = base and variant = recipe ->> 'variant';
  if existing is not null then
    return existing;
  end if;

  insert into public.recipes (
    source_id, household_id, visibility, created_by, title, slug, description, cuisine, skill_level, prep_minutes, cook_minutes,
    total_minutes, servings, course, dessert_category, chill_minutes, required_equipment, tags, tips, status, categories, methods,
    flavors, occasions, region, authenticity, dish_key, variant, variant_of, storage_notes, safety_note, text_license,
    allergens, proteins, diet_tags, core_ingredients, fingerprint
  ) values (
    (select id from public.recipe_sources where name = 'AI suggestions'), hh, 'household', uid,
    left(recipe ->> 'title', 160), left(recipe ->> 'slug', 120), left(recipe ->> 'description', 600), recipe ->> 'cuisine',
    (recipe ->> 'skillLevel')::smallint, (recipe ->> 'prepMinutes')::smallint, (recipe ->> 'cookMinutes')::smallint,
    (recipe ->> 'totalMinutes')::smallint, (recipe ->> 'servings')::smallint, recipe ->> 'course', recipe ->> 'dessertCategory',
    coalesce((recipe ->> 'chillMinutes')::smallint, 0), array(select jsonb_array_elements_text(recipe -> 'equipment')),
    '{}', array(select left(x, 300) from jsonb_array_elements_text(coalesce(recipe -> 'tips', '[]')) x limit 8),
    'pending_review', array(select jsonb_array_elements_text(recipe -> 'categories')), array(select jsonb_array_elements_text(recipe -> 'methods')),
    array(select jsonb_array_elements_text(recipe -> 'flavors')), array(select jsonb_array_elements_text(recipe -> 'occasions')),
    recipe ->> 'region', recipe ->> 'authenticity', recipe ->> 'dishKey', coalesce(recipe ->> 'variant', 'classic'), base,
    recipe ->> 'storage', recipe ->> 'safetyNote', 'owned',
    array(select jsonb_array_elements_text(recipe -> 'allergens')), array(select jsonb_array_elements_text(recipe -> 'proteins')),
    array(select jsonb_array_elements_text(recipe -> 'dietTags')), array(select jsonb_array_elements_text(recipe -> 'core')),
    left(recipe ->> 'fingerprint', 2000)
  ) returning id into rid;
  insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional)
  select rid, (i ->> 'position')::smallint, left(i ->> 'component', 80), left(i ->> 'rawText', 300), left(i ->> 'item', 160),
         (i ->> 'quantity')::numeric, left(i ->> 'unit', 20), left(i ->> 'preparation', 160), coalesce((i ->> 'optional')::boolean, false)
  from jsonb_array_elements(recipe -> 'ingredients') i;
  insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c)
  select rid, (s ->> 'position')::smallint, left(s ->> 'component', 80), left(s ->> 'body', 1500), (s ->> 'timerSeconds')::integer,
         (s ->> 'temperatureC')::numeric, (s ->> 'safeInternalTempC')::numeric
  from jsonb_array_elements(recipe -> 'steps') s;
  return rid;
end;
$$;
revoke all on function public.save_household_recipe(jsonb) from public, anon;
grant execute on function public.save_household_recipe(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Hardening (security review, milestone 18)
-- -----------------------------------------------------------------------------

-- Bounded lists and text on every recipe row.
alter table public.recipes
  add constraint recipes_library_bounds check (
    cardinality(categories) <= 20 and cardinality(methods) <= 20 and cardinality(flavors) <= 10
    and cardinality(occasions) <= 10 and cardinality(allergens) <= 10 and cardinality(proteins) <= 10
    and cardinality(diet_tags) <= 5 and cardinality(core_ingredients) <= 80 and cardinality(required_equipment) <= 14
    and cardinality(tags) <= 20 and cardinality(tips) <= 8
    and char_length(slug) <= 120 and char_length(coalesce(cuisine, '')) <= 40 and char_length(coalesce(description, '')) <= 600
  );
alter table public.recipe_ingredients
  add constraint recipe_ingredients_bounds check (char_length(raw_text) <= 400 and char_length(item) <= 200 and char_length(coalesce(preparation, '')) <= 200 and char_length(coalesce(component, '')) <= 80);
alter table public.recipe_instructions
  add constraint recipe_instructions_bounds check (char_length(body) <= 2000 and char_length(coalesce(component, '')) <= 80);

-- What members can write themselves (their household's own recipes): never
-- "tested" or "reviewed", only the household or AI sources, a version only
-- of a recipe they can read, and never a public recipe's slug. The server
-- and the app's own functions (security definer) aren't affected.
create or replace function public.recipes_member_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status not in ('pending_review', 'idea', 'retired') then
    new.status := 'pending_review';
  end if;
  new.reviewed_by := null;
  new.reviewed_at := null;
  if new.source_id not in (select id from public.recipe_sources where name in ('Household recipes', 'AI suggestions')) then
    new.source_id := (select id from public.recipe_sources where name = 'Household recipes');
  end if;
  if new.variant_of is not null and (tg_op = 'INSERT' or new.variant_of is distinct from old.variant_of) and not public.can_read_recipe(new.variant_of) then
    raise exception 'That recipe is not available.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.recipes x where x.slug = new.slug and x.id <> new.id) then
    new.slug := left(new.slug, 100) || '-' || left(new.id::text, 8);
  end if;
  return new;
end;
$$;
create trigger recipes_member_write
  before insert or update on public.recipes
  for each row execute function public.recipes_member_write();

-- A household's existing AI draft for a recipe and version (current household only).
create or replace function public.find_household_draft(base uuid, draft_variant text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.recipes r
  where r.household_id = public.current_household_id()
    and public.is_household_member(r.household_id)
    and r.visibility = 'household'
    and r.variant_of = base
    and r.variant = draft_variant
    and r.source_id = (select id from public.recipe_sources where name = 'AI suggestions')
  limit 1;
$$;
revoke all on function public.find_household_draft(uuid, text) from public, anon;
grant execute on function public.find_household_draft(uuid, text) to authenticated;

-- AI usage: members can't see reservations still in progress (so they can't
-- hand a slot back while the server is waiting on Claude), the count runs as
-- the definer, and limits also apply per person (a new household doesn't
-- reset them). Members only ever needed to read and insert.
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (public.is_household_member(household_id) and outcome <> 'reserved');
revoke update, delete, truncate on public.ai_usage from authenticated, anon;

create or replace function public.ai_requests_last_day(feature_name text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    (select count(*) from public.ai_usage
      where household_id = public.current_household_id() and public.is_household_member(household_id)
        and feature = feature_name and outcome in ('ok', 'fallback', 'reserved') and created_at > now() - interval '24 hours'),
    (select count(*) from public.ai_usage
      where user_id = (select auth.uid())
        and feature = feature_name and outcome in ('ok', 'fallback', 'reserved') and created_at > now() - interval '24 hours')
  )::integer;
$$;
revoke all on function public.ai_requests_last_day(text) from public, anon;
grant execute on function public.ai_requests_last_day(text) to authenticated;

create or replace function public.reserve_ai_request(feature_name text, daily_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  used_household integer;
  used_person integer;
  cap integer := least(greatest(coalesce(daily_limit, 0), 0), 1000);
  rid uuid;
begin
  if uid is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if feature_name not in ('meal_plan', 'cooking_help', 'recipe_draft') then
    raise exception 'Unknown feature' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || hh::text || ':' || feature_name, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_usage_user:' || uid::text || ':' || feature_name, 0));
  select count(*)::integer into used_household from public.ai_usage
  where household_id = hh and feature = feature_name and outcome in ('ok', 'fallback', 'reserved') and created_at > now() - interval '24 hours';
  select count(*)::integer into used_person from public.ai_usage
  where user_id = uid and feature = feature_name and outcome in ('ok', 'fallback', 'reserved') and created_at > now() - interval '24 hours';
  if used_household >= cap or used_person >= cap then
    return null;
  end if;
  insert into public.ai_usage (household_id, user_id, feature, outcome)
  values (hh, uid, feature_name, 'reserved')
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.reserve_ai_request(text, integer) from public, anon;
grant execute on function public.reserve_ai_request(text, integer) to authenticated;
