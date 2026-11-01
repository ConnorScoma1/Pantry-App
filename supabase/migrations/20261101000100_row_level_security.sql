-- =============================================================================
-- Row-level security
-- Model: users see and edit only households they belong to. Reference data
-- (allergens, equipment, ingredients, retailers, stores, products, prices,
-- recipe sources) is readable by signed-in users and writable only by the
-- service role (server-side jobs), which bypasses RLS.
-- =============================================================================

-- Membership helpers. SECURITY DEFINER avoids recursive RLS on household_members.
create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target_household
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target_household
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

-- Enable RLS on every table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'allergens','equipment','ingredients','profiles','households','household_members',
    'user_preferences','household_allergies','dietary_restrictions','household_equipment',
    'retailers','store_locations','retailer_products','product_price_observations',
    'ingredient_product_mappings','pantry_items','recipe_sources','recipes',
    'recipe_ingredients','recipe_instructions','recipe_ratings','user_favorites',
    'meal_plans','planned_meals','grocery_lists','grocery_list_items',
    'cooking_history','pantry_transactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reference data: read-only for signed-in users
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'allergens','equipment','ingredients','retailers','store_locations',
    'retailer_products','product_price_observations','ingredient_product_mappings'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t
    );
  end loop;
end;
$$;

create policy recipe_sources_read on public.recipe_sources
  for select to authenticated using (is_approved);

-- -----------------------------------------------------------------------------
-- Profiles & personal preferences: owner only
-- -----------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (active_household_id is null or public.is_household_member(active_household_id))
  );

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy user_preferences_delete_own on public.user_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Households & membership
-- -----------------------------------------------------------------------------
create policy households_select_member on public.households
  for select to authenticated using (public.is_household_member(id));
create policy households_insert_self on public.households
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy households_update_member on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));
create policy households_delete_owner on public.households
  for delete to authenticated using (public.is_household_owner(id));

create policy household_members_select on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
-- Owners manage membership (invites arrive in Phase 6). The creator's own
-- owner row is inserted by the on_household_created trigger.
create policy household_members_insert_owner on public.household_members
  for insert to authenticated with check (public.is_household_owner(household_id));
create policy household_members_update_owner on public.household_members
  for update to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));
create policy household_members_delete on public.household_members
  for delete to authenticated
  using (public.is_household_owner(household_id) or user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Household-scoped tables: full access for members
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'household_allergies','dietary_restrictions','household_equipment',
    'pantry_items','pantry_transactions','meal_plans','grocery_lists','cooking_history'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_household_member(household_id))
         with check (public.is_household_member(household_id))',
      t || '_member_all', t
    );
  end loop;
end;
$$;

-- Children of household-scoped parents.
create policy planned_meals_member_all on public.planned_meals
  for all to authenticated
  using (exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and public.is_household_member(p.household_id)))
  with check (exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and public.is_household_member(p.household_id)));

create policy grocery_list_items_member_all on public.grocery_list_items
  for all to authenticated
  using (exists (
    select 1 from public.grocery_lists l
    where l.id = grocery_list_id and public.is_household_member(l.household_id)))
  with check (exists (
    select 1 from public.grocery_lists l
    where l.id = grocery_list_id and public.is_household_member(l.household_id)));

-- -----------------------------------------------------------------------------
-- Recipes: public catalogue (approved sources) + private household recipes
-- -----------------------------------------------------------------------------
create or replace function public.can_read_recipe(target_recipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recipes r
    join public.recipe_sources s on s.id = r.source_id
    where r.id = target_recipe
      and (
        (r.visibility = 'public' and s.is_approved)
        or (r.visibility = 'household' and public.is_household_member(r.household_id))
      )
  );
$$;

create or replace function public.can_edit_recipe(target_recipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target_recipe
      and r.visibility = 'household'
      and public.is_household_member(r.household_id)
  );
$$;

revoke all on function public.can_read_recipe(uuid) from public;
revoke all on function public.can_edit_recipe(uuid) from public;
grant execute on function public.can_read_recipe(uuid) to authenticated;
grant execute on function public.can_edit_recipe(uuid) to authenticated;

create policy recipes_select on public.recipes
  for select to authenticated using (public.can_read_recipe(id));
create policy recipes_insert_household on public.recipes
  for insert to authenticated
  with check (visibility = 'household' and public.is_household_member(household_id));
create policy recipes_update_household on public.recipes
  for update to authenticated
  using (visibility = 'household' and public.is_household_member(household_id))
  with check (visibility = 'household' and public.is_household_member(household_id));
create policy recipes_delete_household on public.recipes
  for delete to authenticated
  using (visibility = 'household' and public.is_household_member(household_id));

create policy recipe_ingredients_select on public.recipe_ingredients
  for select to authenticated using (public.can_read_recipe(recipe_id));
create policy recipe_ingredients_write on public.recipe_ingredients
  for all to authenticated
  using (public.can_edit_recipe(recipe_id))
  with check (public.can_edit_recipe(recipe_id));

create policy recipe_instructions_select on public.recipe_instructions
  for select to authenticated using (public.can_read_recipe(recipe_id));
create policy recipe_instructions_write on public.recipe_instructions
  for all to authenticated
  using (public.can_edit_recipe(recipe_id))
  with check (public.can_edit_recipe(recipe_id));

-- Ratings: authors manage their own; household members can read the household's.
create policy recipe_ratings_select on public.recipe_ratings
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_household_member(household_id));
create policy recipe_ratings_insert_own on public.recipe_ratings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_household_member(household_id)
    and public.can_read_recipe(recipe_id)
  );
create policy recipe_ratings_update_own on public.recipe_ratings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy recipe_ratings_delete_own on public.recipe_ratings
  for delete to authenticated using (user_id = (select auth.uid()));

create policy user_favorites_own on public.user_favorites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_recipe(recipe_id));

-- Aggregate community ratings without exposing individual rows.
create or replace function public.recipe_rating_summary(target_recipe uuid)
returns table (average numeric, rating_count bigint, would_cook_again_pct numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    round(avg(r.overall)::numeric, 2),
    count(*),
    round(100.0 * avg(case when r.would_cook_again then 1 else 0 end), 1)
  from public.recipe_ratings r
  where r.recipe_id = target_recipe
    and public.can_read_recipe(target_recipe);
$$;
revoke all on function public.recipe_rating_summary(uuid) from public;
grant execute on function public.recipe_rating_summary(uuid) to authenticated;
