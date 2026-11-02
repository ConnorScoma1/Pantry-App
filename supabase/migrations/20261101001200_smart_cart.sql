-- =============================================================================
-- Smart Cart Checkout (spec 07).
--
-- Review before applying. Adds tables and functions only; nothing is deleted.
-- Schema reviewed first (docs/ARCHITECTURE.md §9):
--   * cart_drafts — one open cart per household, built from the shared grocery
--     list and shared with every member for review. Lines (chosen products,
--     counts, approvals) live in a shape-checked jsonb array; prices in it are
--     the retailer's at matching time and are labelled as estimates in the app.
--   * The hand-off status (draft → approved → sending → sent / link_ready /
--     failed / unknown) is tracked separately from the shopping list (whose
--     items are only ticked by people) and from the purchase, which only the
--     household can report (`purchase`): the app never sees payment.
--   * Duplicate sends are prevented in the database: approving creates a
--     transfer key; begin_cart_transfer() lets exactly one send run per key
--     and returns the stored result to any retry. An interrupted send becomes
--     "unknown" and must be resolved by a person before anything is re-sent.
--   * Only the server (service role, acting for a named member) can start or
--     finish a send to a real retailer, so nobody can mark a cart "sent"
--     without the retailer having been asked. The practice retailer ('mock')
--     can be run by members themselves.
--   * retailer_connections — a person's OAuth tokens for a retailer, encrypted
--     by the server (RETAILER_TOKEN_KEY) and readable only by the server
--     (service role). Clients only learn whether they are connected.
--     No payment details are ever collected or stored.
-- =============================================================================

-- Shape check for stored cart lines (the app validates fully; this keeps
-- direct RPC calls from storing junk).
create or replace function public.cart_lines_valid(lines jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(lines) = 'array'
    and jsonb_array_length(lines) <= 150
    and not exists (
      select 1 from jsonb_array_elements(lines) l
      where jsonb_typeof(l) is distinct from 'object'
         or jsonb_typeof(l -> 'id') is distinct from 'string' or char_length(l ->> 'id') > 64
         or jsonb_typeof(l -> 'name') is distinct from 'string' or char_length(l ->> 'name') > 120
         or jsonb_typeof(l -> 'options') is distinct from 'array' or jsonb_array_length(l -> 'options') > 5
         or jsonb_typeof(l -> 'count') is distinct from 'number' or (l ->> 'count')::numeric not between 1 and 99
         or jsonb_typeof(l -> 'include') is distinct from 'boolean'
         or jsonb_typeof(l -> 'approved') is distinct from 'boolean'
         or pg_column_size(l) > 8000
    );
$$;

create table public.cart_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  retailer text not null check (retailer ~ '^[a-z0-9_-]{2,30}$'),
  store_id text check (store_id ~ '^[0-9A-Za-z-]{1,20}$'),
  store_name text check (char_length(store_name) <= 160),
  fulfillment text not null default 'pickup' check (fulfillment in ('pickup', 'delivery')),
  lines jsonb not null default '[]'::jsonb check (public.cart_lines_valid(lines)),
  status text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent', 'link_ready', 'failed', 'unknown')),
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  transfer_key uuid,
  sending_started_at timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  last_error text check (char_length(last_error) <= 300),
  purchase text not null default 'not_ordered' check (purchase in ('not_ordered', 'ordered')),
  purchase_reported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open cart per household; finished ones are kept as history.
create unique index cart_drafts_one_open on public.cart_drafts (household_id) where status in ('draft', 'approved', 'sending', 'unknown', 'failed');
create unique index cart_drafts_transfer_key on public.cart_drafts (transfer_key) where transfer_key is not null;
create index cart_drafts_household_idx on public.cart_drafts (household_id, created_at desc);
create trigger cart_drafts_updated_at before update on public.cart_drafts for each row execute function public.set_updated_at();

alter table public.cart_drafts enable row level security;
create policy cart_drafts_select on public.cart_drafts for select to authenticated using (public.is_household_member(household_id));
revoke all on public.cart_drafts from anon;
revoke insert, update, delete on public.cart_drafts from authenticated;
grant select on public.cart_drafts to authenticated;

create table public.retailer_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  retailer text not null check (retailer ~ '^[a-z0-9_-]{2,30}$'),
  -- AES-256-GCM ciphertext made by the server, bound to (user, retailer); the key never reaches the database or clients.
  token_ciphertext text not null check (char_length(token_ciphertext) <= 8000),
  scope text check (char_length(scope) <= 300),
  access_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, retailer)
);
create trigger retailer_connections_updated_at before update on public.retailer_connections for each row execute function public.set_updated_at();
-- Server only: RLS on, no policies for clients, no client privileges.
alter table public.retailer_connections enable row level security;
revoke all on public.retailer_connections from public, anon, authenticated;
grant select, insert, update, delete on public.retailer_connections to service_role;

