-- GENERATED FILE — do not edit by hand.
-- Source: packages/recipe-engine/src/catalog/test-kitchen.ts
-- Regenerate with: npm run seed --workspace=@kitchen-pantry/recipe-engine
-- Original Kitchen Pantry Test Kitchen recipes. No ratings are seeded.
-- Photos are credited, free-licence photos of similar dishes (see catalog/photos.ts).

-- Sheet-Pan Lemon Herb Chicken & Potatoes
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000001', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'sheet-pan-lemon-herb-chicken-potatoes', 'Sheet-Pan Lemon Herb Chicken & Potatoes', 'Crisp-skinned chicken thighs and golden potatoes roasted together on one pan, finished with bright lemon.', 'mediterranean', 1, 15, 40, 55, 4, array['oven']::text[], array['one-pan', 'weeknight']::text[], array['Dry the chicken skin well with paper towels — dry skin is crisp skin.', 'Leave space between pieces so they roast instead of steam.']::text[], 'https://images.unsplash.com/photo-1768238907887-023b7ac9f450', 'Roasted chicken with herbs and vegetables in a pan', 'Anto Meneghini', 'https://unsplash.com/@antomeneghini', 'https://unsplash.com/photos/roasted-chicken-with-herbs-and-vegetables-in-a-pan-mlQ2_HrjccU', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000001';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000001', 1, null, '2 lb bone-in, skin-on chicken thighs', 'bone-in, skin-on chicken thighs', 2, 'lb', null, false),
  ('7e570000-0000-4000-8000-000000000001', 2, null, '1½ lb baby potatoes, halved', 'baby potatoes', 1.5, 'lb', 'halved', false),
  ('7e570000-0000-4000-8000-000000000001', 3, null, '3 tbsp olive oil', 'olive oil', 3, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000001', 4, null, '4 cloves garlic, smashed', 'garlic', 4, 'clove', 'smashed', false),
  ('7e570000-0000-4000-8000-000000000001', 5, null, '1 tsp dried oregano', 'dried oregano', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000001', 6, null, '1½ tsp kosher salt', 'kosher salt', 1.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000001', 7, null, '½ tsp black pepper', 'black pepper', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000001', 8, null, '1 lemon', 'lemon', 1, null, null, false),
  ('7e570000-0000-4000-8000-000000000001', 9, null, '2 tbsp fresh parsley, chopped', 'fresh parsley', 2, 'tbsp', 'chopped', true);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000001';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000001', 1, null, 'Heat the oven to 425°F with a rack in the middle.', null, 218.3, null),
  ('7e570000-0000-4000-8000-000000000001', 2, null, 'Toss the potatoes and garlic on a sheet pan with half the olive oil and half the salt. Spread them out cut-side down.', null, null, null),
  ('7e570000-0000-4000-8000-000000000001', 3, null, 'Pat the chicken very dry. Rub with the remaining oil, salt, the pepper and oregano. Zest the lemon over the top. Nestle the thighs skin-side up among the potatoes.', null, null, null),
  ('7e570000-0000-4000-8000-000000000001', 4, null, 'Roast until the skin is deep golden and the thickest thigh reads 165°F, 35–40 minutes.', 2280, 218.3, 73.9),
  ('7e570000-0000-4000-8000-000000000001', 5, null, 'Squeeze the lemon over everything, rest 5 minutes, then scatter with parsley.', 300, null, null);

-- Black Bean & Cheddar Quesadillas
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000002', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'black-bean-cheddar-quesadillas', 'Black Bean & Cheddar Quesadillas', 'Melty, crisp quesadillas with cumin-spiced black beans and sweet corn — dinner in 20 minutes.', 'mexican', 1, 10, 10, 20, 2, array['stove']::text[], array['vegetarian', 'quick', 'kid-friendly']::text[], array['Medium heat is the secret: hot enough to crisp, gentle enough to melt the cheese through.']::text[], 'https://images.unsplash.com/photo-1673990349292-ed2dfa7988c9', 'A quesadilla cut in half on a plate', 'Benjamin Guardia', 'https://unsplash.com/@benjaminguardia', 'https://unsplash.com/photos/a-plate-topped-with-a-quesadilla-cut-in-half-_BW-YmENFcM', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000002';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000002', 1, null, '1 can black beans, 15 oz, drained and rinsed', 'black beans', 1, 'can', '15 oz, drained and rinsed', false),
  ('7e570000-0000-4000-8000-000000000002', 2, null, '1 tsp ground cumin', 'ground cumin', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000002', 3, null, '4 flour tortillas, 8-inch', 'flour tortillas', 4, null, '8-inch', false),
  ('7e570000-0000-4000-8000-000000000002', 4, null, '1½ cups shredded cheddar', 'shredded cheddar', 1.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000002', 5, null, '½ cup corn kernels, thawed if frozen', 'corn kernels', 0.5, 'cup', 'thawed if frozen', false),
  ('7e570000-0000-4000-8000-000000000002', 6, null, '1 tbsp vegetable oil', 'vegetable oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000002', 7, null, '½ cup salsa, for serving', 'salsa', 0.5, 'cup', 'for serving', true);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000002';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000002', 1, null, 'Mash half the beans with the cumin and a pinch of salt; stir in the whole beans.', null, null, null),
  ('7e570000-0000-4000-8000-000000000002', 2, null, 'Spread the beans over half of each tortilla, top with cheese and corn, and fold.', null, null, null),
  ('7e570000-0000-4000-8000-000000000002', 3, null, 'Brush a large skillet with oil and cook the quesadillas over medium heat until golden and the cheese has melted, about 3 minutes per side.', 360, null, null),
  ('7e570000-0000-4000-8000-000000000002', 4, null, 'Rest 1 minute, cut into wedges and serve with salsa.', 60, null, null);

-- Weeknight Vegetable Fried Rice
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000003', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'weeknight-vegetable-fried-rice', 'Weeknight Vegetable Fried Rice', 'A smart way to use leftover rice — fluffy egg, peas and carrots, and a glossy soy-sesame finish.', 'chinese', 1, 10, 12, 22, 3, array['stove']::text[], array['vegetarian', 'use-it-up', 'quick']::text[], array['Cold, day-old rice fries best. Use rice that was cooled and refrigerated promptly and eat it within 3–4 days of cooking.']::text[], 'https://images.unsplash.com/photo-1603133872878-684f208fb84b', 'Fried rice with peas and carrots on a white plate', 'Christopher Alvarenga', 'https://unsplash.com/@krizphoto', 'https://unsplash.com/photos/fried-rice-with-peas-and-carrots-rQX9eVpSFz8', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000003';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000003', 1, null, '3 cups cooked white rice, cold', 'cooked white rice', 3, 'cup', 'cold', false),
  ('7e570000-0000-4000-8000-000000000003', 2, null, '3 large eggs, beaten', 'large eggs', 3, null, 'beaten', false),
  ('7e570000-0000-4000-8000-000000000003', 3, null, '1½ cups frozen peas and carrots', 'frozen peas and carrots', 1.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000003', 4, null, '3 green onions, sliced', 'green onions', 3, null, 'sliced', false),
  ('7e570000-0000-4000-8000-000000000003', 5, null, '2 cloves garlic, minced', 'garlic', 2, 'clove', 'minced', false),
  ('7e570000-0000-4000-8000-000000000003', 6, null, '2 tbsp soy sauce', 'soy sauce', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000003', 7, null, '1 tsp sesame oil', 'sesame oil', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000003', 8, null, '2 tbsp vegetable oil', 'vegetable oil', 2, 'tbsp', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000003';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000003', 1, null, 'Heat 1 tbsp oil in a large skillet or wok over medium-high. Scramble the eggs until just set, then move them to a plate.', null, null, null),
  ('7e570000-0000-4000-8000-000000000003', 2, null, 'Add the remaining oil, then the garlic and white parts of the green onions; stir 30 seconds.', null, null, null),
  ('7e570000-0000-4000-8000-000000000003', 3, null, 'Add the peas and carrots and cook 2 minutes. Add the rice, breaking up clumps, and fry until hot and lightly toasted, 4–5 minutes.', 300, null, null),
  ('7e570000-0000-4000-8000-000000000003', 4, null, 'Stir in the soy sauce, sesame oil, eggs and green onion tops. Taste and serve.', null, null, null);

-- Honey Garlic Chicken with Broccoli
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000004', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'honey-garlic-chicken-broccoli', 'Honey Garlic Chicken with Broccoli', 'Juicy chicken thigh pieces in a sticky honey-garlic glaze with crisp-tender broccoli over rice.', 'chinese', 2, 15, 20, 35, 4, array['stove']::text[], array['weeknight', 'high-protein']::text[], array['Mix the sauce before you start cooking — it comes together fast at the end.']::text[], 'https://images.unsplash.com/photo-1633030175953-ac5a41b7353c', 'A plate of chicken and broccoli', 'IamCristian', 'https://unsplash.com/@iamcristian', 'https://unsplash.com/photos/a-plate-of-broccoli-and-chicken-on-a-table-yF2Gkkwd6Ak', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000004';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000004', 1, null, '1½ lb boneless chicken thighs, cut into 1-inch pieces', 'boneless chicken thighs', 1.5, 'lb', 'cut into 1-inch pieces', false),
  ('7e570000-0000-4000-8000-000000000004', 2, null, '1 lb broccoli florets', 'broccoli florets', 1, 'lb', null, false),
  ('7e570000-0000-4000-8000-000000000004', 3, null, '4 cloves garlic, minced', 'garlic', 4, 'clove', 'minced', false),
  ('7e570000-0000-4000-8000-000000000004', 4, null, '1 tbsp fresh ginger, grated', 'fresh ginger', 1, 'tbsp', 'grated', false),
  ('7e570000-0000-4000-8000-000000000004', 5, null, '3 tbsp honey', 'honey', 3, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000004', 6, null, '3 tbsp soy sauce', 'soy sauce', 3, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000004', 7, null, '1 tbsp rice vinegar', 'rice vinegar', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000004', 8, null, '2 tsp cornstarch', 'cornstarch', 2, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000004', 9, null, '2 tbsp vegetable oil', 'vegetable oil', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000004', 10, null, '4 cups cooked white rice, for serving', 'cooked white rice', 4, 'cup', 'for serving', false),
  ('7e570000-0000-4000-8000-000000000004', 11, null, '1 tsp sesame seeds', 'sesame seeds', 1, 'tsp', null, true);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000004';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000004', 1, null, 'Whisk the honey, soy sauce, vinegar, cornstarch and 3 tbsp water in a bowl.', null, null, null),
  ('7e570000-0000-4000-8000-000000000004', 2, null, 'Heat 1 tbsp oil in a large skillet over medium-high. Add the broccoli and 2 tbsp water, cover and steam-fry until bright green and crisp-tender, 3–4 minutes. Remove.', 240, null, null),
  ('7e570000-0000-4000-8000-000000000004', 3, null, 'Add the remaining oil and the chicken in one layer. Cook, turning once, until browned and 165°F inside, 7–9 minutes.', 480, null, 73.9),
  ('7e570000-0000-4000-8000-000000000004', 4, null, 'Add the garlic and ginger for 30 seconds, then the sauce. Simmer, stirring, until thick and glossy, about 1 minute.', 60, null, null),
  ('7e570000-0000-4000-8000-000000000004', 5, null, 'Toss the broccoli back in and serve over rice with sesame seeds.', null, null, null);

-- Smoky Turkey & Black Bean Chili
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000005', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'turkey-black-bean-chili', 'Smoky Turkey & Black Bean Chili', 'A hearty, freezer-friendly chili with smoked paprika and plenty of beans.', 'american', 2, 15, 45, 60, 6, array['stove']::text[], array['meal-prep', 'freezer-friendly', 'high-protein']::text[], array['Chili tastes even better the next day. Cool it quickly and refrigerate within 2 hours.']::text[], 'https://images.unsplash.com/photo-1790701909034-6c7b45c7b58a', 'A bowl of chili topped with cheese, sour cream and green onions', 'Chad Montano', 'https://unsplash.com/@briewilly', 'https://unsplash.com/photos/chili-bowl-with-cheese-and-cream-HNVi6m5KCr8', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000005';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000005', 1, null, '1¼ lb ground turkey', 'ground turkey', 1.25, 'lb', null, false),
  ('7e570000-0000-4000-8000-000000000005', 2, null, '1 yellow onion, diced', 'yellow onion', 1, null, 'diced', false),
  ('7e570000-0000-4000-8000-000000000005', 3, null, '1 bell pepper, diced', 'bell pepper', 1, null, 'diced', false),
  ('7e570000-0000-4000-8000-000000000005', 4, null, '3 cloves garlic, minced', 'garlic', 3, 'clove', 'minced', false),
  ('7e570000-0000-4000-8000-000000000005', 5, null, '2 tbsp chili powder', 'chili powder', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000005', 6, null, '1 tsp ground cumin', 'ground cumin', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000005', 7, null, '1 tsp smoked paprika', 'smoked paprika', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000005', 8, null, '1 can crushed tomatoes, 28 oz', 'crushed tomatoes', 1, 'can', '28 oz', false),
  ('7e570000-0000-4000-8000-000000000005', 9, null, '2 cans black beans, 15 oz each, drained', 'black beans', 2, 'can', '15 oz each, drained', false),
  ('7e570000-0000-4000-8000-000000000005', 10, null, '1 cup chicken broth', 'chicken broth', 1, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000005', 11, null, '1 tsp kosher salt', 'kosher salt', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000005', 12, null, '1 tbsp vegetable oil', 'vegetable oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000005', 13, null, '½ cup sour cream, for serving', 'sour cream', 0.5, 'cup', 'for serving', true);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000005';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000005', 1, null, 'Heat the oil in a large pot over medium-high. Brown the turkey, breaking it up, until no pink remains and it reaches 165°F, 6–8 minutes.', 420, null, 73.9),
  ('7e570000-0000-4000-8000-000000000005', 2, null, 'Add the onion and pepper and cook until soft, 5 minutes. Stir in the garlic and spices for 1 minute.', 360, null, null),
  ('7e570000-0000-4000-8000-000000000005', 3, null, 'Add the tomatoes, beans, broth and salt. Bring to a simmer, then cook gently, partly covered, for 30 minutes, stirring now and then.', 1800, null, null),
  ('7e570000-0000-4000-8000-000000000005', 4, null, 'Taste for salt and spice. Serve with sour cream.', null, null, null);

-- Roasted Salmon with Lemon-Dill Yogurt
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000006', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'salmon-lemon-dill-yogurt-green-beans', 'Roasted Salmon with Lemon-Dill Yogurt', 'Tender roasted salmon and green beans with a cool, garlicky dill yogurt sauce.', 'mediterranean', 2, 10, 15, 25, 4, array['oven']::text[], array['high-protein', 'quick', 'healthy']::text[], '{}'::text[], 'https://images.unsplash.com/photo-1748712831461-9fbf45338e13', 'Salmon fillet with green vegetables and sauce', 'Ксения Лунарис', 'https://unsplash.com/@kseniavisuals', 'https://unsplash.com/photos/grilled-salmon-with-asparagus-and-sauce-C9XlhByIf70', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000006';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000006', 1, 'Salmon & beans', '4 salmon fillets, about 6 oz each', 'salmon fillets', 4, null, 'about 6 oz each', false),
  ('7e570000-0000-4000-8000-000000000006', 2, 'Salmon & beans', '1 lb green beans, trimmed', 'green beans', 1, 'lb', 'trimmed', false),
  ('7e570000-0000-4000-8000-000000000006', 3, 'Salmon & beans', '2 tbsp olive oil', 'olive oil', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000006', 4, 'Salmon & beans', '1 tsp kosher salt', 'kosher salt', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000006', 5, 'Salmon & beans', '½ tsp black pepper', 'black pepper', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000006', 6, 'Salmon & beans', '1 lemon, half sliced, half juiced', 'lemon', 1, null, 'half sliced, half juiced', false),
  ('7e570000-0000-4000-8000-000000000006', 7, 'Dill yogurt', '¾ cup plain Greek yogurt', 'plain Greek yogurt', 0.75, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000006', 8, 'Dill yogurt', '2 tbsp fresh dill, chopped', 'fresh dill', 2, 'tbsp', 'chopped', false),
  ('7e570000-0000-4000-8000-000000000006', 9, 'Dill yogurt', '1 clove garlic, finely grated', 'garlic', 1, 'clove', 'finely grated', false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000006';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000006', 1, null, 'Heat the oven to 425°F.', null, 218.3, null),
  ('7e570000-0000-4000-8000-000000000006', 2, null, 'Toss the green beans with half the oil and salt on a sheet pan. Push to the sides; place the salmon in the middle, brush with the remaining oil and season. Top with lemon slices.', null, null, null),
  ('7e570000-0000-4000-8000-000000000006', 3, null, 'Roast until the salmon flakes easily and reads 145°F in the thickest part, 12–15 minutes.', 780, 218.3, 62.8),
  ('7e570000-0000-4000-8000-000000000006', 4, null, 'Meanwhile, stir the yogurt, dill, garlic, lemon juice and a pinch of salt. Serve with the salmon.', null, null, null);

-- Creamy Tomato & Spinach Penne
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000007', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'creamy-tomato-spinach-penne', 'Creamy Tomato & Spinach Penne', 'A silky tomato-cream sauce with garlic, wilted spinach and Parmesan — on the table in 30 minutes.', 'italian', 2, 10, 20, 30, 4, array['stove']::text[], array['vegetarian', 'weeknight', 'use-it-up']::text[], array['Save a mug of pasta water before draining — a splash makes the sauce cling.']::text[], 'https://images.unsplash.com/photo-1777333033368-6bbb5d022a08', 'Penne in a creamy tomato sauce', 'Brelyn Bashrum', 'https://unsplash.com/@brelynkk', 'https://unsplash.com/photos/penne-pasta-with-creamy-tomato-sauce-on-a-white-plate-nfZlM7xe1k4', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000007';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000007', 1, null, '12 oz penne', 'penne', 12, 'oz', null, false),
  ('7e570000-0000-4000-8000-000000000007', 2, null, '2 tbsp olive oil', 'olive oil', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000007', 3, null, '3 cloves garlic, thinly sliced', 'garlic', 3, 'clove', 'thinly sliced', false),
  ('7e570000-0000-4000-8000-000000000007', 4, null, '1 can diced tomatoes, 14.5 oz', 'diced tomatoes', 1, 'can', '14.5 oz', false),
  ('7e570000-0000-4000-8000-000000000007', 5, null, '½ cup heavy cream', 'heavy cream', 0.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000007', 6, null, '4 cups baby spinach', 'baby spinach', 4, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000007', 7, null, '½ cup grated Parmesan', 'grated Parmesan', 0.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000007', 8, null, '½ tsp red pepper flakes', 'red pepper flakes', 0.5, 'tsp', null, true),
  ('7e570000-0000-4000-8000-000000000007', 9, null, '1 tsp kosher salt', 'kosher salt', 1, 'tsp', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000007';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000007', 1, null, 'Cook the penne in well-salted boiling water until al dente. Reserve 1 cup pasta water, then drain.', 660, null, null),
  ('7e570000-0000-4000-8000-000000000007', 2, null, 'Meanwhile, warm the oil and garlic in a large skillet over medium until fragrant, about 1 minute. Add the tomatoes and pepper flakes and simmer 8 minutes.', 480, null, null),
  ('7e570000-0000-4000-8000-000000000007', 3, null, 'Stir in the cream and simmer 2 minutes. Add the spinach and let it wilt.', 120, null, null),
  ('7e570000-0000-4000-8000-000000000007', 4, null, 'Toss in the pasta, Parmesan and a splash of pasta water until glossy. Season to taste.', null, null, null);

-- Crispy Chickpea Tacos with Lime Slaw
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000008', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'air-fryer-crispy-chickpea-tacos', 'Crispy Chickpea Tacos with Lime Slaw', 'Smoky air-fried chickpeas, crunchy cabbage slaw and creamy avocado in warm corn tortillas.', 'mexican', 2, 15, 15, 30, 4, array['air_fryer']::text[], array['vegan', 'budget']::text[], array['No air fryer? Roast the chickpeas at 425°F for 20–25 minutes, shaking the pan halfway.']::text[], 'https://images.unsplash.com/photo-1578880711837-b028df1bcd06', 'Tacos on a wooden board', 'Jakob Owens', 'https://unsplash.com/@jakobowens1', 'https://unsplash.com/photos/a-couple-of-tacos-sitting-on-top-of-a-wooden-cutting-board-vw7cL9CyvlE', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000008';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000008', 1, null, '2 cans chickpeas, 15 oz each, drained and patted very dry', 'chickpeas', 2, 'can', '15 oz each, drained and patted very dry', false),
  ('7e570000-0000-4000-8000-000000000008', 2, null, '1 tbsp olive oil', 'olive oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000008', 3, null, '2 tsp chili powder', 'chili powder', 2, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000008', 4, null, '1 tsp ground cumin', 'ground cumin', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000008', 5, null, '½ tsp garlic powder', 'garlic powder', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000008', 6, null, '½ tsp kosher salt', 'kosher salt', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000008', 7, null, '8 small corn tortillas', 'small corn tortillas', 8, null, null, false),
  ('7e570000-0000-4000-8000-000000000008', 8, null, '2 cups shredded red cabbage', 'shredded red cabbage', 2, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000008', 9, null, '1 lime', 'lime', 1, null, null, false),
  ('7e570000-0000-4000-8000-000000000008', 10, null, '1 avocado, sliced', 'avocado', 1, null, 'sliced', false),
  ('7e570000-0000-4000-8000-000000000008', 11, null, '¼ cup fresh cilantro', 'fresh cilantro', 0.25, 'cup', null, true);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000008';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000008', 1, null, 'Toss the chickpeas with the oil, spices and salt.', null, null, null),
  ('7e570000-0000-4000-8000-000000000008', 2, null, 'Air-fry at 400°F until crisp, 12–15 minutes, shaking the basket halfway.', 780, 204.4, null),
  ('7e570000-0000-4000-8000-000000000008', 3, null, 'Toss the cabbage with the juice of half the lime and a pinch of salt.', null, null, null),
  ('7e570000-0000-4000-8000-000000000008', 4, null, 'Warm the tortillas in a dry skillet. Fill with chickpeas, slaw, avocado and cilantro; serve with lime wedges.', null, null, null);

-- Red Wine Braised Short Ribs
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000009', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'red-wine-braised-short-ribs', 'Red Wine Braised Short Ribs', 'Deeply browned short ribs braised low and slow until spoon-tender in a glossy red wine sauce.', 'french', 3, 30, 180, 210, 4, array['stove', 'oven', 'dutch_oven']::text[], array['weekend', 'make-ahead']::text[], array['Salt the ribs up to a day ahead (uncovered in the fridge) for deeper seasoning.', 'Braise a day early and chill: the fat sets on top and lifts right off.']::text[], 'https://images.unsplash.com/photo-1747972312968-daeb233e6bcb', 'A braised short rib on a plate', 'hongzhou qian', 'https://unsplash.com/@shyuncle', 'https://unsplash.com/photos/braised-short-rib-garnished-with-microgreens-on-a-plate-hzxOdom4InE', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000009';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000009', 1, null, '4 lb bone-in beef short ribs', 'bone-in beef short ribs', 4, 'lb', null, false),
  ('7e570000-0000-4000-8000-000000000009', 2, null, '2 tsp kosher salt', 'kosher salt', 2, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000009', 3, null, '1 tsp black pepper', 'black pepper', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000009', 4, null, '2 tbsp vegetable oil', 'vegetable oil', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000009', 5, null, '1 yellow onion, chopped', 'yellow onion', 1, null, 'chopped', false),
  ('7e570000-0000-4000-8000-000000000009', 6, null, '2 carrots, chopped', 'carrots', 2, null, 'chopped', false),
  ('7e570000-0000-4000-8000-000000000009', 7, null, '2 celery ribs, chopped', 'celery ribs', 2, null, 'chopped', false),
  ('7e570000-0000-4000-8000-000000000009', 8, null, '4 cloves garlic, smashed', 'garlic', 4, 'clove', 'smashed', false),
  ('7e570000-0000-4000-8000-000000000009', 9, null, '2 tbsp tomato paste', 'tomato paste', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000009', 10, null, '2 cups dry red wine', 'dry red wine', 2, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000009', 11, null, '2 cups beef broth', 'beef broth', 2, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000009', 12, null, '3 sprigs fresh thyme', 'fresh thyme', 3, 'sprig', null, false),
  ('7e570000-0000-4000-8000-000000000009', 13, null, '2 bay leaves', 'bay leaves', 2, null, null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000009';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000009', 1, null, 'Heat the oven to 325°F. Season the ribs all over with salt and pepper.', null, 162.8, null),
  ('7e570000-0000-4000-8000-000000000009', 2, null, 'Heat the oil in a Dutch oven over medium-high. Sear the ribs in batches until deeply browned on all sides, 10–12 minutes per batch. Set aside and pour off all but 2 tbsp fat.', 1320, null, null),
  ('7e570000-0000-4000-8000-000000000009', 3, null, 'Cook the onion, carrots and celery until softened and browned at the edges, 8 minutes. Add the garlic and tomato paste and stir until the paste darkens, 2 minutes.', 600, null, null),
  ('7e570000-0000-4000-8000-000000000009', 4, null, 'Add the wine, scraping up the browned bits, and boil until reduced by half, about 8 minutes.', 480, null, null),
  ('7e570000-0000-4000-8000-000000000009', 5, null, 'Add the broth, thyme and bay leaves; return the ribs bone-side up. Cover and braise until a fork slides in with no resistance, 2½–3 hours.', 9900, 162.8, 62.8),
  ('7e570000-0000-4000-8000-000000000009', 6, null, 'Lift out the ribs. Skim the fat, strain the liquid and boil until it coats a spoon. Season and spoon over the ribs.', null, null, null);

-- Peanut Noodles with Chicken & Crunchy Vegetables
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000010', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'peanut-noodles-chicken-crunchy-vegetables', 'Peanut Noodles with Chicken & Crunchy Vegetables', 'Slurpable noodles in a tangy peanut sauce with seared chicken, cucumber, carrot and lime.', 'thai', 2, 20, 15, 35, 4, array['stove']::text[], array['high-protein', 'make-ahead']::text[], '{}'::text[], 'https://images.unsplash.com/photo-1781332152753-1199601d73d2', 'Chicken noodles with cucumber and carrot', 'Zayed Ahmed Zadu', 'https://unsplash.com/@zayed_ahmed_zadu', 'https://unsplash.com/photos/delicious-chicken-noodles-garnished-with-cucumber-and-carrots-p-uqtfkS0BI', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000010';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000010', 1, 'Noodles', '8 oz rice noodles', 'rice noodles', 8, 'oz', null, false),
  ('7e570000-0000-4000-8000-000000000010', 2, 'Noodles', '1 lb boneless chicken breast, thinly sliced', 'boneless chicken breast', 1, 'lb', 'thinly sliced', false),
  ('7e570000-0000-4000-8000-000000000010', 3, 'Noodles', '1 tbsp vegetable oil', 'vegetable oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000010', 4, 'Noodles', '1 red bell pepper, thinly sliced', 'red bell pepper', 1, null, 'thinly sliced', false),
  ('7e570000-0000-4000-8000-000000000010', 5, 'Noodles', '1 cup shredded carrots', 'shredded carrots', 1, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000010', 6, 'Noodles', '1 cucumber, cut into matchsticks', 'cucumber', 1, null, 'cut into matchsticks', false),
  ('7e570000-0000-4000-8000-000000000010', 7, 'Noodles', '2 green onions, sliced', 'green onions', 2, null, 'sliced', false),
  ('7e570000-0000-4000-8000-000000000010', 8, 'Noodles', '¼ cup roasted peanuts, chopped', 'roasted peanuts', 0.25, 'cup', 'chopped', false),
  ('7e570000-0000-4000-8000-000000000010', 9, 'Noodles', '1 lime, cut into wedges', 'lime', 1, null, 'cut into wedges', false),
  ('7e570000-0000-4000-8000-000000000010', 10, 'Peanut sauce', '⅓ cup creamy peanut butter', 'creamy peanut butter', 0.33, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000010', 11, 'Peanut sauce', '3 tbsp soy sauce', 'soy sauce', 3, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000010', 12, 'Peanut sauce', '2 tbsp rice vinegar', 'rice vinegar', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000010', 13, 'Peanut sauce', '1 tbsp honey', 'honey', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000010', 14, 'Peanut sauce', '1 clove garlic, grated', 'garlic', 1, 'clove', 'grated', false),
  ('7e570000-0000-4000-8000-000000000010', 15, 'Peanut sauce', '1 tbsp sriracha', 'sriracha', 1, 'tbsp', null, true),
  ('7e570000-0000-4000-8000-000000000010', 16, 'Peanut sauce', '4 tbsp hot water', 'hot water', 4, 'tbsp', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000010';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000010', 1, null, 'Whisk the sauce ingredients until smooth, adding hot water until it pours like heavy cream.', null, null, null),
  ('7e570000-0000-4000-8000-000000000010', 2, null, 'Cook the noodles according to the package; rinse under cold water and drain well.', null, null, null),
  ('7e570000-0000-4000-8000-000000000010', 3, null, 'Heat the oil in a skillet over medium-high. Sear the chicken in one layer until golden and 165°F, 5–6 minutes.', 360, null, 73.9),
  ('7e570000-0000-4000-8000-000000000010', 4, null, 'Toss the noodles with most of the sauce, the vegetables and chicken. Top with peanuts and the rest of the sauce; serve with lime.', null, null, null);

-- Yogurt-Spiced Roast Chicken with Cardamom Rice
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000011', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'yogurt-spiced-chicken-cardamom-rice', 'Yogurt-Spiced Roast Chicken with Cardamom Rice', 'Warmly spiced, yogurt-marinated chicken roasted until charred at the edges, with a fragrant buttery pilaf.', 'indian', 3, 25, 35, 60, 4, array['stove', 'oven']::text[], array['make-ahead', 'high-protein']::text[], array['Marinate at least 1 hour and up to 12, always in the fridge.', 'Resting the rice off the heat, lid on, is what makes every grain separate.']::text[], 'https://images.unsplash.com/photo-1708184528306-f75a0a5118ee', 'Spiced chicken and rice with sauces', 'Md Shohan Ridoy', 'https://unsplash.com/@cherrylake', 'https://unsplash.com/photos/a-plate-of-chicken-and-rice-with-sauces-LPYP9_8dscU', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000011';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000011', 1, 'Chicken', '2 lb boneless chicken thighs', 'boneless chicken thighs', 2, 'lb', null, false),
  ('7e570000-0000-4000-8000-000000000011', 2, 'Chicken', '1 cup plain whole-milk yogurt', 'plain whole-milk yogurt', 1, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000011', 3, 'Chicken', '1 tbsp lemon juice', 'lemon juice', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 4, 'Chicken', '2 tsp garam masala', 'garam masala', 2, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 5, 'Chicken', '1 tsp ground cumin', 'ground cumin', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 6, 'Chicken', '1 tsp paprika', 'paprika', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 7, 'Chicken', '½ tsp ground turmeric', 'ground turmeric', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 8, 'Chicken', '3 cloves garlic, grated', 'garlic', 3, 'clove', 'grated', false),
  ('7e570000-0000-4000-8000-000000000011', 9, 'Chicken', '1 tbsp fresh ginger, grated', 'fresh ginger', 1, 'tbsp', 'grated', false),
  ('7e570000-0000-4000-8000-000000000011', 10, 'Chicken', '1½ tsp kosher salt', 'kosher salt', 1.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 11, 'Cardamom rice', '1½ cups basmati rice, rinsed until the water runs clear', 'basmati rice', 1.5, 'cup', 'rinsed until the water runs clear', false),
  ('7e570000-0000-4000-8000-000000000011', 12, 'Cardamom rice', '2 tbsp butter', 'butter', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 13, 'Cardamom rice', '½ yellow onion, finely diced', 'yellow onion', 0.5, null, 'finely diced', false),
  ('7e570000-0000-4000-8000-000000000011', 14, 'Cardamom rice', '4 green cardamom pods, lightly crushed', 'green cardamom pods', 4, null, 'lightly crushed', false),
  ('7e570000-0000-4000-8000-000000000011', 15, 'Cardamom rice', '1 cinnamon stick', 'cinnamon stick', 1, null, null, false),
  ('7e570000-0000-4000-8000-000000000011', 16, 'Cardamom rice', '2¼ cups water', 'water', 2.25, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000011', 17, 'Cardamom rice', '¾ tsp kosher salt', 'kosher salt', 0.75, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000011', 18, 'To serve', '¼ cup fresh cilantro, chopped', 'fresh cilantro', 0.25, 'cup', 'chopped', true),
  ('7e570000-0000-4000-8000-000000000011', 19, 'To serve', '1 lemon, cut into wedges', 'lemon', 1, null, 'cut into wedges', false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000011';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000011', 1, 'Chicken', 'Stir everything except the chicken into a marinade, then coat the chicken. Cover and refrigerate 1–12 hours.', 3600, null, null),
  ('7e570000-0000-4000-8000-000000000011', 2, 'Chicken', 'Heat the oven to 450°F. Arrange the chicken on a rack set over a foil-lined sheet pan, shaking off excess marinade.', null, 232.2, null),
  ('7e570000-0000-4000-8000-000000000011', 3, 'Chicken', 'Roast until 165°F inside, 18–22 minutes, then broil 2–3 minutes for charred edges.', 1320, 232.2, 73.9),
  ('7e570000-0000-4000-8000-000000000011', 4, 'Cardamom rice', 'Melt the butter in a saucepan over medium. Cook the onion until soft, 4 minutes; add the cardamom and cinnamon for 30 seconds.', 240, null, null),
  ('7e570000-0000-4000-8000-000000000011', 5, 'Cardamom rice', 'Add the rice and stir 2 minutes to toast. Add the water and salt, bring to a boil, then cover and cook on the lowest heat for 15 minutes.', 900, null, null),
  ('7e570000-0000-4000-8000-000000000011', 6, 'Cardamom rice', 'Turn off the heat and rest, covered, 10 minutes. Fluff with a fork and remove the whole spices.', 600, null, null),
  ('7e570000-0000-4000-8000-000000000011', 7, 'To serve', 'Serve the chicken over the rice with cilantro and lemon wedges.', null, null, null);

-- Golden Mushroom & Thyme Risotto
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000012', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'mushroom-thyme-risotto', 'Golden Mushroom & Thyme Risotto', 'Hard-seared mushrooms folded into a creamy, loose risotto finished with butter and Parmesan.', 'italian', 3, 15, 35, 50, 4, array['stove']::text[], array['vegetarian']::text[], array['Sear the mushrooms in batches without stirring too soon — crowding makes them steam.', 'Finished risotto should flow slowly when you tilt the plate.']::text[], 'https://images.unsplash.com/photo-1572424075298-e17403e6f3bf', 'Mushroom risotto topped with parsley and parmesan', 'khloe arledge', 'https://unsplash.com/@khloephoto', 'https://unsplash.com/photos/mushroom-risotto-dinner-with-parmesan-gg_PV3EvCaM', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000012';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000012', 1, null, '6 cups vegetable broth, kept at a bare simmer', 'vegetable broth', 6, 'cup', 'kept at a bare simmer', false),
  ('7e570000-0000-4000-8000-000000000012', 2, null, '1 lb cremini mushrooms, sliced', 'cremini mushrooms', 1, 'lb', 'sliced', false),
  ('7e570000-0000-4000-8000-000000000012', 3, null, '2 tbsp olive oil', 'olive oil', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000012', 4, null, '3 tbsp butter, divided', 'butter', 3, 'tbsp', 'divided', false),
  ('7e570000-0000-4000-8000-000000000012', 5, null, '1 shallot, finely diced', 'shallot', 1, null, 'finely diced', false),
  ('7e570000-0000-4000-8000-000000000012', 6, null, '2 cloves garlic, minced', 'garlic', 2, 'clove', 'minced', false),
  ('7e570000-0000-4000-8000-000000000012', 7, null, '1½ cups arborio rice', 'arborio rice', 1.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000012', 8, null, '½ cup dry white wine', 'dry white wine', 0.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000012', 9, null, '2 tsp fresh thyme leaves', 'fresh thyme leaves', 2, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000012', 10, null, '¾ cup grated Parmesan', 'grated Parmesan', 0.75, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000012', 11, null, '1 tsp kosher salt', 'kosher salt', 1, 'tsp', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000012';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000012', 1, null, 'Heat the oil in a wide pan over high. Sear the mushrooms in two batches until deeply browned, 5–6 minutes each. Season and set aside.', 720, null, null),
  ('7e570000-0000-4000-8000-000000000012', 2, null, 'Lower to medium. Melt 1 tbsp butter and cook the shallot until translucent, 3 minutes; add the garlic for 30 seconds.', 180, null, null),
  ('7e570000-0000-4000-8000-000000000012', 3, null, 'Add the rice and stir until the edges turn translucent, 2 minutes. Add the wine and stir until absorbed.', 120, null, null),
  ('7e570000-0000-4000-8000-000000000012', 4, null, 'Add hot broth a ladle at a time, stirring often and waiting until each addition is nearly absorbed, until the rice is creamy and just tender, 18–20 minutes.', 1140, null, null),
  ('7e570000-0000-4000-8000-000000000012', 5, null, 'Off the heat, beat in the remaining butter, Parmesan and thyme. Fold in the mushrooms, add a splash of broth to loosen, and rest 1 minute.', 60, null, null);

-- Pan-Roasted Chicken Supreme, Pommes Purée, Glazed Carrots & Tarragon Jus
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000013', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'chicken-supreme-pommes-puree-tarragon-jus', 'Pan-Roasted Chicken Supreme, Pommes Purée, Glazed Carrots & Tarragon Jus', 'A restaurant-style composed plate: crisp-skinned chicken, silky buttered potato purée, glossy carrots and a bright tarragon pan jus.', 'french', 4, 45, 60, 105, 2, array['stove', 'oven']::text[], array['date-night', 'composed-plate']::text[], array['Service timeline: start the potatoes first, carrots 25 minutes before plating, chicken 25 minutes before, jus while the chicken rests.', 'Salt the chicken 1 hour ahead (or overnight, uncovered in the fridge) for crisper skin.', 'Spoon the jus around the chicken, not over the skin, so it stays crisp.', 'Warm the plates in a low oven before plating.']::text[], 'https://images.unsplash.com/photo-1788462612914-44793f2980f2', 'Chicken breast with sauce, mashed potatoes and vegetables', 'gabbiistudios', 'https://unsplash.com/@gabrielonodegba', 'https://unsplash.com/photos/chicken-dinner-with-mushroom-sauce-UdO-JP67I-4', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000013';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000013', 1, 'Chicken', '2 chicken supremes, skin-on breasts with wing bone', 'chicken supremes', 2, null, 'skin-on breasts with wing bone', false),
  ('7e570000-0000-4000-8000-000000000013', 2, 'Chicken', '1 tsp kosher salt', 'kosher salt', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 3, 'Chicken', '1 tbsp vegetable oil', 'vegetable oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 4, 'Chicken', '2 tbsp butter', 'butter', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 5, 'Chicken', '2 sprigs fresh thyme', 'fresh thyme', 2, 'sprig', null, false),
  ('7e570000-0000-4000-8000-000000000013', 6, 'Chicken', '1 clove garlic, crushed', 'garlic', 1, 'clove', 'crushed', false),
  ('7e570000-0000-4000-8000-000000000013', 7, 'Pommes purée', '1 lb Yukon Gold potatoes, whole, unpeeled', 'Yukon Gold potatoes', 1, 'lb', 'whole, unpeeled', false),
  ('7e570000-0000-4000-8000-000000000013', 8, 'Pommes purée', '6 tbsp cold butter, cubed', 'cold butter', 6, 'tbsp', 'cubed', false),
  ('7e570000-0000-4000-8000-000000000013', 9, 'Pommes purée', '⅓ cup whole milk, warm', 'whole milk', 0.33, 'cup', 'warm', false),
  ('7e570000-0000-4000-8000-000000000013', 10, 'Pommes purée', '½ tsp kosher salt', 'kosher salt', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 11, 'Glazed carrots', '8 small carrots, peeled, tops trimmed', 'small carrots', 8, null, 'peeled, tops trimmed', false),
  ('7e570000-0000-4000-8000-000000000013', 12, 'Glazed carrots', '1 tbsp butter', 'butter', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 13, 'Glazed carrots', '1 tsp granulated sugar', 'granulated sugar', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 14, 'Glazed carrots', '½ cup water', 'water', 0.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000013', 15, 'Tarragon jus', '1 shallot, minced', 'shallot', 1, null, 'minced', false),
  ('7e570000-0000-4000-8000-000000000013', 16, 'Tarragon jus', '¼ cup dry white wine', 'dry white wine', 0.25, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000013', 17, 'Tarragon jus', '1 cup chicken stock', 'chicken stock', 1, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000013', 18, 'Tarragon jus', '1 tbsp cold butter', 'cold butter', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000013', 19, 'Tarragon jus', '1 tbsp fresh tarragon, chopped', 'fresh tarragon', 1, 'tbsp', 'chopped', false),
  ('7e570000-0000-4000-8000-000000000013', 20, 'Tarragon jus', '1 tsp lemon juice', 'lemon juice', 1, 'tsp', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000013';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000013', 1, 'Mise en place', 'Read the whole recipe and set out every component. Heat the oven to 375°F.', null, 190.6, null),
  ('7e570000-0000-4000-8000-000000000013', 2, 'Pommes purée', 'Cover the potatoes with cold salted water, bring to a simmer and cook until a knife slides through, 25–30 minutes.', 1680, null, null),
  ('7e570000-0000-4000-8000-000000000013', 3, 'Pommes purée', 'Peel while hot (use a towel), then pass through a ricer or fine sieve back into the warm pot.', null, null, null),
  ('7e570000-0000-4000-8000-000000000013', 4, 'Pommes purée', 'Over low heat, beat in the cold butter a few cubes at a time, then the warm milk, until silky. Season, cover and hold warm.', null, null, null),
  ('7e570000-0000-4000-8000-000000000013', 5, 'Glazed carrots', 'Put the carrots, butter, sugar, water and a pinch of salt in a small pan. Cover with a circle of parchment and simmer until tender and the liquid has reduced to a glaze, 10–12 minutes. Roll to coat.', 660, null, null),
  ('7e570000-0000-4000-8000-000000000013', 6, 'Chicken', 'Pat the chicken very dry and season. Heat the oil in an oven-safe skillet over medium; lay the chicken skin-side down and cook without moving until deep golden, 6–7 minutes.', 420, null, null),
  ('7e570000-0000-4000-8000-000000000013', 7, 'Chicken', 'Flip and transfer to the oven until the thickest part reads 165°F, 12–18 minutes.', 900, 190.6, 73.9),
  ('7e570000-0000-4000-8000-000000000013', 8, 'Chicken', 'Back on the stove, add the butter, thyme and garlic and baste the chicken with the foaming butter for 1 minute. Rest on a rack, skin up, 5 minutes.', 360, null, null),
  ('7e570000-0000-4000-8000-000000000013', 9, 'Tarragon jus', 'Pour off all but 1 tsp fat from the chicken pan. Over medium, cook the shallot 1 minute; add the wine and reduce until almost dry.', 180, null, null),
  ('7e570000-0000-4000-8000-000000000013', 10, 'Tarragon jus', 'Add the stock and reduce by half, until it lightly coats a spoon, 5–6 minutes.', 360, null, null),
  ('7e570000-0000-4000-8000-000000000013', 11, 'Tarragon jus', 'Off the heat, swirl in the cold butter, tarragon and lemon juice. Season and strain if you like.', null, null, null),
  ('7e570000-0000-4000-8000-000000000013', 12, 'Plating', 'Spoon a swoosh of purée onto warm plates. Set the chicken beside it, add the carrots, and spoon the jus around — not over the skin.', null, null, null);

-- Seared Scallops, Beurre Blanc, Pea Purée & Crispy Shallots
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000014', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'seared-scallops-beurre-blanc-pea-puree', 'Seared Scallops, Beurre Blanc, Pea Purée & Crispy Shallots', 'Deeply caramelised scallops on vivid pea purée with a classic beurre blanc and crisp shallot rings — a chef''s-table plate.', 'french', 5, 40, 30, 70, 2, array['stove', 'blender']::text[], array['date-night', 'composed-plate', 'technique']::text[], array['Buy dry-packed scallops; wet-packed ones release water and won''t brown.', 'Beurre blanc is an emulsion: keep it warm, never hot. Above roughly 135°F it can break.', 'If the beurre blanc breaks, whisk a spoonful of cream in a clean pan and slowly whisk the broken sauce into it.', 'USDA guidance for scallops is 145°F, or until the flesh is opaque and firm.']::text[], 'https://images.unsplash.com/photo-1732321501974-1ec272b68ecf', 'Seared scallops in sauce', 'Meg von Haartman', 'https://unsplash.com/@traveleroohlala', 'https://unsplash.com/photos/a-green-plate-topped-with-scallops-covered-in-sauce-Wf9aOQoBJ7g', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000014';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000014', 1, 'Pea purée', '2 cups frozen peas', 'frozen peas', 2, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000014', 2, 'Pea purée', '2 tbsp butter', 'butter', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000014', 3, 'Pea purée', '¼ cup water', 'water', 0.25, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000014', 4, 'Pea purée', '4 fresh mint leaves', 'fresh mint leaves', 4, null, null, true),
  ('7e570000-0000-4000-8000-000000000014', 5, 'Crispy shallots', '2 shallots, sliced into thin rings', 'shallots', 2, null, 'sliced into thin rings', false),
  ('7e570000-0000-4000-8000-000000000014', 6, 'Crispy shallots', '1 cup vegetable oil, for frying', 'vegetable oil', 1, 'cup', 'for frying', false),
  ('7e570000-0000-4000-8000-000000000014', 7, 'Beurre blanc', '2 tbsp shallot, minced', 'shallot', 2, 'tbsp', 'minced', false),
  ('7e570000-0000-4000-8000-000000000014', 8, 'Beurre blanc', '¼ cup dry white wine', 'dry white wine', 0.25, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000014', 9, 'Beurre blanc', '2 tbsp white wine vinegar', 'white wine vinegar', 2, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000014', 10, 'Beurre blanc', '1 tbsp heavy cream', 'heavy cream', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000014', 11, 'Beurre blanc', '8 tbsp cold unsalted butter, cubed', 'cold unsalted butter', 8, 'tbsp', 'cubed', false),
  ('7e570000-0000-4000-8000-000000000014', 12, 'Beurre blanc', '1 tsp lemon juice', 'lemon juice', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000014', 13, 'Scallops', '8 large dry-packed sea scallops, side muscle removed', 'large dry-packed sea scallops', 8, null, 'side muscle removed', false),
  ('7e570000-0000-4000-8000-000000000014', 14, 'Scallops', '1 tbsp vegetable oil', 'vegetable oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000014', 15, 'Scallops', '1 tbsp butter', 'butter', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000014', 16, 'Scallops', '½ tsp kosher salt', 'kosher salt', 0.5, 'tsp', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000014';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000014', 1, 'Mise en place', 'Pat the scallops very dry and refrigerate them uncovered on paper towels for 15 minutes while you prepare everything else.', 900, null, null),
  ('7e570000-0000-4000-8000-000000000014', 2, 'Crispy shallots', 'Put the shallot rings in the cold oil in a small saucepan. Heat over medium, stirring, until golden, 10–12 minutes. Lift onto paper towels and salt; they crisp as they cool.', 660, null, null),
  ('7e570000-0000-4000-8000-000000000014', 3, 'Pea purée', 'Simmer the peas with the butter and water until just tender, 3 minutes. Blend with the mint until completely smooth, pass through a fine sieve, season and keep warm.', 180, null, null),
  ('7e570000-0000-4000-8000-000000000014', 4, 'Beurre blanc', 'Simmer the minced shallot, wine and vinegar until about 2 tablespoons remain, 5–6 minutes. Add the cream and bubble 30 seconds.', 360, null, null),
  ('7e570000-0000-4000-8000-000000000014', 5, 'Beurre blanc', 'Over very low heat, whisk in the cold butter a cube at a time, adding the next only when the last is almost melted, until pale and glossy. Season with salt and lemon juice; strain and hold in a warm — not hot — spot.', null, null, null),
  ('7e570000-0000-4000-8000-000000000014', 6, 'Scallops', 'Heat the oil in a heavy skillet over high until it shimmers. Season the scallops and lay them in, flat side down, without touching. Sear undisturbed until a deep crust forms, 1½–2 minutes.', 120, null, null),
  ('7e570000-0000-4000-8000-000000000014', 7, 'Scallops', 'Flip, add the butter and baste for 30–60 seconds, until the scallops are opaque and firm (145°F).', 60, null, 62.8),
  ('7e570000-0000-4000-8000-000000000014', 8, 'Plating', 'Spread pea purée on warm plates, set four scallops on each, spoon beurre blanc around and finish with crispy shallots and a pinch of flaky salt.', null, null, null);

-- Creamy Garlic Chicken with Spinach & Parmesan
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock)
values ('7e570000-0000-4000-8000-000000000015', (select id from public.recipe_sources where name = 'Kitchen Pantry Test Kitchen'), 'creamy-garlic-chicken-spinach-parmesan', 'Creamy Garlic Chicken with Spinach & Parmesan', 'Golden chicken thighs in a garlicky Parmesan cream sauce with wilted spinach — great for using up cream and greens.', 'italian', 2, 10, 25, 35, 4, array['stove']::text[], array['use-it-up', 'weeknight', 'high-protein']::text[], array['Serve with crusty bread, rice or pasta to catch every bit of sauce.']::text[], 'https://images.unsplash.com/photo-1762631383471-41fca144ca64', 'Cream sauce being poured over chicken with vegetables', 'joe boshra', 'https://unsplash.com/@joestudios', 'https://unsplash.com/photos/sauce-being-poured-over-a-dish-with-vegetables-QTh0Lbiju80', 'unsplash', true, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative;
delete from public.recipe_ingredients where recipe_id = '7e570000-0000-4000-8000-000000000015';
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
  ('7e570000-0000-4000-8000-000000000015', 1, null, '1½ lb boneless chicken thighs', 'boneless chicken thighs', 1.5, 'lb', null, false),
  ('7e570000-0000-4000-8000-000000000015', 2, null, '1 tsp kosher salt', 'kosher salt', 1, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000015', 3, null, '½ tsp black pepper', 'black pepper', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000015', 4, null, '1 tbsp olive oil', 'olive oil', 1, 'tbsp', null, false),
  ('7e570000-0000-4000-8000-000000000015', 5, null, '4 cloves garlic, minced', 'garlic', 4, 'clove', 'minced', false),
  ('7e570000-0000-4000-8000-000000000015', 6, null, '½ cup chicken broth', 'chicken broth', 0.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000015', 7, null, '¾ cup heavy cream', 'heavy cream', 0.75, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000015', 8, null, '½ cup grated Parmesan', 'grated Parmesan', 0.5, 'cup', null, false),
  ('7e570000-0000-4000-8000-000000000015', 9, null, '½ tsp dried oregano', 'dried oregano', 0.5, 'tsp', null, false),
  ('7e570000-0000-4000-8000-000000000015', 10, null, '3 cups baby spinach', 'baby spinach', 3, 'cup', null, false);
delete from public.recipe_instructions where recipe_id = '7e570000-0000-4000-8000-000000000015';
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
  ('7e570000-0000-4000-8000-000000000015', 1, null, 'Season the chicken. Heat the oil in a large skillet over medium-high and sear until golden and 165°F, 5–6 minutes per side. Remove to a plate.', 660, null, 73.9),
  ('7e570000-0000-4000-8000-000000000015', 2, null, 'Lower to medium. Add the garlic for 30 seconds, then the broth, scraping up the browned bits.', null, null, null),
  ('7e570000-0000-4000-8000-000000000015', 3, null, 'Stir in the cream and oregano and simmer until slightly thickened, 3–4 minutes. Stir in the Parmesan.', 240, null, null),
  ('7e570000-0000-4000-8000-000000000015', 4, null, 'Add the spinach and let it wilt, then return the chicken and any juices. Spoon the sauce over and serve.', null, null, null);
