-- Recipe photos: only openly licensed or owned photos, always with credit.
-- The app shows "Similar dish" when a photo isn't of this exact recipe.

alter table public.recipes
  add column if not exists image_alt text,
  add column if not exists image_credit_url text,
  add column if not exists image_source_url text,
  add column if not exists image_license text,
  add column if not exists image_is_representative boolean;

alter table public.recipes
  add constraint recipes_image_license_check
    check (image_license is null or image_license in ('unsplash', 'pexels', 'cc0', 'cc-by', 'cc-by-sa', 'owned')),
  -- A photo needs https, a recorded licence and the page that states it; a third-party photo also needs a credit.
  add constraint recipes_image_provenance_check
    check (
      image_url is null
      or (
        image_url ~ '^https://(images\.unsplash\.com|images\.pexels\.com|upload\.wikimedia\.org)/'
        and image_license is not null
        and image_source_url is not null
        and (image_license = 'owned' or image_credit is not null)
      )
    );

comment on column public.recipes.image_is_representative is
  'True when the photo shows a similar dish rather than this exact recipe; the UI labels it "Similar dish".';
