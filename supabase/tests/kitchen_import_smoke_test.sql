-- Barcode / receipt import smoke test: barcodes are product codes only,
-- items keep where they came from, and receipt reading has its own AI limit.
-- Rolls back.
begin;
insert into auth.users (id, email) values ('c1000000-0000-0000-0000-0000000000a1', 'ana@example.com');
create temp table results (name text, ok boolean);
grant all on results to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-0000000000a1', true);
select public.save_onboarding_profile('{
  "household": {"country":"US","postalCode":"53132","adults":1,"children":0,"cookingFor":1,"dinnersPerWeek":3,"mealsIncluded":["dinner"],"servingsByMeal":{}},
  "budget": {"amountCents":6000,"period":"week","includes":["dinner"],"priority":"balanced"},
  "goals": {"ranked":["reduce_waste"]},
  "diet": {"allergies":[],"style":"omnivore","restrictions":[],"dislikes":[],"neverRecommend":[],"cuisines":[],"proteins":[],"nutrition":{"caloriesPerDay":null,"proteinGramsPerDay":null}},
  "skillLevel": 2, "equipment": ["stove"], "store": {"usualRetailer":null,"storeLocationId":null}
}'::jsonb) is not null;
insert into public.pantry_items (name, category, storage_location, source, barcode) values ('Spaghetti', 'pasta', 'pantry', 'barcode', '0036000291452');
insert into results select 'a scanned item keeps its barcode and source', (select source = 'barcode' and barcode = '0036000291452' from public.pantry_items where name = 'Spaghetti');
insert into public.pantry_items (name, category, storage_location, source, price_paid_cents, purchased_on) values ('Bananas', 'produce', 'counter', 'receipt', 136, '2026-11-01'), ('Whole milk', 'dairy', 'fridge', 'receipt', 389, '2026-11-01');
insert into results select 'receipt items keep their source and price', (select count(*) from public.pantry_items where source = 'receipt' and price_paid_cents is not null) = 2;
do $$ begin
  insert into public.pantry_items (name, category, storage_location, source, barcode) values ('Bad', 'other', 'pantry', 'barcode', '<script>');
  insert into results values ('only product codes are stored as barcodes', false);
exception when check_violation then insert into results values ('only product codes are stored as barcodes', true);
end $$;
insert into results select 'receipt reading has its own AI limit', public.reserve_ai_request('receipt_import', 1) is not null and public.reserve_ai_request('receipt_import', 1) is null
  and public.reserve_ai_request('shopping_advice', 1) is not null;
do $$ begin
  insert into public.ai_usage (feature, outcome) values ('receipt_import_typo', 'ok');
  insert into results values ('unknown AI features are still refused', false);
exception when check_violation then insert into results values ('unknown AI features are still refused', true);
end $$;
reset role;
select name, ok from results;
rollback;
