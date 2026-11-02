-- =============================================================================
-- Delete my account (App Store 5.1.1(v) / Google Play account deletion).
--
-- Review before applying. Adds one function and changes one foreign key.
--
--   * delete_my_account('DELETE') — permanently deletes the signed-in
--     person's account and everything that's only theirs: profile,
--     allergies and preferences, ratings, cooking history, notices, phone
--     push registrations, store sign-ins, AI usage rows, and so on (all
--     cascade from auth.users).
--
--     Shared households:
--       - Households where they're the only member are deleted with all
--         their data (kitchen, plans, lists, recipes).
--       - Households shared with others stay with the others. If they were
--         the owner, the longest-standing other member becomes the owner.
--         The household's combined allergies and diet are recalculated
--         without them.
--
--     Things they added to a shared household (grocery items, saved lists,
--     menus, recipes) stay for the others, with "added by" cleared.
--
--   * menus.created_by now clears instead of deleting the household's saved
--     menu when its creator deletes their account.
--
-- It can't be undone. The app asks the person to type DELETE first.
-- =============================================================================

alter table public.menus alter column created_by drop not null;
alter table public.menus drop constraint if exists menus_created_by_fkey;
alter table public.menus
  add constraint menus_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

create or replace function public.delete_my_account(confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  m record;
  heir uuid;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  if confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = 'check_violation';
  end if;

  for m in
    select hm.household_id, hm.role from public.household_members hm where hm.user_id = uid
  loop
    select hm.user_id into heir
    from public.household_members hm
    where hm.household_id = m.household_id and hm.user_id <> uid
    order by (hm.role = 'owner') desc, hm.created_at, hm.user_id
    limit 1;

    if heir is null then
      -- Only them: the household and everything in it go.
      delete from public.households where id = m.household_id;
    else
      if m.role = 'owner' and not exists (
        select 1 from public.household_members hm
        where hm.household_id = m.household_id and hm.user_id <> uid and hm.role = 'owner'
      ) then
        update public.household_members set role = 'owner' where household_id = m.household_id and user_id = heir;
      end if;
      update public.households set created_by = heir where id = m.household_id and created_by = uid;
      delete from public.household_members where household_id = m.household_id and user_id = uid;
      perform public.refresh_household_diet(m.household_id);
    end if;
  end loop;

  -- Households they created but had already left: hand the "created by" to the current owner.
  update public.households h
  set created_by = (
    select hm.user_id from public.household_members hm
    where hm.household_id = h.id
    order by (hm.role = 'owner') desc, hm.created_at, hm.user_id
    limit 1
  )
  where h.created_by = uid
    and exists (select 1 from public.household_members hm where hm.household_id = h.id);
  delete from public.households h where h.created_by = uid;

  -- Everything else that's only theirs cascades from here.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
