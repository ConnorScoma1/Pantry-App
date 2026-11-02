-- Social sign-in smoke test: new accounts get a sensible display name from
-- the provider, never an Apple private-relay address. Rolls back.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'ana.lopez@gmail.com', '{"full_name":"Ana López","avatar_url":"x"}'),
  ('a1000000-0000-0000-0000-000000000002', 'ben@example.com', '{"name":"  Ben  "}'),
  ('a1000000-0000-0000-0000-000000000003', 'x7k2pq@privaterelay.appleid.com', '{}'),
  ('a1000000-0000-0000-0000-000000000004', 'cy@example.com', null),
  ('a1000000-0000-0000-0000-000000000005', 'dee@example.com', jsonb_build_object('full_name', repeat('d', 200)));
select 'Google name used', display_name = 'Ana López' from public.profiles where id = 'a1000000-0000-0000-0000-000000000001';
select 'Facebook-style "name" used, trimmed', display_name = 'Ben' from public.profiles where id = 'a1000000-0000-0000-0000-000000000002';
select 'Apple relay address never becomes a name', display_name is null from public.profiles where id = 'a1000000-0000-0000-0000-000000000003';
select 'email sign-up falls back to the email name', display_name = 'cy' from public.profiles where id = 'a1000000-0000-0000-0000-000000000004';
select 'long names are cut to 80', char_length(display_name) = 80 from public.profiles where id = 'a1000000-0000-0000-0000-000000000005';
select 'preferences row created', count(*) = 5 from public.user_preferences where user_id::text like 'a1000000-%';
rollback;
