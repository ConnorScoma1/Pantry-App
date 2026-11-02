-- =============================================================================
-- Download my data (privacy policy: "a copy of your information").
--
-- Review before applying. Adds one function; nothing is changed or deleted.
--
--   * export_my_data() — everything the signed-in person's account can see
--     about them and their households, as one JSON document: profile,
--     allergies and diet, preferences, households and members, kitchen and
--     its history, meal plans, grocery lists and saved lists, cooking
--     history, ratings and favourites, the household's own recipes and
--     menus, who's eating, shopping settings and trips, spending logs,
--     notifications and their settings, and AI usage rows.
--
-- It runs as the caller (security invoker), so row-level security decides
-- every row exactly as it does in the app: nothing from other households,
-- and nothing the app itself can't show them. Server-only tables (store
-- sign-in tokens, job queues, caches, spending totals) aren't included.
-- Public library recipes aren't included either (they aren't personal).
-- A table the caller can't read is skipped rather than failing the export.
-- =============================================================================

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t text;
  rows jsonb;
  out jsonb;
  tables text[] := array[
    'profiles', 'user_preferences', 'member_allergies', 'member_diet_items',
    'households', 'household_members', 'household_allergies', 'dietary_restrictions', 'household_equipment',
    'pantry_items', 'pantry_transactions',
    'meal_plans', 'planned_meals', 'meal_attendance', 'meal_guests',
    'grocery_lists', 'grocery_list_items', 'saved_grocery_lists',
    'cooking_history', 'recipe_ratings', 'user_favorites', 'recommendation_events',
    'menus', 'menu_courses',
    'weekly_planning_settings', 'notification_preferences', 'notifications', 'push_tokens',
    'shopping_preferences', 'shopping_trips', 'shopping_trip_stops', 'shopping_trip_items',
    'grocery_spending', 'cart_drafts', 'household_invites', 'ai_usage'
  ];
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;

  out := jsonb_build_object(
    'format', 'kitchen-pantry-export-v1',
    'exportedAt', now(),
    'account', jsonb_build_object('id', uid),
    'note', 'Everything your account can see in Kitchen Pantry, one list per table. Shared households include what other members added.'
  );

  foreach t in array tables loop
    begin
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into rows;
      out := out || jsonb_build_object(t, rows);
    exception when insufficient_privilege or undefined_table then
      -- Not readable by this person (or not installed): leave it out.
      null;
    end;
  end loop;

  -- Only the household's own recipes (and their ingredients and steps), not the public library.
  begin
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into rows from public.recipes r where r.household_id is not null;
    out := out || jsonb_build_object('recipes', rows);
    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into rows
      from public.recipe_ingredients i join public.recipes r on r.id = i.recipe_id where r.household_id is not null;
    out := out || jsonb_build_object('recipe_ingredients', rows);
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into rows
      from public.recipe_instructions s join public.recipes r on r.id = s.recipe_id where r.household_id is not null;
    out := out || jsonb_build_object('recipe_instructions', rows);
  exception when insufficient_privilege then
    null;
  end;

  return out;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
