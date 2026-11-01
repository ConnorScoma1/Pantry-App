-- =============================================================================
-- My Kitchen inventory
--  * pantry_items.household_id defaults to the caller's active household
--  * every insert / quantity change / removal is logged to pantry_transactions
--    by trigger, so no write path can skip the audit trail
--  * pantry_remove_item(id, reason) records WHY something left the kitchen
--  * search_ingredients(q) powers the add-item search box
-- =============================================================================

create or replace function public.current_household_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.active_household_id from public.profiles p where p.id = (select auth.uid());
$$;
revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated;

alter table public.pantry_items
  alter column household_id set default public.current_household_id();

-- 'other' is allowed by the column check already; document the remaining-amount scale.
comment on column public.pantry_items.estimated_remaining_pct is
  'Rough amount left (100 = full/unopened, 25 = about a quarter). Null when not tracked.';
comment on column public.pantry_items.quantity is
  'Null means "have it" without tracking an amount (typical for staples like salt).';

-- -----------------------------------------------------------------------------
-- Transaction log trigger
-- -----------------------------------------------------------------------------
-- Keep the item name in the log after the item row is gone.
alter table public.pantry_transactions add column item_name text;

create or replace function public.log_pantry_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pantry_transactions
      (household_id, pantry_item_id, item_name, reason, quantity_delta, unit, normalized_delta, normalized_unit)
    values
      (new.household_id, new.id, new.name, 'added', coalesce(new.quantity, 0), new.unit,
       new.normalized_quantity, new.normalized_unit);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.household_id <> old.household_id then
      raise exception 'Pantry items cannot move between households' using errcode = '42501';
    end if;
    if new.quantity is distinct from old.quantity
       or new.unit is distinct from old.unit
       or new.estimated_remaining_pct is distinct from old.estimated_remaining_pct then
      insert into public.pantry_transactions
        (household_id, pantry_item_id, item_name, reason, quantity_delta, unit, normalized_delta, normalized_unit)
      values
        (new.household_id, new.id, new.name, 'adjusted',
         case when new.unit is not distinct from old.unit
              then coalesce(new.quantity, 0) - coalesce(old.quantity, 0)
              else coalesce(new.quantity, 0) end,
         new.unit,
         case when new.normalized_unit is not distinct from old.normalized_unit
              then coalesce(new.normalized_quantity, 0) - coalesce(old.normalized_quantity, 0)
              else new.normalized_quantity end,
         new.normalized_unit);
    end if;
    return new;
  else -- DELETE
    -- Skip logging when the whole household is being deleted (cascade).
    if exists (select 1 from public.households h where h.id = old.household_id) then
      insert into public.pantry_transactions
        (household_id, pantry_item_id, item_name, reason, quantity_delta, unit, normalized_delta, normalized_unit)
      values
        (old.household_id, null, old.name,
         coalesce(nullif(current_setting('kitchen.pantry_removal_reason', true), ''), 'discarded'),
         -coalesce(old.quantity, 0), old.unit, -old.normalized_quantity, old.normalized_unit);
    end if;
    return old;
  end if;
end;
$$;

create trigger pantry_items_log_insert
  after insert on public.pantry_items
  for each row execute function public.log_pantry_change();
create trigger pantry_items_log_update
  after update on public.pantry_items
  for each row execute function public.log_pantry_change();
create trigger pantry_items_log_delete
  before delete on public.pantry_items
  for each row execute function public.log_pantry_change();

-- -----------------------------------------------------------------------------
-- Remove an item with a reason (used up / thrown out / expired)
-- -----------------------------------------------------------------------------
create or replace function public.pantry_remove_item(item_id uuid, reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if reason not in ('consumed', 'discarded', 'expired') then
    raise exception 'Unknown removal reason: %', reason using errcode = '22023';
  end if;
  perform set_config('kitchen.pantry_removal_reason', reason, true);
  delete from public.pantry_items where id = item_id;
  if not found then
    -- Missing, or not visible under RLS: same answer either way.
    raise exception 'Pantry item not found' using errcode = 'P0002';
  end if;
  perform set_config('kitchen.pantry_removal_reason', '', true);
end;
$$;
revoke all on function public.pantry_remove_item(uuid, text) from public;
grant execute on function public.pantry_remove_item(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Ingredient search: name, aliases and fuzzy (trigram) matches
-- -----------------------------------------------------------------------------
create or replace function public.search_ingredients(query text, max_results integer default 8)
returns setof public.ingredients
language sql
stable
security invoker
set search_path = ''
as $$
  select i.*
  from public.ingredients i
  where length(trim(query)) >= 1
    and (
      i.canonical_name ilike '%' || trim(query) || '%'
      or exists (select 1 from unnest(i.aliases) a where a ilike '%' || trim(query) || '%')
      or extensions.similarity(i.canonical_name, trim(query)) > 0.3
    )
  order by
    (i.canonical_name ilike trim(query) || '%') desc,
    extensions.similarity(i.canonical_name, trim(query)) desc,
    i.canonical_name
  limit least(greatest(max_results, 1), 25);
$$;
revoke all on function public.search_ingredients(text, integer) from public;
grant execute on function public.search_ingredients(text, integer) to authenticated;