-- "Am I connected to this retailer?" — the only thing clients may know.
create or replace function public.retailer_connected(retailer text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.retailer_connections c
    where c.user_id = (select auth.uid()) and c.retailer = retailer_connected.retailer
  );
$$;
revoke all on function public.retailer_connected(text) from public, anon;
grant execute on function public.retailer_connected(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- True when the caller is the server (Supabase service role).
create or replace function public.cart_is_server()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;
revoke all on function public.cart_is_server() from public, anon;
grant execute on function public.cart_is_server() to authenticated, service_role;

create or replace function public.cart_draft_json(d public.cart_drafts)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'retailer', d.retailer, 'storeId', d.store_id, 'storeName', d.store_name,
    'fulfillment', d.fulfillment, 'lines', d.lines, 'status', d.status, 'version', d.version,
    'createdBy', d.created_by, 'approvedBy', d.approved_by, 'approvedAt', d.approved_at,
    'transferKey', d.transfer_key, 'result', d.result, 'lastError', d.last_error,
    'purchase', d.purchase, 'createdAt', d.created_at, 'updatedAt', d.updated_at
  );
$$;
revoke all on function public.cart_draft_json(public.cart_drafts) from public, anon;
grant execute on function public.cart_draft_json(public.cart_drafts) to authenticated, service_role;

-- The household's open cart, or its latest one.
create or replace function public.current_cart_draft()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.cart_draft_json(d)
  from public.cart_drafts d
  where d.household_id = public.current_household_id()
  order by (d.status in ('draft', 'approved', 'sending', 'unknown', 'failed')) desc, d.created_at desc
  limit 1;
$$;
revoke all on function public.current_cart_draft() from public, anon;
grant execute on function public.current_cart_draft() to authenticated;

