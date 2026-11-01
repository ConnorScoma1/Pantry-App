-- =============================================================================
-- Onboarding: save and load the questionnaire atomically.
-- The JSON shape matches OnboardingProfile in @kitchen-pantry/shared-types and
-- is validated with zod on the server BEFORE this is called; the CHECK
-- constraints and FK references here are the second line of defence.
-- SECURITY INVOKER: every write below is subject to RLS as the calling user.
-- =============================================================================

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
    -- Generate the id up front: INSERT ... RETURNING would be checked against
    -- the SELECT policy before the owner-membership trigger has run.
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

  -- Replace household allergy / diet / equipment selections.
  delete from public.household_allergies where household_id = hid;
  insert into public.household_allergies (household_id, allergen_code)
  select hid, a from jsonb_array_elements_text(d -> 'allergies') a;

  delete from public.dietary_restrictions where household_id = hid;
  insert into public.dietary_restrictions (household_id, kind, value)
  select hid, 'restriction', v from jsonb_array_elements_text(d -> 'restrictions') v
  union
  select hid, 'dislike', v from jsonb_array_elements_text(d -> 'dislikes') v
  union
  select hid, 'exclude', v from jsonb_array_elements_text(d -> 'neverRecommend') v
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

  return hid;
end;
$$;

revoke all on function public.save_onboarding_profile(jsonb) from public;
grant execute on function public.save_onboarding_profile(jsonb) to authenticated;

-- Returns the caller's profile in OnboardingProfile shape, or null.
create or replace function public.get_onboarding_profile()
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
                             from public.household_allergies a where a.household_id = h.id), '[]'::jsonb),
      'style', h.diet_style,
      'restrictions', coalesce((select jsonb_agg(r.value order by r.value)
                                from public.dietary_restrictions r
                                where r.household_id = h.id and r.kind = 'restriction'), '[]'::jsonb),
      'dislikes', coalesce((select jsonb_agg(r.value order by r.created_at, r.value)
                            from public.dietary_restrictions r
                            where r.household_id = h.id and r.kind = 'dislike'), '[]'::jsonb),
      'neverRecommend', coalesce((select jsonb_agg(r.value order by r.created_at, r.value)
                                  from public.dietary_restrictions r
                                  where r.household_id = h.id and r.kind = 'exclude'), '[]'::jsonb),
      'cuisines', to_jsonb(coalesce(up.preferred_cuisines, '{}')),
      'proteins', to_jsonb(coalesce(up.preferred_proteins, '{}')),
      'nutrition', jsonb_build_object(
        'caloriesPerDay', up.calories_per_day,
        'proteinGramsPerDay', up.protein_grams_per_day
      )
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
    and p.onboarding_completed_at is not null;
$$;

revoke all on function public.get_onboarding_profile() from public;
grant execute on function public.get_onboarding_profile() to authenticated;

-- Users may update just their skill level at any time.
create or replace function public.set_skill_level(level smallint)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.user_preferences set skill_level = level where user_id = (select auth.uid());
$$;
revoke all on function public.set_skill_level(smallint) from public;
grant execute on function public.set_skill_level(smallint) to authenticated;

-- "Reset my recommendations": clears learned signals, keeps stated preferences.
create or replace function public.reset_learned_preferences()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.user_preferences set learned_weights = '{}'::jsonb where user_id = (select auth.uid());
$$;
revoke all on function public.reset_learned_preferences() from public;
grant execute on function public.reset_learned_preferences() to authenticated;
