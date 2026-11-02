-- =============================================================================
-- Sign in with Google, Apple or Facebook.
--
-- Review before applying. Changes one function; nothing is deleted.
--
--   * handle_new_user() — a new account's display name now comes from the
--     name the provider shares (Google/Facebook "full_name"/"name"; Apple
--     shares a name only the first time), falling back to the part of the
--     email before the @ as before. Apple's "Hide my email" addresses
--     (…@privaterelay.appleid.com) are never used as a name. Names are
--     trimmed to 80 characters.
--
-- The providers themselves are switched on in the Supabase dashboard
-- (Authentication → Sign In / Providers); see README "Sign-in and accounts".
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  from_provider text := nullif(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
  from_email text := case
    when coalesce(new.email, '') ilike '%@privaterelay.appleid.com' then null
    else nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  end;
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(from_provider, from_email), 80))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
