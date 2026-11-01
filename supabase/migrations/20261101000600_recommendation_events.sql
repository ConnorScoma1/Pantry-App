-- =============================================================================
-- Recommendation history
--  * recommendation_events: what the household opened, cooked, or said
--    "Not for us" to. Append-only — undoing a dismiss is a new
--    'undismissed' event, so the history stays honest.
--  * dismissed_recipe_ids(): recipes whose latest dismiss/undismiss event
--    for this household is 'dismissed'.
-- Later milestones (Surprise Me, proactive planning) read this to avoid
-- repeats; favourites and explicit requests stay exempt there.
-- =============================================================================

create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  event text not null check (event in ('shown', 'opened', 'cooked', 'dismissed', 'undismissed')),
  surface text not null check (surface in ('home', 'recipes', 'detail', 'plan')),
  created_at timestamptz not null default now()
);
create index recommendation_events_household_idx
  on public.recommendation_events (household_id, created_at desc);
create index recommendation_events_recipe_idx
  on public.recommendation_events (household_id, recipe_id, created_at desc);

alter table public.recommendation_events enable row level security;

create policy recommendation_events_select on public.recommendation_events
  for select to authenticated
  using (public.is_household_member(household_id));

create policy recommendation_events_insert_own on public.recommendation_events
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_household_member(household_id)
    and public.can_read_recipe(recipe_id)
  );
-- No update or delete policies: the log is append-only for users.

revoke all on public.recommendation_events from anon;
grant select, insert on public.recommendation_events to authenticated;

create or replace function public.dismissed_recipe_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select recipe_id
  from (
    select distinct on (recipe_id) recipe_id, event
    from public.recommendation_events
    where household_id = public.current_household_id()
      and event in ('dismissed', 'undismissed')
    order by recipe_id, created_at desc, id desc
  ) latest
  where event = 'dismissed';
$$;
revoke all on function public.dismissed_recipe_ids() from public;
grant execute on function public.dismissed_recipe_ids() to authenticated;
