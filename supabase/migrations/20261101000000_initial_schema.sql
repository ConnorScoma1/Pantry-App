-- =============================================================================
-- Kitchen Pantry — initial schema
-- Conventions:
--   * UUID primary keys (gen_random_uuid()), created_at/updated_at timestamps.
--   * Enumerations are text + CHECK constraints (cheaper to evolve than enums).
--   * Money is integer cents. Quantities keep the ORIGINAL unit and a
--     NORMALIZED value in a base unit (g | ml | each) where convertible.
--   * Household-scoped data carries household_id for row-level security.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reference data (read-only for app users; managed by service role / seed)
-- -----------------------------------------------------------------------------
create table public.allergens (
  code text primary key,
  name text not null,
  -- Ingredient aliases that imply this allergen (mirrors recipe-engine rules).
  aliases text[] not null default '{}',
  cross_contact_note text
);

create table public.equipment (
  code text primary key,
  name text not null,
  sort_order smallint not null default 0
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category text not null check (category in (
    'protein','produce','dairy','grain','pasta','rice','canned','frozen',
    'spice','oil','sauce','condiment','baking','other')),
  grocery_department text not null default 'other' check (grocery_department in (
    'produce','meat_seafood','dairy','bakery','pantry','frozen','spices','other')),
  default_unit text not null default 'each',
  aliases text[] not null default '{}',
  allergen_codes text[] not null default '{}',
  -- Conversion hints; null when unknown (never guessed).
  density_g_per_ml numeric(8,4) check (density_g_per_ml > 0),
  grams_per_each numeric(10,2) check (grams_per_each > 0),
  is_common_staple boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ingredients_name_trgm_idx on public.ingredients using gin (canonical_name extensions.gin_trgm_ops);
create index ingredients_aliases_idx on public.ingredients using gin (aliases);

-- -----------------------------------------------------------------------------
-- Users & households
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  active_household_id uuid,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My household' check (char_length(name) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  country_code text not null default 'US' check (country_code in ('US','CA','GB','AU','OTHER')),
  postal_code text not null check (char_length(postal_code) between 2 and 12),
  adults smallint not null default 1 check (adults between 1 and 20),
  children smallint not null default 0 check (children between 0 and 20),
  cooking_for smallint not null default 1 check (cooking_for between 1 and 30),
  dinners_per_week smallint not null default 5 check (dinners_per_week between 0 and 7),
  meals_included text[] not null default '{dinner}'
    check (meals_included <@ array['breakfast','lunch','dinner','snack']::text[] and cardinality(meals_included) > 0),
  servings_by_meal jsonb not null default '{}'::jsonb check (jsonb_typeof(servings_by_meal) = 'object'),
  budget_amount_cents integer check (budget_amount_cents between 500 and 500000),
  budget_period text not null default 'week' check (budget_period in ('week','two_weeks','month')),
  budget_includes text[] not null default '{dinner}'
    check (budget_includes <@ array['breakfast','lunch','dinner','snack','drinks','household']::text[]),
  budget_priority text not null default 'balanced'
    check (budget_priority in ('lowest_cost','balanced','quality','premium')),
  diet_style text not null default 'omnivore'
    check (diet_style in ('omnivore','pescatarian','vegetarian','vegan')),
  usual_retailer text check (char_length(usual_retailer) <= 80),
  preferred_store_location_id uuid,
  currency text not null default 'USD' check (currency in ('USD','CAD','GBP','AUD','EUR')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index households_created_by_idx on public.households (created_by);

alter table public.profiles
  add constraint profiles_active_household_fk
  foreign key (active_household_id) references public.households (id) on delete set null;

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

-- Personal (per-user) preferences. Household-wide settings live on households.
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  skill_level smallint not null default 2 check (skill_level between 1 and 5),
  goals_ranked text[] not null default '{}',
  preferred_cuisines text[] not null default '{}',
  preferred_proteins text[] not null default '{}',
  calories_per_day integer check (calories_per_day between 800 and 6000),
  protein_grams_per_day integer check (protein_grams_per_day between 10 and 400),
  -- Learned signal weights (Phase 6 personalization). Resettable by the user.
  learned_weights jsonb not null default '{}'::jsonb,
  auto_deduct_inventory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_allergies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  allergen_code text not null references public.allergens (code),
  notes text check (char_length(notes) <= 280),
  created_at timestamptz not null default now(),
  unique (household_id, allergen_code)
);

-- Diet restrictions (halal, keto…), dislikes and "never recommend" terms.
create table public.dietary_restrictions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('restriction','dislike','exclude')),
  value text not null check (char_length(value) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index dietary_restrictions_unique_idx
  on public.dietary_restrictions (household_id, kind, lower(value));

create table public.household_equipment (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  equipment_code text not null references public.equipment (code),
  created_at timestamptz not null default now(),
  unique (household_id, equipment_code)
);

-- -----------------------------------------------------------------------------
-- Retailers, stores, products, prices
-- -----------------------------------------------------------------------------
create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  website text,
  -- True only once an authorized integration is verified (see packages/integrations).
  has_store_locator boolean not null default false,
  has_pricing boolean not null default false,
  integration_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_locations (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  external_store_id text not null,
  name text not null,
  address_line text,
  city text,
  region text,
  postal_code text,
  country_code text not null default 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  provider text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, external_store_id)
);
create index store_locations_postal_idx on public.store_locations (country_code, postal_code);