-- Who is acting: the signed-in member, or — for the server only — the member it acts for.
create or replace function public.cart_actor(acting_user uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  actor uuid := case when public.cart_is_server() then acting_user else (select auth.uid()) end;
begin
  if actor is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return actor;
end;
$$;
revoke all on function public.cart_actor(uuid) from public, anon, authenticated;

-- Lock a draft for a change by a member of its household.
create or replace function public.lock_cart_draft(draft uuid, actor uuid)
returns public.cart_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.cart_drafts;
begin
  select * into d from public.cart_drafts where id = draft for update;
  if not found or not exists (select 1 from public.household_members m where m.household_id = d.household_id and m.user_id = actor) then
    raise exception 'Cart not found' using errcode = 'P0002';
  end if;
  return d;
end;
$$;
revoke all on function public.lock_cart_draft(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Build and edit (any member). Editing an approved cart sends it back to draft.
-- -----------------------------------------------------------------------------
create or replace function public.save_cart_draft(
  draft uuid,
  retailer text,
  store_id text,
  store_name text,
  fulfillment text,
  lines jsonb,
  expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  d public.cart_drafts;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if hh is null or not public.is_household_member(hh) then
    raise exception 'No household for the current user' using errcode = '42501';
  end if;
  if not public.cart_lines_valid(lines) then
    raise exception 'Invalid cart lines' using errcode = '22023';
  end if;

  if draft is null then
    insert into public.cart_drafts (household_id, retailer, store_id, store_name, fulfillment, lines, created_by, updated_by)
    values (hh, retailer, store_id, store_name, coalesce(fulfillment, 'pickup'), lines, uid, uid)
    returning * into d;
    return public.cart_draft_json(d);
  end if;

  d := public.lock_cart_draft(draft, uid);
  if d.status not in ('draft', 'approved', 'failed') then
    raise exception 'This cart is % and can''t be changed', d.status using errcode = 'P0001', hint = 'cart_locked';
  end if;
  if expected_version is null or expected_version <> d.version then
    raise exception 'Someone else changed this cart. Reload to see their changes.' using errcode = 'P0001', hint = 'stale';
  end if;
  update public.cart_drafts c set
    retailer = save_cart_draft.retailer,
    store_id = save_cart_draft.store_id,
    store_name = save_cart_draft.store_name,
    fulfillment = coalesce(save_cart_draft.fulfillment, c.fulfillment),
    lines = save_cart_draft.lines,
    status = 'draft',
    approved_by = null,
    approved_at = null,
    transfer_key = null,
    last_error = null,
    version = c.version + 1,
    updated_by = uid
  where c.id = d.id
  returning * into d;
  return public.cart_draft_json(d);
end;
$$;
revoke all on function public.save_cart_draft(uuid, text, text, text, text, jsonb, integer) from public, anon;
grant execute on function public.save_cart_draft(uuid, text, text, text, text, jsonb, integer) to authenticated;

-- "The household has reviewed this; send it." Creates the transfer key.
create or replace function public.approve_cart_draft(draft uuid, expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d public.cart_drafts;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  d := public.lock_cart_draft(draft, uid);
  if d.status not in ('draft', 'failed') then
    raise exception 'This cart is %', d.status using errcode = 'P0001', hint = 'cart_locked';
  end if;
  if expected_version is null or expected_version <> d.version then
    raise exception 'Someone else changed this cart. Reload to see their changes.' using errcode = 'P0001', hint = 'stale';
  end if;
  update public.cart_drafts c set
    status = 'approved', approved_by = uid, approved_at = now(),
    transfer_key = coalesce(c.transfer_key, gen_random_uuid()), last_error = null, version = c.version + 1
  where c.id = d.id
  returning * into d;
  return public.cart_draft_json(d);
end;
$$;
revoke all on function public.approve_cart_draft(uuid, integer) from public, anon;
grant execute on function public.approve_cart_draft(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Sending. Real retailers: server only (acting for a member). Practice
-- retailer: members may run it themselves.
-- Returns {action: 'go' | 'done' | 'busy' | 'unknown' | 'invalid', draft}.
-- -----------------------------------------------------------------------------
create or replace function public.begin_cart_transfer(draft uuid, key uuid, acting_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.cart_drafts := public.lock_cart_draft(draft, public.cart_actor(acting_user));
  action text;
begin
  if d.retailer <> 'mock' and not public.cart_is_server() then
    raise exception 'Only the server can send this cart' using errcode = '42501';
  end if;
  if d.transfer_key is distinct from key then
    action := 'invalid';
  elsif d.status in ('sent', 'link_ready') then
    action := 'done';                          -- a retry: hand back the stored result, send nothing
  elsif d.status = 'sending' then
    if d.sending_started_at > now() - interval '5 minutes' then
      action := 'busy';
    else
      update public.cart_drafts set status = 'unknown', last_error = 'The send was interrupted.' where id = d.id returning * into d;
      action := 'unknown';
    end if;
  elsif d.status = 'unknown' then
    action := 'unknown';
  elsif d.status = 'approved' then
    update public.cart_drafts set status = 'sending', sending_started_at = now(), last_error = null where id = d.id returning * into d;
    action := 'go';
  else
    action := 'invalid';
  end if;
  return jsonb_build_object('action', action, 'draft', public.cart_draft_json(d));
end;
$$;
revoke all on function public.begin_cart_transfer(uuid, uuid, uuid) from public, anon;
grant execute on function public.begin_cart_transfer(uuid, uuid, uuid) to authenticated, service_role;

-- outcome: 'sent' (retailer confirmed) | 'link_ready' | 'not_sent' (nothing reached the retailer; can retry) | 'unknown'
create or replace function public.finish_cart_transfer(draft uuid, key uuid, outcome text, result jsonb, error text, acting_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  server boolean := public.cart_is_server();
  d public.cart_drafts := public.lock_cart_draft(draft, public.cart_actor(acting_user));
begin
  if d.retailer <> 'mock' and not server then
    raise exception 'Only the server can finish this send' using errcode = '42501';
  end if;
  if d.transfer_key is distinct from key or d.status <> 'sending' then
    raise exception 'This send is no longer active' using errcode = 'P0001', hint = 'not_sending';
  end if;
  if outcome not in ('sent', 'link_ready', 'not_sent', 'unknown') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;
  if outcome in ('sent', 'link_ready') then
    if result is null or jsonb_typeof(result) <> 'object'
       or (outcome = 'sent' and (result ->> 'kind' is distinct from 'cart_confirmed'
            or (result ->> 'confirmedBy') not in ('retailer_api', 'mock')
            or (result ->> 'checkoutUrl' is not null and ((result ->> 'checkoutUrl') !~ '^https://[^\s]+$' or char_length(result ->> 'checkoutUrl') > 300))))
       or (outcome = 'link_ready' and (result ->> 'kind' is distinct from 'link' or coalesce(result ->> 'url', '') !~ '^https://[^\s]+$' or char_length(result ->> 'url') > 1000))
    then
      raise exception 'Invalid send result' using errcode = '22023';
    end if;
    -- Only the server may report a real retailer's answer; a member's practice run is always "mock", with no link.
    if not server and (outcome <> 'sent' or result ->> 'confirmedBy' <> 'mock' or result ->> 'checkoutUrl' is not null) then
      raise exception 'Invalid send result' using errcode = '22023';
    end if;
  end if;
  update public.cart_drafts set
    status = case outcome when 'not_sent' then 'failed' else outcome end,
    result = case when outcome in ('sent', 'link_ready') then finish_cart_transfer.result else null end,
    last_error = left(error, 300),
    sending_started_at = null
  where id = d.id
  returning * into d;
  return public.cart_draft_json(d);
end;
$$;
revoke all on function public.finish_cart_transfer(uuid, uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function public.finish_cart_transfer(uuid, uuid, text, jsonb, text, uuid) to authenticated, service_role;

-- After an interrupted send, a person checks the retailer cart and says what they saw.
create or replace function public.resolve_cart_transfer(draft uuid, items_were_added boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.cart_drafts := public.lock_cart_draft(draft, public.cart_actor(null));
begin
  if d.status <> 'unknown' then
    raise exception 'Nothing to resolve' using errcode = 'P0001', hint = 'not_unknown';
  end if;
  update public.cart_drafts c set
    status = case when items_were_added then 'sent' else 'approved' end,
    result = case when items_were_added
      then jsonb_build_object('kind', 'cart_confirmed', 'added', null, 'checkoutUrl', null, 'confirmedBy', 'household', 'at', now())
      else null end,
    -- A new key: the household checked that nothing was added, so a fresh send is safe.
    transfer_key = case when items_were_added then c.transfer_key else gen_random_uuid() end,
    last_error = null
  where c.id = d.id
  returning * into d;
  return public.cart_draft_json(d);
end;
$$;
revoke all on function public.resolve_cart_transfer(uuid, boolean) from public, anon;
grant execute on function public.resolve_cart_transfer(uuid, boolean) to authenticated;

-- What the household tells us about the order (not the shopping list).
create or replace function public.set_cart_purchase(draft uuid, ordered boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.cart_actor(null);
  d public.cart_drafts := public.lock_cart_draft(draft, uid);
begin
  if d.status not in ('sent', 'link_ready') then
    raise exception 'Send the cart first' using errcode = 'P0001', hint = 'not_sent';
  end if;
  update public.cart_drafts set
    purchase = case when ordered then 'ordered' else 'not_ordered' end,
    purchase_reported_by = case when ordered then uid else null end
  where id = d.id
  returning * into d;
  return public.cart_draft_json(d);
end;
$$;
revoke all on function public.set_cart_purchase(uuid, boolean) from public, anon;
grant execute on function public.set_cart_purchase(uuid, boolean) to authenticated;

create or replace function public.discard_cart_draft(draft uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.cart_drafts := public.lock_cart_draft(draft, public.cart_actor(null));
begin
  if d.status in ('sending', 'unknown') then
    raise exception 'Finish or resolve the send first' using errcode = 'P0001', hint = 'cart_locked';
  end if;
  delete from public.cart_drafts where id = d.id;
end;
$$;
revoke all on function public.discard_cart_draft(uuid) from public, anon;
grant execute on function public.discard_cart_draft(uuid) to authenticated;

-- Live review: members see each other's edits.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cart_drafts;
  end if;
end $$;
