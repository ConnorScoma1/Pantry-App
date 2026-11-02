# Recipe library — plan, data sources and costs

This document covers spec 08, the massive global recipe and menu library (milestone 18). It sets out what's built, where recipes can legally come from, what AI and data will cost, and the steps to grow to 10,000+ recipes. Nothing here has been deployed. The migration `supabase/migrations/20261101001800_recipe_library.sql` is waiting for your review.

## 1. What existed before

| Area | Before | Problem at 10,000+ recipes |
| --- | --- | --- |
| Storage | One `recipes` table with ingredient and step rows, a `recipe_sources` table with `is_approved`, tags, course (main/dessert) and photo credits. | Fine. It's extended rather than replaced. |
| Catalogue | 24 Test Kitchen recipes across 8 cuisines, from `catalog/test-kitchen.ts` and seeded by SQL. | Far too small, and there was no import path for other sources. |
| Loading | The app loaded up to 500 recipes, sorted by title, and ranked them on the device. | With 10,000 recipes it would always see the same A–C titles. |
| Search | A substring match on the device. | No filters, no natural language, no scale. |
| Variety | A meal-planner rotation and Surprise Me. | No history-based variety in browsing, and nothing to stop near-duplicates. |
| Status | Every recipe was implicitly "Editorial". | No way to tell tested from AI-written, or to hold dish ideas. |

## 2. What this milestone builds

**Vocabulary** (`packages/shared-types/src/library.ts`):
- 75 cuisines in 7 regions.
- 20 recipe categories (a recipe can be in several).
- 17 cooking methods and 8 flavour profiles.
- Authenticity levels: traditional, regional, adapted, fusion.
- Versions: classic, simplified, budget, elevated.
- Statuses: **tested** (a person cooked and checked it), **reviewed** (a person checked amounts, steps and food safety), **pending_review** (complete and checked automatically), **idea** (a dish with no instructions yet) and **retired**.
- Courses: main, side, starter, sauce, breakfast, dessert. Only "main" fills a dinner slot in a plan.

**The import pipeline** (`packages/recipe-engine/src/library/import.ts`, `scripts/import-recipes.ts`). Every source is converted to one format, then checked:
- Units are standardised (tbsp, cup, oz, lb, g…).
- Amounts are parsed, and implausible ones are rejected (for example "100 cups salt").
- Text with markup or links is rejected.
- USDA safe internal temperatures are enforced: poultry 165°F, ground meat 160°F, whole cuts and fish 145°F.
- Raw or cured fish, shellfish and meat must carry a safety note.
- Allergens, diet tags, proteins, methods and flavours are worked out from the ingredients. A source's own allergen list can only add to that list, never remove from it.
- Status is capped: a feed can't mark anything "tested" or "reviewed" (a person does that after import, in the database, and a database check requires a named reviewer), and AI drafts are always "pending_review".
- Photos are dropped unless they have a licence, credit and source page. Nutrition is dropped unless it says how it was calculated.
- Imports are a dry run by default and always write a report. `--sql` writes a SQL file for you to review; `--apply` sends batches of 200 using the service role.
- A new source starts **unapproved**, so its recipes stay hidden until you approve it.
- The tool never fetches web pages.

**Duplicate detection** (`library/dedupe.ts`). It indexes title words, core ingredients and a "dish key" (pad-thai, carbonara…):
- Same dish, same version and near-identical ingredients: rejected as a duplicate.
- Same recipe under a new name: rejected.
- Another version of the same dish (budget, elevated…): allowed and linked as a version.

Results show one card per dish, with a "+2 versions" note.

**Search** (`search_recipes` in SQL, `library/search.ts` on the device; both behave the same):
- Filters: cuisine, region, category, course, protein, method, flavour, difficulty, time, diet tags, allergens to exclude, equipment owned (with stand-ins), equipment needed, authenticity, version, occasion and must-use ingredients.
- Ordering: full-text relevance (title and dish weighted highest), fastest first, or a seeded rotation.
- It's backed by GIN indexes and a full-text document maintained by a trigger.
- It returns only recipes the caller may read: public recipes from approved sources, plus their own household's. It runs as a single query, so 50,000 rows aren't checked one by one.

**Natural-language search** (`library/query.ts`) uses rules, not AI, so it's free and predictable. All five example requests from the spec are covered by tests. It recognises:
- cuisine words ("Thai", "Szechuan");
- "authentic"; people ("for four"); budget ("under $50"); time; quantity ("five dinners");
- "restaurant-quality"; course and occasion words; diet and equipment words;
- "something completely different" (favour new cuisines and skip recent meals);
- whole-meal requests, which offer the menu builder.

Each part it understood is shown back as a chip.