alter table public.households
  add constraint households_preferred_store_fk
  foreign key (preferred_store_location_id) references public.store_locations (id) on delete set null;

create table public.retailer_products (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  external_product_id text not null,
  name text not null,
  brand text,
  upc text,
  package_quantity numeric(12,4) not null check (package_quantity > 0),
  package_unit text not null,
  normalized_quantity numeric(14,4),
  normalized_unit text check (normalized_unit in ('g','ml','each')),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, external_product_id)
);
create index retailer_products_upc_idx on public.retailer_products (upc) where upc is not null;
create index retailer_products_name_trgm_idx on public.retailer_products using gin (name extensions.gin_trgm_ops);

-- Append-only price history. "Status" is derived at read time from age,
-- provider and store specificity — it is never stored as "verified".
create table public.product_price_observations (
  id uuid primary key default gen_random_uuid(),
  retailer_product_id uuid not null references public.retailer_products (id) on delete cascade,
  store_location_id uuid references public.store_locations (id) on delete cascade,
  provider text not null,
  price_cents integer not null check (price_cents >= 0),
  promo_price_cents integer check (promo_price_cents >= 0),
  promo_description text,
  unit_price_cents integer check (unit_price_cents >= 0),
  unit_price_unit text,
  availability text not null default 'unknown'
    check (availability in ('in_stock','limited','out_of_stock','unknown')),
  is_mock boolean not null default false,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index price_obs_latest_idx
  on public.product_price_observations (retailer_product_id, store_location_id, observed_at desc);

create table public.ingredient_product_mappings (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  retailer_product_id uuid not null references public.retailer_products (id) on delete cascade,
  match_method text not null check (match_method in ('manual','rule','ai','user')),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_id, retailer_product_id)
);
create index ingredient_product_mappings_product_idx on public.ingredient_product_mappings (retailer_product_id);

-- -----------------------------------------------------------------------------
-- Pantry inventory
-- -----------------------------------------------------------------------------
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'other' check (category in (
    'protein','produce','dairy','grain','pasta','rice','canned','frozen',
    'spice','oil','sauce','condiment','baking','other')),
  quantity numeric(12,4) check (quantity >= 0),
  unit text,
  normalized_quantity numeric(14,4) check (normalized_quantity >= 0),
  normalized_unit text check (normalized_unit in ('g','ml','each')),
  storage_location text not null default 'pantry'
    check (storage_location in ('pantry','fridge','freezer','counter')),
  purchased_on date,
  use_by date,
  opened_on date,
  estimated_remaining_pct smallint check (estimated_remaining_pct between 0 and 100),
  price_paid_cents integer check (price_paid_cents >= 0),
  is_staple boolean not null default false,
  -- Future barcode / receipt import support.
  source text not null default 'manual' check (source in ('manual','bulk_staple','barcode','receipt','cooked_leftover')),
  barcode text,
  receipt_line_ref text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pantry_items_household_idx on public.pantry_items (household_id);
create index pantry_items_use_by_idx on public.pantry_items (household_id, use_by) where use_by is not null;
create index pantry_items_ingredient_idx on public.pantry_items (ingredient_id);

-- -----------------------------------------------------------------------------
-- Recipes
-- -----------------------------------------------------------------------------
create table public.recipe_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('licensed_api','partner','user_submitted','original','editorial','ai_generated')),
  website text,
  license_notes text,
  attribution_required boolean not null default true,
  -- Content from this source may be shown to users only when true.
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.recipe_sources (id),
  external_id text,
  source_url text,
  household_id uuid references public.households (id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public','household')),
  title text not null check (char_length(title) between 2 and 160),
  slug text not null,
  description text,
  cuisine text,
  skill_level smallint not null check (skill_level between 1 and 5),
  prep_minutes smallint check (prep_minutes >= 0),
  cook_minutes smallint check (cook_minutes >= 0),
  total_minutes smallint check (total_minutes >= 0),
  servings smallint not null default 4 check (servings between 1 and 50),
  required_equipment text[] not null default '{}',
  image_url text,
  image_credit text,
  calories_per_serving integer,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  is_mock boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_visibility_household check (
    (visibility = 'household' and household_id is not null) or (visibility = 'public')
  ),
  unique (source_id, external_id)
);
create unique index recipes_slug_idx on public.recipes (slug) where visibility = 'public';
create index recipes_household_idx on public.recipes (household_id) where household_id is not null;
create index recipes_skill_idx on public.recipes (skill_level);
create index recipes_title_trgm_idx on public.recipes using gin (title extensions.gin_trgm_ops);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  position smallint not null,
  component text,                       -- e.g. "Tarragon jus" for multi-component dishes
  raw_text text not null,               -- exactly as the source wrote it
  original_quantity numeric(12,4),
  original_unit text,
  normalized_quantity numeric(14,4),
  normalized_unit text check (normalized_unit in ('g','ml','each')),
  preparation text,
  is_optional boolean not null default false,
  unique (recipe_id, position)
);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

