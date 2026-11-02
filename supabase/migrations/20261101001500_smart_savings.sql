-- =============================================================================
-- Smart Savings (spec 02 §7, milestone 12).
--
-- Review before applying. Adds columns, one table and functions; nothing is
-- deleted and existing rows are untouched.
--   * pantry_transactions.price_paid_cents / use_by — copied from the item
--     when it's added, changed or removed, so "value of food used" and "food
--     rescued before its use-by date" can be worked out after the item is
--     gone. Only what the household typed is recorded; nothing is estimated.
--     Older log rows simply have no price (they show as "no price").
--   * grocery_spending — what the household actually spent on a shop, typed
--     in by a member (optionally linked to a cart they ordered). This is the
--     only source for spending trends: the app never guesses spending.
--   * savings_overview(since) — one read for the dashboard, for the current
--     household only (row-level security still applies).
-- =============================================================================

alter table public.pantry_transactions
  add column price_paid_cents integer check (price_paid_cents >= 0),
  add column use_by date;

-- Same as before, plus the item's price paid and use-by date on every log row.
create or replace function public.log_pantry_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pantry_transactions
      (household_id, pantry_item_id, item_name, reason, quantity_delta, unit, normalized_delta, normalized_unit, price_paid_cents, use_by)
    values
      (new.household_id, new.id, new.name, 'added', coalesce(new.quantity, 0), new.unit,
       new.normalized_quantity, new.normalized_unit, new.price_paid_cents, new.use_by);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.household_id <> old.household_id then
      raise exception 'Pantry items cannot move between households' using errcode = '42501';
    end if;
    if new.quantity is distinct from old.quantity
       or new.unit is distinct from old.unit
       or new.estimated_remaining_pct is distinct from old.estimated_remaining_pct then
      insert into public.pantry_transactions
        (household_id, pantry_item_id, item_name, reason, quantity_delta, unit, normalized_delta, normalized_unit, price_paid_cents, use_by)
      values
        (new.household_id, new.id, new.name, 'adjusted',
         case when new.unit is not distinct from old.unit
              then coalesce(new.quantity, 0) - coalesce(old.quantity, 0)
              else coalesce(new.quantity, 0) end,
         new.unit,
         case when new.normalized_unit is not distinct from old.normalized_unit
              then coalesce(new.normalized_quantity, 0) - coalesce(old.normalized_quantity, 0)
              else new.normalized_quantity end,
         new.normalized_unit, new.price_paid_cents, new.use_by);
    end if;
    return new;
  else -- DELETE
    -- Skip logging when the whole household is being deleted (cascade).
    if exists (select 1 from public.households h where h.id = old.household_id) then
      insert into public.pantry_transactions
        (household_id, pantry_item_id, item_name, reason, quantity_delta, unit, normalized_delta, normalized_unit, price_paid_cents, use_by)
      values
        (old.household_id, null, old.name,
         coalesce(nullif(current_setting('kitchen.pantry_removal_reason', true), ''), 'discarded'),
         -coalesce(old.quantity, 0), old.unit, -old.normalized_quantity, old.normalized_unit, old.price_paid_cents, old.use_by);
    end if;
    return old;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- What the household spent (typed in by a member)
-- -----------------------------------------------------------------------------
create table public.grocery_spending (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households (id) on delete cascade,
  spent_on date not null check (spent_on >= date '2000-01-01'),
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  store_name text check (char_length(store_name) <= 120),
  note text check (char_length(note) <= 200),
  -- The ordered cart this shop was for, if any (one entry per cart).
  cart_draft_id uuid unique references public.cart_drafts (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grocery_spending_household_idx on public.grocery_spending (household_id, spent_on desc);
create trigger grocery_spending_updated_at before update on public.grocery_spending for each row execute function public.set_updated_at();

-- No future dates (a day of slack for time zones), and a linked cart must be this household's.
create or replace function public.check_grocery_spending()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.spent_on > current_date + 1 then
    raise exception 'That date is in the future' using errcode = 'check_violation';
  end if;
  if new.cart_draft_id is not null and not exists (
    select 1 from public.cart_drafts d where d.id = new.cart_draft_id and d.household_id = new.household_id
  ) then
    raise exception 'That order belongs to another household' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.household_id <> old.household_id then
    raise exception 'Spending cannot move between households' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger grocery_spending_check before insert or update on public.grocery_spending
  for each row execute function public.check_grocery_spending();

alter table public.grocery_spending enable row level security;
create policy grocery_spending_select on public.grocery_spending
  for select to authenticated using (public.is_household_member(household_id));
create policy grocery_spending_insert on public.grocery_spending
  for insert to authenticated
  with check (household_id = public.current_household_id() and public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy grocery_spending_update on public.grocery_spending
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy grocery_spending_delete on public.grocery_spending
  for delete to authenticated using (public.is_household_member(household_id));
revoke all on public.grocery_spending from anon, authenticated;
grant select, insert, delete on public.grocery_spending to authenticated;
grant update (spent_on, amount_cents, store_name, note) on public.grocery_spending to authenticated;

-- -----------------------------------------------------------------------------
-- Dashboard read (current household only)
-- -----------------------------------------------------------------------------
create or replace function public.savings_overview(since date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with hh as (select public.current_household_id() as id)
  select jsonb_build_object(
    'pantry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemName', coalesce(t.item_name, 'Item'), 'reason', t.reason, 'pricePaidCents', t.price_paid_cents,
        'useBy', t.use_by, 'at', t.created_at) order by t.created_at desc)
      from (select * from public.pantry_transactions x
            where x.household_id = (select id from hh)
              and x.reason in ('consumed', 'discarded', 'expired')
              and x.created_at >= since
            order by x.created_at desc limit 2000) t), '[]'::jsonb),
    'spending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'spentOn', s.spent_on, 'amountCents', s.amount_cents, 'storeName', s.store_name,
        'note', s.note, 'cartDraftId', s.cart_draft_id, 'createdAt', s.created_at) order by s.spent_on desc, s.created_at desc)
      from public.grocery_spending s
      where s.household_id = (select id from hh) and s.spent_on >= since), '[]'::jsonb),
    'carts', coalesce((
      select jsonb_agg(public.cart_draft_json(d) order by d.created_at desc)
      from (select * from public.cart_drafts c
            where c.household_id = (select id from hh)
              and c.status in ('sent', 'link_ready')
              and c.created_at >= since
            order by c.created_at desc limit 100) d), '[]'::jsonb)
  )
  where (select id from hh) is not null and public.is_household_member((select id from hh));
$$;
revoke all on function public.savings_overview(date) from public, anon;
grant execute on function public.savings_overview(date) to authenticated;
