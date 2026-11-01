-- =============================================================================
-- Recipes & ratings
--  * recipe tags / tips, and the plain ingredient name used for matching
--  * ratings default to the caller's household
--  * recipe_rating_summaries(ids): real aggregate ratings across households,
--    without exposing anyone's individual rating rows
-- =============================================================================

alter table public.recipes
  add column tags text[] not null default '{}',
  add column tips text[] not null default '{}';
create index recipes_tags_idx on public.recipes using gin (tags);

-- The ingredient itself ("boneless chicken thighs"), separate from the
-- formatted line in raw_text. Used for pantry matching and allergen screening.
alter table public.recipe_ingredients add column item text;
update public.recipe_ingredients set item = raw_text where item is null;
alter table public.recipe_ingredients alter column item set not null;

alter table public.recipe_ratings
  alter column household_id set default public.current_household_id();
create index recipe_ratings_household_idx on public.recipe_ratings (household_id, created_at desc);

create or replace function public.recipe_rating_summaries(recipe_ids uuid[])
returns table (recipe_id uuid, average numeric, rating_count bigint, would_cook_again_pct numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.recipe_id,
    round(avg(r.overall)::numeric, 2),
    count(*),
    round(100.0 * avg(case when r.would_cook_again then 1 when r.would_cook_again = false then 0 end), 1)
  from public.recipe_ratings r
  where r.recipe_id = any(recipe_ids)
    and public.can_read_recipe(r.recipe_id)
  group by r.recipe_id;
$$;
revoke all on function public.recipe_rating_summaries(uuid[]) from public;
grant execute on function public.recipe_rating_summaries(uuid[]) to authenticated;