create table public.recipe_instructions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position smallint not null,
  component text,
  body text not null,
  timer_seconds integer check (timer_seconds > 0),
  temperature_c numeric(5,1),
  safe_internal_temp_c numeric(5,1),
  unique (recipe_id, position)
);

create table public.recipe_ratings (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  cooking_history_id uuid,
  overall smallint not null check (overall between 1 and 5),
  flavor smallint check (flavor between 1 and 5),
  difficulty smallint check (difficulty between 1 and 5),
  would_cook_again boolean,
  actual_minutes smallint check (actual_minutes between 1 and 1440),
  family_approval smallint check (family_approval between 1 and 5),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipe_ratings_recipe_idx on public.recipe_ratings (recipe_id);
create index recipe_ratings_user_idx on public.recipe_ratings (user_id);

create table public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);

-- -----------------------------------------------------------------------------
-- Meal plans & grocery lists
-- -----------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  budget_cents integer,
  estimated_total_cents integer,
  -- Only a fully store-priced basket may be 'verified'.
  total_price_status text check (total_price_status in ('verified','cached','estimated','unavailable')),
  shopping_date date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete set null,
  custom_title text check (char_length(custom_title) <= 160),
  planned_date date not null,
  meal_type text not null default 'dinner' check (meal_type in ('breakfast','lunch','dinner','snack')),
  servings smallint not null default 2 check (servings between 1 and 50),
  is_locked boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_meals_has_content check (recipe_id is not null or custom_title is not null)
);
create index planned_meals_plan_idx on public.planned_meals (meal_plan_id, planned_date);

create table public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  meal_plan_id uuid references public.meal_plans (id) on delete set null,
  name text not null default 'Shopping list',
  store_location_id uuid references public.store_locations (id) on delete set null,
  shopping_date date,
  status text not null default 'open' check (status in ('open','shopping','done','archived')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grocery_lists_household_idx on public.grocery_lists (household_id, created_at desc);

create table public.grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references public.grocery_lists (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  department text not null default 'other' check (department in (
    'produce','meat_seafood','dairy','bakery','pantry','frozen','spices','other')),
  required_quantity numeric(12,4),
  required_unit text,
  purchase_quantity numeric(12,4),
  purchase_unit text,
  package_count smallint check (package_count >= 0),
  retailer_product_id uuid references public.retailer_products (id) on delete set null,
  price_observation_id uuid references public.product_price_observations (id) on delete set null,
  unit_price_cents integer,
  package_price_cents integer,
  line_total_cents integer,
  price_status text not null default 'unavailable'
    check (price_status in ('verified','cached','estimated','unavailable')),
  price_observed_at timestamptz,
  is_checked boolean not null default false,
  is_owned boolean not null default false,
  is_custom boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_items_price_has_timestamp check (
    price_status = 'unavailable' or price_observed_at is not null
  )
);
create index grocery_list_items_list_idx on public.grocery_list_items (grocery_list_id, department, position);

-- -----------------------------------------------------------------------------
-- Cooking history & inventory transactions
-- -----------------------------------------------------------------------------
create table public.cooking_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete set null,
  planned_meal_id uuid references public.planned_meals (id) on delete set null,
  servings smallint check (servings between 1 and 50),
  cooked_at timestamptz not null default now(),
  -- Only true after the user confirmed deduction (or enabled auto-deduct).
  inventory_deducted boolean not null default false,
  created_at timestamptz not null default now()
);
create index cooking_history_household_idx on public.cooking_history (household_id, cooked_at desc);

alter table public.recipe_ratings
  add constraint recipe_ratings_cooking_history_fk
  foreign key (cooking_history_id) references public.cooking_history (id) on delete set null;

create table public.pantry_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  pantry_item_id uuid references public.pantry_items (id) on delete set null,
  reason text not null check (reason in ('added','consumed','cooked_recipe','adjusted','discarded','expired')),
  quantity_delta numeric(12,4) not null,
  unit text,
  normalized_delta numeric(14,4),
  normalized_unit text check (normalized_unit in ('g','ml','each')),
  cooking_history_id uuid references public.cooking_history (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pantry_transactions_item_idx on public.pantry_transactions (pantry_item_id, created_at desc);
create index pantry_transactions_household_idx on public.pantry_transactions (household_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ingredients','profiles','households','user_preferences','retailers',
    'store_locations','retailer_products','ingredient_product_mappings',
    'pantry_items','recipes','recipe_ratings','meal_plans','planned_meals',
    'grocery_lists','grocery_list_items'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- New-user bootstrap: every auth user gets a profile row.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Household creator automatically becomes its owner.
create or replace function public.handle_new_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (household_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_household_created
  after insert on public.households
  for each row execute function public.handle_new_household();
