-- =============================================================================
-- Saved grocery lists (spec 01 §9: "Save lists").
--
-- Review before applying. Adds one table and two functions; nothing is
-- deleted or changed.
--
--   * saved_grocery_lists — named lists a household keeps ("Weekly basics",
--     "Costco run"): item names, aisles, amounts and notes only (no checked
--     state, no prices). Shared by the household; any member can save, use,
--     rename or delete one. At most 30 per household, 150 items each.
--   * save_grocery_list(name, items) — saves (or replaces, by name) a list.
--   * add_saved_list(saved, target_list) — adds a saved list's items to the
--     household's shopping list, skipping anything already on it and not yet
--     bought. Both run as the caller, so row-level security applies.
-- =============================================================================

-- Shape check for the stored items (also used by the table's check).
create or replace function public.valid_saved_grocery_items(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 150
    and not exists (
      select 1 from jsonb_array_elements(items) i
      where jsonb_typeof(i) <> 'object'
         or exists (select 1 from jsonb_object_keys(i) k where k not in ('name', 'department', 'amount', 'note'))
         or coalesce(jsonb_typeof(i -> 'name'), '') <> 'string'
         or char_length(btrim(i ->> 'name')) not between 1 and 120
         or coalesce(i ->> 'department', '') not in ('produce','meat_seafood','dairy','bakery','pantry','frozen','spices','other')
         or (i ? 'amount' and jsonb_typeof(i -> 'amount') not in ('string', 'null'))
         or char_length(coalesce(i ->> 'amount', '')) > 60
         or (i ? 'note' and jsonb_typeof(i -> 'note') not in ('string', 'null'))
         or char_length(coalesce(i ->> 'note', '')) > 200
    ), false);
$$;

create table public.saved_grocery_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  items jsonb not null check (public.valid_saved_grocery_items(items)),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index saved_grocery_lists_name_idx on public.saved_grocery_lists (household_id, lower(btrim(name)));
create trigger set_updated_at before update on public.saved_grocery_lists for each row execute function public.set_updated_at();

alter table public.saved_grocery_lists enable row level security;
create policy saved_grocery_lists_members on public.saved_grocery_lists
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
revoke all on public.saved_grocery_lists from anon, authenticated;
grant select, delete on public.saved_grocery_lists to authenticated;
grant update (name) on public.saved_grocery_lists to authenticated;

-- Save a list for the caller's active household (replacing one with the same name).
create or replace function public.save_grocery_list(list_name text, items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid := public.current_household_id();
  clean text := btrim(coalesce(list_name, ''));
  rid uuid;
begin
  if (select auth.uid()) is null or hh is null or not public.is_household_member(hh) then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(clean) not between 1 and 60 then
    raise exception 'Give the list a name (60 characters or fewer).' using errcode = 'check_violation';
  end if;
  if not public.valid_saved_grocery_items(items) then
    raise exception 'A saved list needs 1 to 150 items.' using errcode = 'check_violation';
  end if;
  select id into rid from public.saved_grocery_lists where household_id = hh and lower(btrim(name)) = lower(clean);
  if rid is not null then
    update public.saved_grocery_lists set items = save_grocery_list.items, name = clean where id = rid;
    return rid;
  end if;
  if (select count(*) from public.saved_grocery_lists where household_id = hh) >= 30 then
    raise exception 'Your household has 30 saved lists — delete one first.' using errcode = 'check_violation';
  end if;
  insert into public.saved_grocery_lists (household_id, name, items) values (hh, clean, save_grocery_list.items) returning id into rid;
  return rid;
end;
$$;
revoke all on function public.save_grocery_list(text, jsonb) from public, anon;
grant execute on function public.save_grocery_list(text, jsonb) to authenticated;

-- Put a saved list's items on a shopping list. Runs as the caller (RLS):
-- both lists must belong to a household they're in, and the same one.
create or replace function public.add_saved_list(saved uuid, target_list uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.saved_grocery_lists%rowtype;
  list_household uuid;
  inserted integer;
begin
  select * into s from public.saved_grocery_lists where id = saved;
  if not found then
    raise exception 'That saved list is gone.' using errcode = '42501';
  end if;
  select household_id into list_household from public.grocery_lists where id = target_list;
  if list_household is null or list_household <> s.household_id then
    raise exception 'List not found' using errcode = '42501';
  end if;
  if (select count(*) from public.grocery_list_items where grocery_list_id = target_list) + jsonb_array_length(s.items) > 500 then
    raise exception 'The list is full. Clear some checked items first.' using errcode = 'check_violation';
  end if;
  insert into public.grocery_list_items (grocery_list_id, name, department, amount_text, note, source, is_custom)
  select distinct on (lower(btrim(i ->> 'name')))
    target_list, left(btrim(i ->> 'name'), 120), i ->> 'department', nullif(left(i ->> 'amount', 60), ''), nullif(left(i ->> 'note', 200), ''), 'manual', true
  from jsonb_array_elements(s.items) i
  where not exists (
    select 1 from public.grocery_list_items x
    where x.grocery_list_id = target_list and not x.is_checked and lower(btrim(x.name)) = lower(btrim(i ->> 'name'))
  )
  order by lower(btrim(i ->> 'name'));
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
revoke all on function public.add_saved_list(uuid, uuid) from public, anon;
grant execute on function public.add_saved_list(uuid, uuid) to authenticated;