**Variety engine** (`library/variety.ts`). It uses the household's own history and three modes (Familiar, A mix, Something new):
- No repeat of a dish, in any version, within three weeks (unless the household asks for favourites).
- Cuisine, main protein and method rotate.
- Recipes shown many times without being opened move down.
- Recipes that reuse ingredients bought recently move up a little.
- A diversify pass stops the top of the list being five chicken dinners.
- "Try a new cuisine" lists cuisines the household hasn't cooked or opened.

**Menu builder** (`library/menus.ts`):
- Templates: the five from the spec (Budget Family, Thai, Steakhouse, Luxury Seafood, Fine Dining), plus Taco Night, Sunday Roast, Mezze, Trattoria, Korean BBQ, Indian Feast, Thanksgiving, and "any cuisine".
- The Thanksgiving template appears only to households that opted in to that holiday.
- Each course is filled from the household's ranked library, so allergies, diet, equipment and "Not for us" all apply.
- It scales to guests, prefers simpler or elevated versions to match skill, and warns about hands-on time.
- It totals the cost **only from complete, verified store prices**. A menu with an unpriced course says so; it never guesses whether it's under budget.
- It builds a schedule ("start the prime rib 4 hr before") and a merged, scaled shopping list. Menus can be saved and sent to the grocery list.
- A course with only a dish idea is labelled as an idea and can't be cooked.

**AI versions and drafts** (`packages/ai/src/recipe-draft.ts`):
- From any recipe, a household can ask for a Simpler, Budget-friendly, Elevated or Traditional version. From a dish idea, it can ask for the full recipe.
- Claude writes it as structured JSON, with household recipe text marked as untrusted.
- It then goes through the same import validator, and is screened again for the household's allergens, avoided ingredients and equipment.
- It's saved **only for that household**, always as "AI draft · not reviewed". There's one cached draft per recipe and version, and a daily limit (`AI_DAILY_DRAFT_LIMIT`, default 5).

**Offline catalogue drafting** (`packages/ai/scripts/draft-library.ts`) uses the Message Batches API at half price. The drafts it produces go through the import tool and a person's review.

**Initial collection.** 56 new original Test Kitchen recipes, imported through the pipeline. Together with the existing 24, that's **80 complete recipes in 28 cuisines**. Every template's core courses are covered. There are also **273 dish ideas across 73 cuisines**.

**Beginner and plant-based dinners (added 2026-11-02).** A first-time cook (skill 1) could only be offered 6 dinners, so a 7-night week couldn't be filled, and a vegan household got 2. There are now 23 more original recipes (`catalog/library/beginner-mains.ts`):
- **16 beginner dinners.** Each needs only a stove and/or an oven, has few ingredients and plain steps, and gives the USDA safe temperature on every step that cooks meat, poultry, fish or eggs.
- **7 vegan, nut-free dinners.**

That brings it to **103 complete recipes**. Suitable dinners per household type, with a typical home kitchen:

| Household | Before | Now |
|---|---:|---:|
| Beginner | 6 | 27 |
| Vegetarian beginner | 3 | 14 |
| Vegan | 2 | 11 |
| Vegan beginner | 0 | 7 |

**100 more dishes from around the world (added 2026-11-02).** 100 of the dish ideas are now full original recipes, 25 per region (`catalog/library/americas.ts`, `europe.ts`, `africa-middle-east.ts`, `asia.ts`), and their idea entries were removed. Every one went through the import pipeline (validation, units, USDA safe temperatures, safety notes, allergens) and the duplicate check. Recipes changed for a home kitchen are marked "adapted" and say what changed. That brings the library to **203 complete recipes and 173 dish ideas**.

