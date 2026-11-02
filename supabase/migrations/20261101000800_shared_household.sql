-- =============================================================================
-- Shared households (spec 04) — part 1: invitations, membership, and a
-- shared grocery list that syncs in real time.
--
-- Review before applying. Nothing here deletes existing data:
--   * new table household_invites; new columns on grocery_list_items
--   * membership changes move to SECURITY DEFINER functions with explicit
--     checks (the old "owners may insert/update/delete members directly"
--     policies are replaced, so membership can only change through invites,
--     removal, leaving or ownership transfer)
--   * grocery tables are added to the supabase_realtime publication
--
-- Model
--   * A household has one owner and up to 5 more members (6 people).
--   * A person can belong to several households; profiles.active_household_id
--     picks the one the app shows (and current_household_id() returns).
--   * Personal preferences (skill, goals, favourite cuisines/proteins) stay in
--     user_preferences and are never shared.
--   * Allergies, dietary restrictions, dislikes and "never recommend" items
--     are now PERSONAL (member_allergies, member_diet_items). Each person only
--     reads and edits their own. household_allergies and dietary_restrictions
--     become the combined list for everyone in the household, rebuilt by the
--     database whenever someone saves, joins, leaves or is removed — so shared
--     plans stay safe for everyone eating them, and nobody can delete another
--     person's allergy by editing their own profile.
--   * Existing allergy/diet rows are copied to every current member of that
--     household before anything is rebuilt, so no one loses a protection.
--   * Household settings (size, budget, diet style, equipment, store) stay shared.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Personal allergies and diet
-- -----------------------------------------------------------------------------
create table public.member_allergies (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  allergen_code text not null references public.allergens (code),
  created_at timestamptz not null default now(),
  primary key (user_id, allergen_code)
);
create table public.member_diet_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('restriction', 'dislike', 'exclude')),
  value text not null check (char_length(value) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index member_diet_items_unique_idx on public.member_diet_items (user_id, kind, lower(value));

alter table public.member_allergies enable row level security;
alter table public.member_diet_items enable row level security;
-- Health-related: each person sees only their own. Others see the household's combined list.
create policy member_allergies_own on public.member_allergies
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy member_diet_items_own on public.member_diet_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.member_allergies, public.member_diet_items from anon;
grant select, insert, update, delete on public.member_allergies, public.member_diet_items to authenticated;

-- Backfill: every current member keeps the household's existing selections.
insert into public.member_allergies (user_id, allergen_code, created_at)
  select m.user_id, a.allergen_code, a.created_at
  from public.household_allergies a
  join public.household_members m on m.household_id = a.household_id
  on conflict do nothing;
insert into public.member_diet_items (user_id, kind, value, created_at)
  select m.user_id, r.kind, r.value, r.created_at
  from public.dietary_restrictions r
  join public.household_members m on m.household_id = r.household_id
  on conflict do nothing;

-- Rebuild a household's combined allergy / diet list from its members.
-- Internal: called by the functions below, not by the app.
create or replace function public.refresh_household_diet(target_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.household_allergies where household_id = target_household;
  insert into public.household_allergies (household_id, allergen_code)
    select distinct target_household, a.allergen_code
    from public.member_allergies a
    join public.household_members m on m.user_id = a.user_id and m.household_id = target_household
    on conflict do nothing;

  delete from public.dietary_restrictions where household_id = target_household;
  insert into public.dietary_restrictions (household_id, kind, value, created_at)
    select distinct on (d.kind, lower(d.value)) target_household, d.kind, d.value, d.created_at
    from public.member_diet_items d
    join public.household_members m on m.user_id = d.user_id and m.household_id = target_household
    order by d.kind, lower(d.value), d.created_at
    on conflict do nothing;
end;
$$;
revoke all on function public.refresh_household_diet(uuid) from public;
revoke all on function public.refresh_household_diet(uuid) from anon;
revoke all on function public.refresh_household_diet(uuid) from authenticated;

-- What the app's own save calls: rebuilds only the caller's households.
create or replace function public.refresh_my_household_diets()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid;
begin
  for hh in select m.household_id from public.household_members m where m.user_id = (select auth.uid()) loop
    perform public.refresh_household_diet(hh);
  end loop;
end;
$$;
revoke all on function public.refresh_my_household_diets() from public;
revoke all on function public.refresh_my_household_diets() from anon;
grant execute on function public.refresh_my_household_diets() to authenticated;

-- Onboarding / profile save: shared settings go to the household, diet
-- choices to the person, then the household's combined list is rebuilt.
create or replace function public.save_onboarding_profile(profile jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
  h jsonb := profile -> 'household';
  b jsonb := profile -> 'budget';
  d jsonb := profile -> 'diet';
  s jsonb := profile -> 'store';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if h is null or b is null or d is null or s is null then
    raise exception 'Incomplete onboarding profile' using errcode = '22023';
  end if;

  select p.active_household_id into hid from public.profiles p where p.id = uid;

  if hid is null or not public.is_household_member(hid) then
    hid := gen_random_uuid();
    insert into public.households (id, created_by, postal_code)
    values (hid, uid, h ->> 'postalCode');
  end if;

  update public.households set
    country_code = h ->> 'country',
    postal_code = h ->> 'postalCode',
    adults = (h ->> 'adults')::smallint,
    children = (h ->> 'children')::smallint,
    cooking_for = (h ->> 'cookingFor')::smallint,
    dinners_per_week = (h ->> 'dinnersPerWeek')::smallint,
    meals_included = array(select jsonb_array_elements_text(h -> 'mealsIncluded')),
    servings_by_meal = coalesce(h -> 'servingsByMeal', '{}'::jsonb),
    budget_amount_cents = (b ->> 'amountCents')::integer,
    budget_period = b ->> 'period',
    budget_includes = array(select jsonb_array_elements_text(b -> 'includes')),
    budget_priority = b ->> 'priority',
    diet_style = d ->> 'style',
    usual_retailer = nullif(s ->> 'usualRetailer', ''),
    preferred_store_location_id = (s ->> 'storeLocationId')::uuid
  where id = hid;

  -- The caller's own allergy and diet choices.
  delete from public.member_allergies where user_id = uid;
  insert into public.member_allergies (user_id, allergen_code)
  select uid, a from jsonb_array_elements_text(d -> 'allergies') a
  on conflict do nothing;

  delete from public.member_diet_items where user_id = uid;
  insert into public.member_diet_items (user_id, kind, value)
  select uid, 'restriction', v from jsonb_array_elements_text(d -> 'restrictions') v
  union
  select uid, 'dislike', v from jsonb_array_elements_text(d -> 'dislikes') v
  union
  select uid, 'exclude', v from jsonb_array_elements_text(d -> 'neverRecommend') v
  on conflict do nothing;

  delete from public.household_equipment where household_id = hid;
  insert into public.household_equipment (household_id, equipment_code)
  select hid, e from jsonb_array_elements_text(profile -> 'equipment') e;

  insert into public.user_preferences as up (
    user_id, skill_level, goals_ranked, preferred_cuisines, preferred_proteins,
    calories_per_day, protein_grams_per_day
  ) values (
    uid,
    (profile ->> 'skillLevel')::smallint,
    array(select jsonb_array_elements_text(profile -> 'goals' -> 'ranked')),
    array(select jsonb_array_elements_text(d -> 'cuisines')),
    array(select jsonb_array_elements_text(d -> 'proteins')),
    (d -> 'nutrition' ->> 'caloriesPerDay')::integer,
    (d -> 'nutrition' ->> 'proteinGramsPerDay')::integer
  )
  on conflict (user_id) do update set
    skill_level = excluded.skill_level,
    goals_ranked = excluded.goals_ranked,
    preferred_cuisines = excluded.preferred_cuisines,
    preferred_proteins = excluded.preferred_proteins,
    calories_per_day = excluded.calories_per_day,
    protein_grams_per_day = excluded.protein_grams_per_day;

  update public.profiles set
    active_household_id = hid,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = uid;

  -- Rebuild every household this person belongs to (their choices apply in each).
  perform public.refresh_my_household_diets();

  return hid;
end;
$$;
revoke all on function public.save_onboarding_profile(jsonb) from public;
revoke all on function public.save_onboarding_profile(jsonb) from anon;
grant execute on function public.save_onboarding_profile(jsonb) to authenticated;

-- The profile in OnboardingProfile shape. `diet` holds the caller's OWN
-- choices; `householdDiet` is everyone's combined list (no names attached),
-- which meal planning uses so shared meals are safe for all.
create or replace function public.build_onboarding_profile(only_completed boolean)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'household', jsonb_build_object(
      'country', h.country_code,
      'postalCode', h.postal_code,
      'adults', h.adults,
      'children', h.children,
      'cookingFor', h.cooking_for,
      'dinnersPerWeek', h.dinners_per_week,
      'mealsIncluded', to_jsonb(h.meals_included),
      'servingsByMeal', h.servings_by_meal
    ),
    'budget', jsonb_build_object(
      'amountCents', h.budget_amount_cents,
      'period', h.budget_period,
      'includes', to_jsonb(h.budget_includes),
      'priority', h.budget_priority
    ),
    'goals', jsonb_build_object('ranked', to_jsonb(coalesce(up.goals_ranked, '{}'))),
    'diet', jsonb_build_object(
      'allergies', coalesce((select jsonb_agg(a.allergen_code order by a.allergen_code)
                             from public.member_allergies a where a.user_id = p.id), '[]'::jsonb),
      'style', h.diet_style,
      'restrictions', coalesce((select jsonb_agg(r.value order by r.value)
                                from public.member_diet_items r
                                where r.user_id = p.id and r.kind = 'restriction'), '[]'::jsonb),
      'dislikes', coalesce((select jsonb_agg(r.value order by r.created_at, r.value)
                            from public.member_diet_items r
                            where r.user_id = p.id and r.kind = 'dislike'), '[]'::jsonb),
      'neverRecommend', coalesce((select jsonb_agg(r.value order by r.created_at, r.value)
                                  from public.member_diet_items r
                                  where r.user_id = p.id and r.kind = 'exclude'), '[]'::jsonb),
      'cuisines', to_jsonb(coalesce(up.preferred_cuisines, '{}')),
      'proteins', to_jsonb(coalesce(up.preferred_proteins, '{}')),
      'nutrition', jsonb_build_object(
        'caloriesPerDay', up.calories_per_day,
        'proteinGramsPerDay', up.protein_grams_per_day
      )
    ),
    'householdDiet', jsonb_build_object(
      'allergies', coalesce((select jsonb_agg(a.allergen_code order by a.allergen_code)
                             from public.household_allergies a where a.household_id = h.id), '[]'::jsonb),
      'restrictions', coalesce((select jsonb_agg(r.value order by r.value)
                                from public.dietary_restrictions r
                                where r.household_id = h.id and r.kind = 'restriction'), '[]'::jsonb),
      'dislikes', coalesce((select jsonb_agg(r.value order by r.created_at, r.value)
                            from public.dietary_restrictions r
                            where r.household_id = h.id and r.kind = 'dislike'), '[]'::jsonb),
      'neverRecommend', coalesce((select jsonb_agg(r.value order by r.created_at, r.value)
                                  from public.dietary_restrictions r
                                  where r.household_id = h.id and r.kind = 'exclude'), '[]'::jsonb),
      'memberCount', (select count(*) from public.household_members x where x.household_id = h.id)
    ),
    'skillLevel', coalesce(up.skill_level, 2),
    'equipment', coalesce((select jsonb_agg(e.equipment_code order by e.equipment_code)
                           from public.household_equipment e where e.household_id = h.id), '[]'::jsonb),
    'store', jsonb_build_object(
      'usualRetailer', h.usual_retailer,
      'storeLocationId', h.preferred_store_location_id
    )
  )
  from public.profiles p
  join public.households h on h.id = p.active_household_id
  left join public.user_preferences up on up.user_id = p.id
  where p.id = (select auth.uid())
    and public.is_household_member(h.id)
    and (not only_completed or p.onboarding_completed_at is not null);
$$;
revoke all on function public.build_onboarding_profile(boolean) from public;
revoke all on function public.build_onboarding_profile(boolean) from anon;
grant execute on function public.build_onboarding_profile(boolean) to authenticated;

create or replace function public.get_onboarding_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.build_onboarding_profile(true);
$$;

-- For someone who joined a household before finishing onboarding: the
-- household's answers, so they only need to add their own.
create or replace function public.get_household_onboarding_draft()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.build_onboarding_profile(false);
$$;
revoke all on function public.get_household_onboarding_draft() from public;
revoke all on function public.get_household_onboarding_draft() from anon;
grant execute on function public.get_household_onboarding_draft() to authenticated;

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------
create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- SHA-256 of the token. The token itself is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Optional: when set, only the account with this email can accept.
  email text check (email is null or (char_length(email) <= 254 and email = lower(email))),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint household_invites_expiry check (expires_at > created_at and expires_at <= created_at + interval '14 days')
);
create index household_invites_household_idx on public.household_invites (household_id, created_at desc);

alter table public.household_invites enable row level security;
-- Owners can see their household's invites (the hash is useless without the token).
create policy household_invites_select_owner on public.household_invites
  for select to authenticated using (public.is_household_owner(household_id));
-- No insert/update/delete policies: invites change only through the functions below.
revoke all on public.household_invites from anon;
grant select on public.household_invites to authenticated;

create or replace function public.invite_token_hash(token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex');
$$;
revoke all on function public.invite_token_hash(text) from public;
revoke all on function public.invite_token_hash(text) from anon;

-- People in the household plus invites still waiting to be used.
create or replace function public.household_seats_used(target_household uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.household_members where household_id = target_household)::integer
    + (select count(*) from public.household_invites
        where household_id = target_household and accepted_at is null and revoked_at is null and expires_at > now())::integer;
$$;
revoke all on function public.household_seats_used(uuid) from public;
revoke all on function public.household_seats_used(uuid) from anon;

-- Returns the token ONCE. The link the app shares is /invite/<token>.
create or replace function public.create_household_invite(invite_email text default null, valid_days integer default 7)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  new_token text;
  normalized text := nullif(lower(btrim(invite_email)), '');
  created_today integer;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if hh is null or not public.is_household_owner(hh) then
    raise exception 'Only the household owner can invite people.' using errcode = '42501';
  end if;
  if valid_days is null or valid_days < 1 or valid_days > 14 then
    raise exception 'Invites can last between 1 and 14 days.' using errcode = '22023';
  end if;
  if normalized is not null and normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  if public.household_seats_used(hh) >= 6 then
    raise exception 'A household can have up to 6 people (you plus 5).' using errcode = 'P0001', hint = 'household_full';
  end if;
  select count(*) into created_today from public.household_invites i
    where i.household_id = hh and i.created_at > now() - interval '1 day';
  if created_today >= 20 then
    raise exception 'Too many invites today. Try again tomorrow.' using errcode = 'P0001', hint = 'invite_rate_limited';
  end if;

  -- Two v4 UUIDs from the server's strong random source: 244 random bits.
  new_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  return query
    insert into public.household_invites as i (household_id, token_hash, email, created_by, expires_at)
    values (hh, public.invite_token_hash(new_token), normalized, uid, now() + make_interval(days => valid_days))
    returning i.id, new_token, i.expires_at;
end;
$$;
revoke all on function public.create_household_invite(text, integer) from public;
revoke all on function public.create_household_invite(text, integer) from anon;
grant execute on function public.create_household_invite(text, integer) to authenticated;

-- What an invite is for, shown before accepting. Signed-in users only.
create or replace function public.household_invite_details(invite_token text)
returns table (household_name text, invited_by text, expires_at timestamptz, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.household_invites%rowtype;
  my_email text;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  select * into inv from public.household_invites where token_hash = public.invite_token_hash(coalesce(invite_token, ''));
  if not found then
    return query select null::text, null::text, null::timestamptz, 'invalid'::text;
    return;
  end if;
  select lower(u.email) into my_email from auth.users u where u.id = uid;
  return query
    select h.name, coalesce(p.display_name, 'A household member'), inv.expires_at,
      case
        when exists (select 1 from public.household_members m where m.household_id = inv.household_id and m.user_id = uid) then 'already_member'
        when inv.revoked_at is not null then 'revoked'
        when inv.accepted_at is not null then 'used'
        when inv.expires_at <= now() then 'expired'
        when inv.email is not null and inv.email is distinct from my_email then 'wrong_account'
        when (select count(*) from public.household_members m where m.household_id = inv.household_id) >= 6 then 'full'
        else 'valid'
      end
    from public.households h
    left join public.profiles p on p.id = inv.created_by
    where h.id = inv.household_id;
end;
$$;
revoke all on function public.household_invite_details(text) from public;
revoke all on function public.household_invite_details(text) from anon;
grant execute on function public.household_invite_details(text) to authenticated;

create or replace function public.accept_household_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.household_invites%rowtype;
  my_email text;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  select * into inv from public.household_invites
    where token_hash = public.invite_token_hash(coalesce(invite_token, ''))
    for update;
  if not found then
    raise exception 'This invite link isn''t valid.' using errcode = 'P0001', hint = 'invite_invalid';
  end if;

  -- Already in this household: just switch to it.
  if exists (select 1 from public.household_members m where m.household_id = inv.household_id and m.user_id = uid) then
    update public.profiles set active_household_id = inv.household_id where id = uid;
    return inv.household_id;
  end if;

  if inv.revoked_at is not null then
    raise exception 'This invite was cancelled.' using errcode = 'P0001', hint = 'invite_revoked';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'P0001', hint = 'invite_used';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = 'P0001', hint = 'invite_expired';
  end if;
  select lower(u.email) into my_email from auth.users u where u.id = uid;
  if inv.email is not null and inv.email is distinct from my_email then
    raise exception 'This invite is for a different email address.' using errcode = 'P0001', hint = 'invite_wrong_account';
  end if;
  if (select count(*) from public.household_members m where m.household_id = inv.household_id) >= 6 then
    raise exception 'This household is full.' using errcode = 'P0001', hint = 'household_full';
  end if;

  insert into public.household_members (household_id, user_id, role) values (inv.household_id, uid, 'member');

  -- Safety: the new member's allergies and diet now count for this household.
  perform public.refresh_household_diet(inv.household_id);

  update public.profiles set active_household_id = inv.household_id where id = uid;
  update public.household_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.household_id;
end;
$$;
revoke all on function public.accept_household_invite(text) from public;
revoke all on function public.accept_household_invite(text) from anon;
grant execute on function public.accept_household_invite(text) to authenticated;

create or replace function public.revoke_household_invite(target_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.household_invites where id = target_invite;
  if hh is null or not public.is_household_owner(hh) then
    raise exception 'Only the household owner can cancel invites.' using errcode = '42501';
  end if;
  update public.household_invites set revoked_at = coalesce(revoked_at, now())
    where id = target_invite and accepted_at is null;
end;
$$;
revoke all on function public.revoke_household_invite(uuid) from public;
revoke all on function public.revoke_household_invite(uuid) from anon;
grant execute on function public.revoke_household_invite(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Membership
-- -----------------------------------------------------------------------------
-- Membership now changes only through the functions in this file.
drop policy if exists household_members_insert_owner on public.household_members;
drop policy if exists household_members_update_owner on public.household_members;
drop policy if exists household_members_delete on public.household_members;

-- After leaving or removal, point the person at another household they're in (or none).
create or replace function public.fallback_active_household(target_user uuid, leaving uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
  set active_household_id = (
    select m.household_id from public.household_members m
    where m.user_id = target_user and m.household_id <> leaving
    order by m.created_at desc limit 1)
  where p.id = target_user and (p.active_household_id = leaving or p.active_household_id is null);
$$;
revoke all on function public.fallback_active_household(uuid, uuid) from public;
revoke all on function public.fallback_active_household(uuid, uuid) from anon;

-- People in the current household, with the names they chose.
create or replace function public.household_member_list()
returns table (user_id uuid, display_name text, role text, joined_at timestamptz, is_you boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, coalesce(p.display_name, 'Household member'), m.role, m.created_at, m.user_id = (select auth.uid())
  from public.household_members m
  left join public.profiles p on p.id = m.user_id
  where m.household_id = public.current_household_id()
    and public.is_household_member(m.household_id)
  order by (m.role = 'owner') desc, m.created_at;
$$;
revoke all on function public.household_member_list() from public;
revoke all on function public.household_member_list() from anon;
grant execute on function public.household_member_list() to authenticated;

-- Every household the caller belongs to (for switching).
create or replace function public.my_households()
returns table (household_id uuid, name text, role text, is_active boolean, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, m.role, h.id = public.current_household_id(),
    (select count(*) from public.household_members x where x.household_id = h.id)::integer
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = (select auth.uid())
  order by h.created_at;
$$;
revoke all on function public.my_households() from public;
revoke all on function public.my_households() from anon;
grant execute on function public.my_households() to authenticated;

create or replace function public.switch_household(target_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_household_member(target_household) then
    raise exception 'You''re not a member of that household.' using errcode = '42501';
  end if;
  update public.profiles set active_household_id = target_household where id = (select auth.uid());
end;
$$;
revoke all on function public.switch_household(uuid) from public;
revoke all on function public.switch_household(uuid) from anon;
grant execute on function public.switch_household(uuid) to authenticated;

create or replace function public.remove_household_member(member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid := public.current_household_id();
begin
  if hh is null or not public.is_household_owner(hh) then
    raise exception 'Only the household owner can remove people.' using errcode = '42501';
  end if;
  if member = (select auth.uid()) then
    raise exception 'You can''t remove yourself. Transfer ownership first.' using errcode = 'P0001', hint = 'owner_cannot_remove_self';
  end if;
  delete from public.household_members where household_id = hh and user_id = member and role = 'member';
  if not found then
    raise exception 'That person isn''t a member of this household.' using errcode = 'P0001', hint = 'not_a_member';
  end if;
  perform public.fallback_active_household(member, hh);
  perform public.refresh_household_diet(hh);
end;
$$;
revoke all on function public.remove_household_member(uuid) from public;
revoke all on function public.remove_household_member(uuid) from anon;
grant execute on function public.remove_household_member(uuid) to authenticated;

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
  my_role text;
begin
  select role into my_role from public.household_members where household_id = hh and user_id = uid;
  if my_role is null then
    raise exception 'You''re not in a household.' using errcode = 'P0001', hint = 'not_a_member';
  end if;
  if my_role = 'owner' then
    raise exception 'Owners can''t leave. Transfer ownership to another member first.' using errcode = 'P0001', hint = 'owner_must_transfer';
  end if;
  delete from public.household_members where household_id = hh and user_id = uid;
  perform public.fallback_active_household(uid, hh);
  perform public.refresh_household_diet(hh);
end;
$$;
revoke all on function public.leave_household() from public;
revoke all on function public.leave_household() from anon;
grant execute on function public.leave_household() to authenticated;

create or replace function public.transfer_household_ownership(new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hh uuid := public.current_household_id();
begin
  if hh is null or not public.is_household_owner(hh) then
    raise exception 'Only the household owner can do that.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.household_members where household_id = hh and user_id = new_owner and role = 'member') then
    raise exception 'Choose a current member.' using errcode = 'P0001', hint = 'not_a_member';
  end if;
  update public.household_members set role = 'owner' where household_id = hh and user_id = new_owner;
  update public.household_members set role = 'member' where household_id = hh and user_id = uid;
end;
$$;
revoke all on function public.transfer_household_ownership(uuid) from public;
revoke all on function public.transfer_household_ownership(uuid) from anon;
grant execute on function public.transfer_household_ownership(uuid) to authenticated;

-- People can change the name their household sees.
create or replace function public.set_display_name(new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(new_name, ''))) not between 1 and 40 then
    raise exception 'Use 1 to 40 characters.' using errcode = '22023';
  end if;
  update public.profiles set display_name = btrim(new_name) where id = (select auth.uid());
end;
$$;
revoke all on function public.set_display_name(text) from public;
revoke all on function public.set_display_name(text) from anon;
grant execute on function public.set_display_name(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Shared grocery list
-- -----------------------------------------------------------------------------
alter table public.grocery_lists
  alter column household_id set default public.current_household_id();

alter table public.grocery_list_items
  add column added_by uuid default auth.uid() references auth.users (id) on delete set null,
  add column checked_by uuid references auth.users (id) on delete set null,
  add column checked_at timestamptz,
  add column amount_text text check (char_length(amount_text) <= 60),
  add column note text check (char_length(note) <= 200),
  add column source text not null default 'manual' check (source in ('manual', 'plan')),
  add column item_key text check (char_length(item_key) <= 120),
  add column needed_for text[] not null default '{}';

-- Who added / checked an item comes from the session, never from the client.
create or replace function public.grocery_item_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce((select auth.uid()), new.added_by);
    if new.is_checked then
      new.checked_by := (select auth.uid());
      new.checked_at := now();
    else
      new.checked_by := null;
      new.checked_at := null;
    end if;
  elsif new.is_checked is distinct from old.is_checked then
    if new.is_checked then
      new.checked_by := (select auth.uid());
      new.checked_at := now();
    else
      new.checked_by := null;
      new.checked_at := null;
    end if;
  else
    new.added_by := old.added_by;
    new.checked_by := old.checked_by;
    new.checked_at := old.checked_at;
  end if;
  return new;
end;
$$;
create trigger grocery_list_items_attribution
  before insert or update on public.grocery_list_items
  for each row execute function public.grocery_item_attribution();

-- The household's open list, created on first use.
create or replace function public.current_grocery_list()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hh uuid := public.current_household_id();
  list_id uuid;
begin
  if hh is null then
    raise exception 'No household for the current user' using errcode = '42501';
  end if;
  select id into list_id from public.grocery_lists
    where household_id = hh and status in ('open', 'shopping')
    order by created_at desc limit 1;
  if list_id is null then
    list_id := gen_random_uuid();
    insert into public.grocery_lists (id, household_id, name) values (list_id, hh, 'Shopping list');
  end if;
  return list_id;
end;
$$;
revoke all on function public.current_grocery_list() from public;
revoke all on function public.current_grocery_list() from anon;
grant execute on function public.current_grocery_list() to authenticated;

-- Replace the meal-plan items on a list (manual and checked items stay).
create or replace function public.replace_plan_grocery_items(target_list uuid, items jsonb, plan uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then
    raise exception 'items must be an array of at most 200 items' using errcode = '22023';
  end if;
  -- RLS: only members of the list's household get past this.
  perform 1 from public.grocery_lists where id = target_list;
  if not found then
    raise exception 'List not found' using errcode = '42501';
  end if;
  update public.grocery_lists set meal_plan_id = coalesce(plan, meal_plan_id) where id = target_list;
  delete from public.grocery_list_items where grocery_list_id = target_list and source = 'plan' and not is_checked;
  insert into public.grocery_list_items (grocery_list_id, name, department, amount_text, note, source, item_key, needed_for, position,
    required_quantity, required_unit)
  select target_list,
    left(btrim(i ->> 'name'), 120),
    coalesce(i ->> 'department', 'other'),
    nullif(left(i ->> 'amount', 60), ''),
    nullif(left(i ->> 'note', 200), ''),
    'plan',
    left(i ->> 'key', 120),
    coalesce(array(select left(jsonb_array_elements_text(i -> 'neededFor'), 160)), '{}'),
    (ordinality - 1)::smallint,
    -- Structured amount for package math (store prices); null when the recipe gave none.
    case when jsonb_typeof(i -> 'quantity' -> 'value') = 'number' and (i -> 'quantity' ->> 'value')::numeric between 0.0001 and 100000
      then round((i -> 'quantity' ->> 'value')::numeric, 4) end,
    case when jsonb_typeof(i -> 'quantity' -> 'value') = 'number' then nullif(left(i -> 'quantity' ->> 'unit', 20), '') end
  from jsonb_array_elements(items) with ordinality as t(i, ordinality)
  where not exists (
    -- Already bought this week: don't add it again.
    select 1 from public.grocery_list_items x
    where x.grocery_list_id = target_list and x.source = 'plan' and x.is_checked and x.item_key = left(i ->> 'key', 120)
  );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
revoke all on function public.replace_plan_grocery_items(uuid, jsonb, uuid) from public;
revoke all on function public.replace_plan_grocery_items(uuid, jsonb, uuid) from anon;
grant execute on function public.replace_plan_grocery_items(uuid, jsonb, uuid) to authenticated;

-- Real-time sync (Supabase Realtime respects RLS: members only receive
-- changes for lists they can read). Skipped where the publication doesn't exist.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.grocery_list_items, public.grocery_lists;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Hardening: Supabase grants EXECUTE on new functions to `anon` by default,
-- and revoking from PUBLIC doesn't remove that. Every app function checks
-- for a signed-in user anyway; this makes signed-out calls fail up front.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.ai_requests_last_day(text),
  public.can_edit_recipe(uuid),
  public.can_read_recipe(uuid),
  public.current_household_id(),
  public.dismissed_recipe_ids(),
  public.get_onboarding_profile(),
  public.is_household_member(uuid),
  public.is_household_owner(uuid),
  public.pantry_remove_item(uuid, text),
  public.recipe_rating_summaries(uuid[]),
  public.recipe_rating_summary(uuid),
  public.reset_learned_preferences(),
  public.save_meal_plan(jsonb, boolean),
  public.search_ingredients(text, integer),
  public.set_skill_level(smallint)
from anon;