Photos: 145 of the 203 recipes have a credited "Similar dish" photo (Unsplash or Pexels; each licence checked on the photo's own page, and each image looked at before use). 58 have none yet, usually because no free photo clearly showed the dish, or the only ones showed an ingredient the recipe doesn't use.

While writing these, the allergen screen gained named cheeses (Pecorino, Gruyère, provolone…), custards and egg sauces, less common fish and shrimp pastes, more wheat foods (udon, orzo, gnocchi, Shaoxing wine, bread loaves) and bouillon as a hidden source; "butter lettuce", "butter beans", "bean curd" and "oyster mushrooms" are no longer misread. "Gluten-free" is now withheld when an ingredient is a likely hidden source (stock, bouillon, oats). This corrected three existing recipes: Spaghetti Carbonara (now shows milk), and Lemon Chicken Orzo and Bruschetta (now show wheat and gluten).

They start as "not yet reviewed", like the rest.

While adding them, two diet-tag errors in the stored tags were fixed, so the library's search filters now agree with the meal-planning filter:
- **Wrong "vegan" or "vegetarian" tags.** Black Bean & Cheddar Quesadillas and Creamy Coleslaw were tagged vegan, and Pan-Seared Halibut was tagged vegetarian.
- **Plant ingredients treated as dairy.** Coconut milk, peanut butter and cream of tartar no longer count as dairy, so Mango Sticky Rice is now correctly vegan.
- They're labelled honestly. Everything is "Not yet reviewed" until you or a reviewer sign it off: `update recipes set status = 'reviewed', reviewed_by = '…', reviewed_at = now() where …`.
- "Traditional" is used only where the method and core ingredients follow the dish's origin. Otherwise it's "Adapted", with the change named in the description.

**Apps.** Web and phone have:
- "For you" with variety modes and Try a New Cuisine.
- "Explore the library", with natural-language search, filters, dish ideas and paging.
- Status and authenticity badges, plus food-safety, leftovers and licence lines.
- An idea page and a versions panel on each recipe.
- A Menus screen.

## 3. Where recipes can come from (checked 1 November 2026)

**US copyright.** A list of ingredients, or a simple set of directions, isn't protected. Creative descriptions, headnotes, expressive instructions and photos are protected, and so are whole collections ([Copyright Office Circular 33](https://www.copyright.gov/circs/circ33.pdf)). Works by US federal employees have no copyright ([17 U.S.C. §105](https://www.copyright.gov/title17/92chap1.html)).

| Source | What you get | Can a paid app keep it? | Cost | Verdict |
| --- | --- | --- | --- | --- |
| [Spoonacular](https://spoonacular.com/food-api/terms) | Recipes and computed nutrition | Cache at most 1 hour (only ID, title and image URL may be kept). No copying and no building "the same experience". | Free (50 points/day, backlink) · $29 / $79 / $149 a month · enterprise from $300 | **Live search only** |
| [Edamam Recipe Search](https://developer.edamam.com/edamam-recipe-api) | 2M+ web recipes (links out, no instructions); 20K+ owned recipes on Plus | No copy of the data or a search index; attribution required | $9 / $99 / $399 a month | **Live search only** |
| [Edamam Recipe Licensing](https://developer.edamam.com/Food_recipe_licensing) | Publisher recipes with instructions, images and nutrition | The page suggests you can host them (terms not seen) | Quote | **Ask for a quote** |
| [CookButler](https://cookbutler.com/en/recipe-database/) | 45,000+ recipes with photos and nutrition; custom recipe production | Hosting rights and US coverage not stated | Monthly fee, not listed | **Ask for a quote** |
| StockFood | Professional recipes and photos | Terms couldn't be read | Quote | **Ask for a quote** |
| [FatSecret Platform](https://platform.fatsecret.com/terms) | 19,000+ recipes with nutrition and images | Only IDs may be stored beyond 24 hours. Bans use for "diet, nutrition or health advice". | Basic free (US, 5,000 calls/day); "Premier Free" for small startups | Only with a written caching deal |
| [BigOven](https://api.bigoven.com/documentation/termsofuse) | 1M+ recipes | 30-minute caching; personal use only | $99–$699 a month | **Not suitable** |
| [TheMealDB](https://www.themealdb.com/terms_of_use.php) | About 800 meals | Allowed with a paid key (a one-off $10 or £10); image rights vary per photo | Tiny | Too small to matter |
| [Wikibooks Cookbook](https://huggingface.co/datasets/gossminn/wikibooks-cookbook) | About 3,900 recipes, variable quality | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): attribution, and edited versions must stay CC BY-SA | Free | **Usable**, kept separate, with legal review |
| [Project Gutenberg cookbooks](https://www.gutenberg.org/policy/license.html) | Historic cookbooks | Public domain once Project Gutenberg's marks are removed | Free | Usable after modernising units and food safety |
| [USDA MyPlate Kitchen](https://www.myplate.gov/myplate-kitchen) | Hundreds to low thousands of recipes | Federal works have no copyright; check each recipe's author | Free | **Usable**, checked recipe by recipe |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide) | Nutrient data | CC0 (public domain) | Free; 1,000 requests/hour or bulk download | **Use for nutrition** |
| [Open Food Facts](https://world.openfoodfacts.org/terms-of-use) | Packaged products, not recipes | ODbL (share-alike database licence) | Free | Barcode features only |
| [Recipe1M+](https://pic2recipe.csail.mit.edu/), [RecipeNLG](https://huggingface.co/datasets/mbien/recipe_nlg), Food.com and Epicurious Kaggle sets, Tasty, Samsung Food/Whisk | — | Research-only, scraped, or closed to new clients | — | **Not usable** |

Not verified: Spoonacular's real catalogue size; Edamam's full terms; the licence fields of the Kaggle sets; MyPlate's current reuse policy; StockFood, NYT and Condé Nast terms. None of this is legal advice — have a lawyer read any licence before you sign it.

## 4. Recommended way to reach 10,000+

1. **Now (built):** 203 original recipes and 173 dish ideas; the import pipeline, search, variety and menus.
2. **Review the collection.** Have a person (ideally someone who cooks) review and test the 203 recipes and mark them reviewed or tested. This is what lets the app say "Kitchen-tested".
3. **License a core of 5,000–10,000 recipes you can host.** Get quotes from Edamam Recipe Licensing, CookButler and StockFood. The contract must cover:
   - hosting for the term, image rights, the right to edit and to calculate nutrition;
   - US territory;
   - what happens when the contract ends.

   Convert their feed (schema.org files work with `--format schema-org`), run a dry run, review the report and SQL, apply it, then approve the source.
4. **Add free, open content.** Federal recipes (after checking authorship), modernised public-domain recipes, and Wikibooks recipes under CC BY-SA, kept attributed and separate.
5. **Grow with commissioned recipes and reviewed AI drafts.** Draft from the dish-idea backlog in batches (`npm run recipes:draft`), import them as "pending_review", and approve the "Kitchen Pantry AI drafts" source only after people have reviewed them. AI drafts should never be the only gate.
6. **Nutrition.** Calculate it from USDA FoodData Central and record `nutrition_source = 'usda-fdc'`. Not built yet: it needs an ingredient-to-food matching table and a review of the results.
7. **Optional:** a live "search the web" tab through Spoonacular or Edamam, with their attribution and no storage.

## 5. Estimated AI and API costs

Claude prices are from the [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing), per million tokens: Sonnet 5.5 is $2 in / $10 out, or $1 / $5 through the Batch API. Token counts are estimates from the prompt sizes in this repo; measure real usage in `ai_usage` once it's live.

| Use | Tokens (in / out) | Cost each | Typical household per year |
| --- | --- | --- | --- |
| Library search, filters, variety, menus | — (no AI) | $0 | $0 |
| AI weekly plan (existing) | about 3,000 / 1,500 | about $0.021 | weekly: about $1.10 |
| Cooking assistant question (existing) | about 1,200 / 150 | about $0.004 | 10 a month: about $0.50 |
| AI recipe version or full recipe for an idea | about 1,500 / 1,800 | about $0.021 | 2 a month: about $0.50 |
| **Typical total** | | | **about $2 (about 8% of $24.99)** |

**Worst case.** Daily limits cap one household at 10 plans + 30 questions + 5 drafts ≈ $0.43 a day. Before launch, consider lowering the defaults to 3 plans, 15 questions and 3 drafts a day (about $0.18 a day at most). Limits are enforced in the database before Claude is called.

**Growing the catalogue with offline batch drafting:**

| Target | Claude cost |
| --- | --- |
| 10,000 drafts | about $0.010 each, about $140 with retries and rejects |
| 50,000 drafts | about $700 |

**The real cost is human review.** At about 5 minutes per recipe, 10,000 recipes is about 830 hours. That's why a licensed core is the better base.

**Licensing.** Live-search APIs cost $9–$399 a month. A hosting licence is quote-based, and it will very likely be the largest line.

**Database.** 50,000 recipes with their ingredients and steps is a few hundred MB including indexes, small for Postgres. Search uses indexes, and the app loads only one page or one 400-recipe weekly working set at a time.

## 6. Migration for review

`20261101001800_recipe_library.sql` adds columns, tables, indexes and functions. It deletes nothing.

- **recipes:** new columns for status, categories, methods, flavours, occasions, region, authenticity, dish key, version and "version of", storage and safety notes, text licence, attribution, reviewer and nutrition source; facts worked out at import (allergens, proteins, diet tags, core ingredients, fingerprint); and a search document with a trigger.
- **New checks:** "tested" or "reviewed" needs a reviewer; nutrition needs a source; the course list now includes side, starter, sauce and breakfast.
- **search_recipes(query):** security definer. Returns only ids the caller may read; the app then loads those rows with row-level security.
- **recipe_library_facets():** counts for the filter chips.
- **recipe_import_batches and import_recipe_batch(batch):** server only (service role). Upserts by source and external id; never overwrites another source's or a household's recipe; new sources start unapproved.
- **menus, menu_courses and save_menu(menu):** household only. A menu can only use recipes the household can read.
- **save_household_recipe(recipe):** AI drafts for one household, always "pending_review", one per recipe and version. Adds a `recipe_draft` AI feature with its own daily limit (`reserve_ai_request` replaced).

It also adds the security hardening from the review (bounded search input, a trigger on members' own recipe writes, hidden in-progress AI reservations, per-person AI limits, and stricter import rules; see SECURITY.md). Apply it after `…1700`, then re-run `supabase/seed_recipes.sql` (regenerated: 24 + 56 recipes and 273 ideas), then `supabase/tests/recipe_library_smoke_test.sql` (41 checks).
