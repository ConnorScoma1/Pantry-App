# Kitchen Pantry — Architecture

## 1. Shape of the system

```text
┌──────────── apps/web (Next.js) ────────────┐   ┌──── apps/mobile (Expo) ────┐
│ Server Components / Server Actions / Proxy │   │ Expo Router, NativeWind    │
│  • validate input (zod)                    │   │  • anon key only           │
│  • call Supabase as the signed-in user     │   │  • server work via web API │
│  • call Claude (server only, Phase 3)      │   └────────────┬───────────────┘
└───────────────┬────────────────────────────┘                │
                │  shared packages (types, validation, engines, tokens)
                ▼                                               ▼
        ┌──────────────── Supabase ────────────────┐
        │ Postgres + RLS · Auth · Storage           │
        │ RPCs for multi-table writes (atomic)      │
        └───────────────────────────────────────────┘
```

**Shared data layer.** `@kitchen-pantry/database` exposes `KitchenRepository` and `ProfileStore`, each with a Supabase implementation and an on-device implementation (preview mode). The web app calls the Supabase versions from server actions; the mobile app calls them directly with the user's session. Both run the same validation and mapping code, covered by tests with a fake Supabase client.

**Rules that shape the code**

1. **Business logic lives in packages, not apps.** Allergen screening, unit conversion, package-size pricing and budget verdicts are pure TypeScript with unit tests, used by web, mobile and server alike.
2. **Every boundary validates.** Forms, server actions, RPC payloads, stored JSON and AI output all pass through the zod schemas in `@kitchen-pantry/validation`.
3. **The database enforces access.** Row-level security is on for every table. App code runs as the signed-in user with the anon key, so a bug in the app can't read another household's data. The service-role key is reserved for server-side jobs (price ingestion) and never shipped to a client.
4. **Honesty is a data rule, not a UI nicety.** Price status (`verified | cached | estimated | unavailable`) is derived in one function (`classifyPrice`) from provider type, store-specificity and age; mock providers can only ever produce `estimated`. Ratings are shown only when real (`recommendationLabel`). Retailers appear as "supported" only via the integrations registry, which is empty until a real integration is verified.
5. **AI suggests; code decides.** Claude output (Phase 3+) is parsed against a schema and then passed through the same hard filters (allergies, diet, equipment, skill) as any other recipe. AI text never becomes SQL or commands.

## 2. Key decisions

| Decision | Why |
| --- | --- |
| **npm workspaces + Turborepo** | Ships with Node; works on Windows without extra tooling; Expo's Metro supports it natively. |
| **Packages ship TypeScript source** (no build step) | Next (`transpilePackages`) and Metro compile them. Faster iteration; one less thing to break. |
| **Tokens as TS → generated CSS variables** | One source of truth. Web (Tailwind 4) and mobile (NativeWind/Tailwind 3) both read `--kp-*` variables, so dark mode is a variable swap, not duplicated classes. |
| **Household-level vs user-level settings** | Budget, diet, allergies, equipment and store belong to the household (everyone eats the same dinner); skill level, goals and taste preferences belong to each person. |
| **Allergies stored per household, screened by text + aliases** | Strictest safe default. Matching is deliberately broad (false positives cost a suggestion; false negatives can hurt someone) and never claims "allergen-free". |
| **Onboarding saved via one RPC** (`save_onboarding_profile`) | Seven tables written atomically, under RLS (`SECURITY INVOKER`), with the same JSON shape the UI uses. |
| **Text + CHECK constraints instead of Postgres enums** | Easier to evolve without migrations that lock tables. |
| **Quantities keep original + normalised values** | Recipes display what the author wrote; maths uses grams / millilitres / each. Cross-dimension conversions (cups → grams) only with a known density — never guessed. |
| **Price observations are append-only** | Full history for caching, trend checks and audits; "current price" is the latest observation per product + store. |
| **Preview mode when Supabase isn't configured** | Anyone can run `npm run dev` and click through the product before setting up a database. Clearly labelled in the UI. |
| **Next.js 16 `proxy.ts`** for session refresh | Current replacement for middleware; validates the session with `auth.getUser()` rather than trusting the cookie. |

## 3. Risks and open decisions

These need a product/business decision before or during the named phase.

1. **Real grocery prices (Phase 5) — biggest risk.** Most retailers don't offer public pricing APIs; options include retailer partner programs (e.g. Kroger's developer API, which has terms limiting use), commerce platforms (Instacart Developer Platform), or licensed data providers. Each has different coverage, cost and display terms. *Decision needed:* which provider(s) to pursue first, and budget for data licensing. Until then every price is labelled an estimate.
2. **Recipe content licensing (Phase 2).** We need a legal source of high-quality recipes. The Performance Foodservice culinary pages referenced in the brief are publicly visible, but that does not grant rights to copy or republish them — we'd need written permission or a licence. Options: licensed recipe API, partnership, or an in-house test kitchen of original recipes. **Current approach:** an original in-house *Kitchen Pantry Test Kitchen* catalogue (15 recipes, levels 1–5), stored in `packages/recipe-engine/src/catalog` and generated into `supabase/seed_recipes.sql`. Licensed or partner sources can be added later through `recipe_sources`. *Still open:* whether to license a larger catalogue. Without real ratings, recipes are labelled "Editorial" (or "AI suggestion" once AI recipes exist).
3. **Store locator (Phase 5).** Showing nearby stores needs an authorized places/location provider (Google Places, Mapbox, a retailer's own locator). Cost and display terms vary.
4. **Allergen liability.** The app reduces risk but cannot guarantee safety. Product copy already says so; get a legal review of the wording before launch.
5. **Food-safety guidance for "Use it before you lose it".** Urgency currently uses only the user's dates. Adding default shelf-life guidance (e.g. USDA FoodKeeper data) needs a licensed/public-domain source and conservative defaults.
6. **AI cost control.** Claude calls will be server-side, rate-limited per user, cached where inputs repeat, and capped by `AI_MAX_OUTPUT_TOKENS`. *Decision needed:* free-tier limits per user per week.
7. **Mobile ↔ server API.** Mobile talks to Supabase directly for RLS-protected reads/writes; anything needing secrets (AI, pricing) will go through Next.js route handlers authenticated with the user's Supabase JWT. To be built in Phase 3.
8. **Hosting.** Natural fit: Vercel (web) + Supabase (hosted) + EAS (mobile builds). Not yet chosen.
9. **Package manager on Windows.** npm workspaces are used for simplicity. If installs become slow, pnpm is a drop-in upgrade (needs `node-linker=hoisted` for Expo).

## 4. Database overview

Core tables in `supabase/migrations` (see the folder for every migration), grouped as:

- **People:** `profiles`, `households`, `household_members`, `user_preferences`
- **Constraints:** `household_allergies` (→ `allergens`), `dietary_restrictions`, `household_equipment` (→ `equipment`)
- **Inventory:** `ingredients`, `pantry_items`, `pantry_transactions` (barcode/receipt fields ready). Every add, amount change and removal is logged to `pantry_transactions` by trigger; `pantry_remove_item(id, reason)` records *used up / thrown out / went off*; `search_ingredients(q)` does name, alias and typo-tolerant search.
- **Recipes:** `recipe_sources`, `recipes`, `recipe_ingredients`, `recipe_instructions`, `recipe_ratings`, `user_favorites`
- **Planning:** `meal_plans`, `planned_meals`, `cooking_history`
- **Shopping:** `grocery_lists`, `grocery_list_items`
- **Pricing:** `retailers`, `store_locations`, `retailer_products`, `product_price_observations`, `ingredient_product_mappings`

Security: helper functions `is_household_member` / `is_household_owner` (security definer, fixed `search_path`); every household-scoped table is limited to members; reference data is read-only to users; recipes are public only from approved sources. The SQL smoke test in `supabase/tests` checks that a second user cannot read, join, write into or redirect to another household, and cannot fabricate price data.

## 5. Roadmap

Product specs live in [`docs/specs`](specs): the original platform spec (01), **AI intelligence & local specials** (02), **One Store vs. Best Deals** (03), **Shared Household** (04), **Dessert Planning** (05), **Seasonal Cooking** (06) and **Smart Cart Checkout** (07). The order below merges the priority list from spec 02 with the original phases. Each step ships with real persistence and tests, and labels mock data as mock.

| # | Milestone | Specs | Status |
| --- | --- | --- | --- |
| 1 | **Foundation** — monorepo, tokens, schema + RLS, auth, onboarding, web + mobile shells | 01 | **Done** |
| 2 | **My Kitchen inventory** — items, staples checklist, use-by urgency, transaction log, category guessing; mobile sign-in + onboarding | 01 §5–6, 02 §9.1 | **Done (web + mobile)** · barcode/receipt import and "update My Kitchen after cooking" added in milestone 19 |
| 3 | **Recipes & ratings** — approved-source catalogue, recipe detail, skill/equipment/allergy filtering, ratings, favourites, recommendation history | 01 §7, 02 §4 | **Done (web + mobile)** — incl. credited photos, "Not for us" + history |
| 4 | **AI weekly meal planning** — Claude-ranked plans from deterministic candidates; planning modes *Budget First / Balanced / Chef's Choice / Use What I Have* | 01 §8, 02 §3 | **Done (web + mobile)** · costs wait on milestone 5–6 prices |
| 5 | **Shared household + grocery list** — invites (link or email), owner/member roles, personal allergies combined for planning, one live grocery list built from the meal plan | 01 §9, 04 | **Done (web + mobile)** · migration awaits review · package sizes + prices wait on milestone 6 |
| 6 | **Local pricing integration** — first verified provider (Kroger API, Kroger-family stores), household store choice, product matching, package math, sale prices, "No price" when none | 01 §10, 02 §1 | **Done (web + mobile)** · migration awaits review · several stores, radius and loyalty cards move to milestone 9 |
| 7 | **Specials tab** — promotions from permitted feeds/partners with filters, source links, expiry, regular vs sale, unit price | 02 §2 | **Done (web + mobile)** for Kroger store sale prices · weekly ads / BOGO / digital coupons wait on a permitted source |
| 8 | **Cook the Specials** — fifth planning mode built on verified promotions | 02 §3 | **Done (web + mobile)** — store sale prices; weekly-ad sources would plug into the same `specials` input |
| 9 | **One Store vs. Best Deals** — basket pricing per store, promotion eligibility, multi-store optimiser (2–4 stops), fuel/time cost from a routing provider, route order + store hours, list by store, AI explanation, trip stores' specials in Cook the Specials, "Is there a cheaper week?" swaps on the plan | 03 | **Done (web + mobile)** · Kroger-family stores only (other chains need a permitted price source) · drive times off until `MAPBOX_ACCESS_TOKEN` is set · labelled practice mode · migration awaits review |
| 10 | **Personalised recommendations & Surprise Me** — learns from ratings/history, avoids repeats, explains each pick | 02 §4–5 | **Done (web + mobile)** · migration awaits review |
| 11 | **Proactive weekly planning** — opt-in background drafts + notifications; never buys, never overwrites a confirmed plan | 02 §6 | **Done (web + mobile)** · off until the server job is scheduled · migration awaits review |
| 12 | **Smart Savings dashboard** — budget vs basket, verified savings vs estimates, waste avoided, trends | 02 §7 | **Done (web + mobile)** · migration awaits review |
| 13 | **Dessert planning** (optional) — frequency, separate dessert skill, categories, favourites, prep/chill timing, shared basket | 05 | **Done (web + mobile)** · migration awaits review |
| 14 | **Seasonal cooking** — automatic season from ZIP/region and date (both hemispheres), boost not filter, "In Season This Week", opt-in holidays, opt-in sale-price check | 06 | **Done (web + mobile)** · migration awaits review |
| 17 | **Smart Cart Checkout** — list → retailer products → household review/approval → one-time send to the retailer cart → finish at the retailer | 07 | **Done (web + mobile)** with the practice retailer · Kroger cart built, off until switched on · migration awaits review |
| 15 | Shared household part 2 — per-person servings and "who's eating tonight", shared kitchen activity feed | 04 | **Done (web + mobile)** · migration awaits review |
| 16 | Cooking mode, Chef mode, production readiness (server-sent invite email needs an email provider) | 01 §11–14, §18 | **Done (web + mobile)** · CI, health check, error logging, EAS profiles, optional Resend invites · migration awaits review |
| 19 | **Barcode scanning & receipt import** — scan or type a barcode (Open Food Facts, cached and rationed on the server) to pre-fill an item; photograph a receipt, Claude reads the lines, the household reviews and adds them with price paid and date | 01 §5 | **Done (web + mobile)** · phone needs `expo-camera` + `expo-image-picker` installed · migration awaits review |
| — | **Low-cost, provider-independent AI** — one AI layer for Gemini (default `gemini-3.1-flash-lite`), Claude, OpenAI and Groq; cost per request logged; monthly per-person limit and app-wide spending cap; AI meal plans saved per household for reuse; Gemini proof of concept (`npm run ai:poc`), quality test set (`npm run ai:eval`), cost estimates (`npm run ai:costs`, [AI_COSTS.md](AI_COSTS.md)) | — | **Proof of concept** · tested with a free-tier Gemini key (results in [AI_COSTS.md](AI_COSTS.md)) · migrations `…2300` and `…2400` await review |
| — | **Saved grocery lists** — keep a list under a name, add it back skipping what's already there | 01 §9 | **Done (web + mobile)** · migration `…2200` awaits review |
| — | **Cooking history** — meals cooked (from the "cooked" log and ratings), monthly list with ratings and notes, 30-day stats, cuisines cooked most, "worth making again" | 01 Phase 6 | **Done (web + mobile)** · no migration |
| — | **Use it before you lose it** — pick one or more ingredients to use up; ranked recipe ideas that use the most of them, with what you'd still buy, basics listed separately, "you have …" when short, and an on-request extra-cost check at the household's store | 01 §6 | **Done (web + mobile)** · "Ask AI for a new idea" needs `ANTHROPIC_API_KEY` · no migration |
| — | **Use-soon reminders** — once a day in each person's daytime, a notice (bell / phone Home) and optional phone notification about kitchen items due today or tomorrow; per-person switches in Profile → Reminders | 01 Phase 6 | **Done (web + mobile)** · needs `USE_SOON_REMINDERS=on` and an hourly call to `/api/jobs/use-soon` · migration awaits review |
| 18 | **Global recipe library & menus** — 75 cuisines, statuses (tested / reviewed / not yet reviewed / idea), import pipeline with validation and duplicate detection, database search, natural-language search, variety engine, menu builder, AI versions | 08 | **Done (web + mobile)** · 476 complete recipes · licensed catalogue still to choose (see [RECIPE_LIBRARY.md](RECIPE_LIBRARY.md)) · migration awaits review |

## 6. Design notes for the new features (specs 02 & 03)

These keep the existing architecture — new providers and engines plug into the packages that already exist.

**Promotions (Specials, Cook the Specials).** `@kitchen-pantry/grocery-pricing` gains a `PromotionProvider` interface beside `PricingProvider`. Every promotion records: retailer, store, product match, regular and sale price (only when the source shows both), promo type (sale, BOGO, digital coupon, loyalty price, multi-buy), whether a coupon/membership is required, valid-from/valid-to, source URL and retrieval time. Providers are registered in `@kitchen-pantry/integrations` only after access terms are confirmed — public visibility is not permission to scrape. A labelled mock provider comes first.

**Promotion eligibility.** A deterministic `isEligible(promo, household)` checks loyalty memberships, digital-coupon opt-in, store selection and dates. Savings count as *verified* only when the regular price, sale price and eligibility are all known; anything else is an estimate.

**Shopping optimiser (spec 03) — built in milestone 9.** `@kitchen-pantry/shopping-optimizer` (as designed below; the basket per store reuses `priceBasket` from grocery-pricing, trips are ranked by items covered first and then cost, and `runComparison` ties pricing, routing and comparison together for the server). Eligibility (`itemCost`) counts a sale price only with the retailer's loyalty card; routing is a `RoutingProvider` (Mapbox, plus a sample one for practice mode). A new `@kitchen-pantry/shopping-optimizer` package, all deterministic and unit-tested:
- `priceBasketAtStore` — package-accurate totals, missing items, promos, tax estimate.
- `optimizeMultiStore` — cheapest assignment of items to at most 2–4 stores within radius/time limits (exhaustive search over store subsets; grocery lists are small enough).
- `travelCost` — distance × fuel price ÷ vehicle efficiency; time × user's value of time. Distances/times come **only** from a routing provider (Mapbox / Google Routes / OSRM) — never estimated by the app or the AI.
- `compareStrategies` — One Store vs Best Deals vs Best Overall Value, with honest "incomplete data" outcomes when prices are missing.

Claude only *explains* these results (given the numbers as structured input) and suggests alternative meals; it cannot change a price or a distance.

**AI recommendation engine & cost control.** One pipeline used by planning, Surprise Me and Cook the Specials:
1. *Deterministic candidate retrieval* — approved recipes passing hard filters (allergies, diet, equipment, skill), scored by pantry overlap, use-by urgency, verified promotions, package-cost, ratings and recency.
2. *Claude ranking & reasoning* — a short list of candidates goes to Claude with the household context; it returns a structured selection plus a one-line "why you're getting this", validated with zod.
3. *Original recipes* are allowed only through a validated schema (quantities, units, steps, temperatures) and are labelled "AI recipe".
Results are cached by a hash of inputs; arithmetic, conversions, list consolidation, inventory deductions, budgets and price comparisons never call the model.

**Avoiding repeats.** A `recommendation_events` log (shown / accepted / swapped / dismissed) plus `cooking_history` feeds a recency penalty; favourites and explicit requests are exempt.

**Proactive planning.** Built in milestone 11 — see *How weekly drafts work* below. An hourly scheduled call (Vercel Cron or pg_cron + pg_net) hits a Next.js route rather than an Edge Function, so the same TypeScript packages plan the week. It never purchases anything and only ever writes into an empty week.

**Savings dashboard.** Pantry usage is reported as "value of food used", not cash savings, unless compared against a defined alternative basket. Verified and estimated savings are shown separately.

**Navigation.** A Specials destination makes six top-level areas. On desktop it's a sidebar item. On phones, five tabs is the comfortable maximum — proposal: put Specials as a tab and move Profile behind an avatar button in the header. (Decision for milestone 7.)

### Planned schema additions (added in the milestone that needs them)

| Milestone | Tables / columns |
| --- | --- |
| 3 | ✅ `recipes.tags`, `recipes.tips`, `recipe_ingredients.item`, `recipe_ratings.household_id` default, `recipe_rating_summaries()`, photo credit/licence columns, `recommendation_events` + `dismissed_recipe_ids()` · later: `recipes.quality_score` cache |
| 7 | ✅ none: specials are fetched live and never stored (same as prices) |
| 10 | ✅ `recommendation_events.surface` allows `surprise` (Surprise Me history); taste is computed from ratings, not stored |
| 17 | ✅ `cart_drafts` (shape-checked lines jsonb, status, version, transfer_key, result, purchase) with `save/approve/begin/finish/resolve/discard` functions and `set_cart_purchase`; real-retailer sends server-only; `retailer_connections` (sealed tokens, server-only) + `retailer_connected()` |
| 14 | ✅ `user_preferences.seasonal` (jsonb, personal), `households.seasonal_region` (override, nullable); `save_seasonal_preferences()`, `seasonal_preferences_json()`; onboarding profile gains `seasonal`. Season and prices are never stored |
| 13 | ✅ `recipes.course / dessert_category / chill_minutes`; `planned_meals.meal_type` allows `dessert`; `households.dessert_frequency / dessert_categories`; `user_preferences.dessert_skill_level`; `save_dessert_preferences()`; `save_meal_plan()` stores meal type |
| 6 | ✅ `households.pricing_provider / pricing_store_id / pricing_store_name / pricing_store_address / pricing_store_set_at`; plan lines fill `grocery_list_items.required_quantity / required_unit`. Prices are fetched live, not stored · later: `household_store_preferences`, `household_loyalty_memberships` |
| 5 | ✅ `household_invites` (hashed tokens), membership functions, `member_allergies` + `member_diet_items` (personal) with `household_allergies` / `dietary_restrictions` as the combined list, `grocery_list_items` attribution + plan columns, Realtime publication |
| 4 | ✅ `meal_plans.planning_mode`, `generated_by`, `summary`, `confirmed_at`; `planned_meals.note`; `save_meal_plan()`; `ai_usage` + `ai_requests_last_day()` |
| 7 | `promotions` (store, product, type, regular/sale price, requirements, valid dates, source URL, provider, retrieved_at) |
| 9 | ✅ `shopping_preferences` (personal: stops, radius, limits, value of time, fuel price, mpg, minutes per store, starting address text, preferred/excluded stores, loyalty cards, stores compared), `shopping_trips` + `shopping_trip_stops` + `shopping_trip_items` (shared; via `save_shopping_trip()` / `end_shopping_trip()`), `shopping_advice` AI feature. No prices or coordinates stored |
| 11 | ✅ `weekly_planning_settings` (household), `planning_jobs` (one per household-week; status, message, details), `notifications`, `notification_preferences` and `push_tokens` (per person) |
| 12 | ✅ `pantry_transactions.price_paid_cents` / `use_by`, `grocery_spending` (logged shops), `savings_overview(since)` |
| 15 | ✅ `user_preferences.portion`, `meal_attendance` (own answers only), `meal_guests`, `meal_attendance_range()`, `household_activity()` |
| 16 | ✅ `ai_usage.feature` allows `cooking_help` (its own daily limit) |
| 19 | ✅ check on `pantry_items.barcode` (8–14 digits; `source` / `barcode` existed since milestone 1), `receipt_import` AI feature. Receipt photos and product lookups aren't stored |
| — | ✅ `notification_preferences.use_soon_in_app` / `use_soon_push` / `time_zone` (checked against Postgres's zone list), `notifications.kind` allows `use_soon`, `notifications.expires_at` (expired notices hidden), `use_soon_runs` (job bookkeeping, no access for users), `use_soon_reminders()` (server only), notices removed on leaving a household, at most 10 push addresses per person |
| 18 | ✅ library columns on `recipes` (status, categories, methods, flavours, occasions, region, authenticity, dish key, version, safety/storage notes, licence, reviewer, facts for search, `search_document`), `search_recipes()`, `recipe_library_facets()`, `recipe_import_batches` + `import_recipe_batch()` (server only), `menus` + `menu_courses` + `save_menu()`, `save_household_recipe()` and the `recipe_draft` AI feature |

## 7. Open decisions (added by specs 02 & 03)

1. **Promotion/price sources** — which retailers or data partners allow commercial use of their weekly ads and prices (e.g. retailer partner APIs, Instacart Developer Platform, Flipp-style circular partners). Same blocker as pricing.
2. **Recipe source** — the library and import pipeline are built (milestone 18). Which catalogue to license is still open: the research, the options and the costs are in [RECIPE_LIBRARY.md](RECIPE_LIBRARY.md). In short, the commercial recipe APIs allow live search only, so a library you own needs a hosting licence (Edamam Recipe Licensing, CookButler or StockFood quotes), open or public-domain content, or commissioned and reviewed recipes.
3. **Routing provider** — Mapbox Matrix + Geocoding is built (milestone 9; temporary geocoding, nothing stored). Google Routes or self-hosted OSRM would be another `RoutingProvider`.
4. **Fuel price** — user-entered (milestone 9; no default, so nothing is guessed). A licensed regional feed (e.g. EIA weekly retail prices) could pre-fill it.
5. **Notifications** — email first (Supabase Auth email) vs push (Expo notifications) for "your plan is ready".
6. **Six-destination navigation on phones** (see §6).

## 8. Next step

**Review and apply** the seventeen pending migrations (`…0800_shared_household.sql` through `…2400_ai_plan_cache.sql`), add Kroger API keys and a Mapbox token, and try the list against real stores. Then switch on Kroger carts (README, *Smart Cart*), weekly drafts (README, *Weekly drafts*) and use-soon reminders (README, *Use-soon reminders*). Every planned milestone is built. Next: have a person review the 476 library recipes, request quotes for a hosting licence (see [RECIPE_LIBRARY.md](RECIPE_LIBRARY.md) §4), find a permitted price source for a second store chain (so Best Deals can compare across chains, not only Kroger-family stores), and do real-device testing (push notifications, wake lock, timers, location).

### How barcodes and receipts work

- **After cooking.** `recipe-engine/src/after-cooking.ts` matches the recipe's ingredients to kitchen items (`pantryItemMatches`, soonest use-by first, staples and expired items skipped) and works out what's left with `convert()` in the item's own unit. Comparable amounts become "reduce" or "used up" (ticked); anything that can't be compared becomes "used it all?" (unticked). The apps apply only what the household confirms, through the normal update/remove calls, so the pantry history logs each change.

- **Barcodes.** `integrations/src/open-food-facts.ts` checks the GTIN check digit (UPC-A becomes EAN-13), asks Open Food Facts' v2 product endpoint for five fields only, strips markup and guesses a category (`guessCategory`, then Open Food Facts categories). The web server caches answers (found or not) for a week and rations calls: 12 a minute for the whole server (their limit is 15), 30 an hour per person. Phones call `/api/products/barcode`; the browser uses a server action. Items save with `source = 'barcode'` and the code.
- **Receipts.** `ai/src/receipt.ts` checks the image bytes match the declared type (JPEG/PNG/WebP, ≤ 3.5 MB; the browser shrinks photos to 1,600 px first), sends it to Claude with structured outputs, and cleans the answer: markup removed, long digit runs (cards, accounts, phones, item codes) cut out, payment and total lines dropped, units limited to ones we track, prices bounded, dates only when plausible. The household reviews; `addMany()` saves the ticked lines in one insert with `source = 'receipt'`. `/api/kitchen/receipt` accepts the browser's session (same-origin JSON only) or a phone's bearer token, and has its own daily AI limit.

### How cooking history works

- `RecipeRepository.history()` loads the household's "cooked" events (up to 300, RLS applies) and the recipes behind them and its ratings, fetched by id so recipes outside the weekly working set still show. `recipe-engine/src/history.ts` `cookingHistory()` merges "cooked" entries for the same recipe within 6 hours into one meal, attaches a rating made within 12 hours (a rating with no cook nearby counts as a meal), and works out the stats. The older `cooking_history` table is still unused; the event log is the record.

### How Use it before you lose it works

- `recipe-engine/src/use-it-up.ts`: `ideasToUseUp(ranked, picked, today)` starts from the household's normal ranking (allergies, diet, equipment, "not for us" already applied), drops picked items past their date, and keeps recipes that use at least one picked item (`pantryItemMatches`). Ideas are ordered by how many picked items they use, the most urgent of those, then fewest to buy; each picked item gets an idea first when one exists. Salt, pepper, oils and dried spices (from the staples list) are split out as "basics". `shortOf()` compares amounts with `convert()` to say "you have 1 lb".
- AI: `draftRecipe()` gained a `use_up` kind (`ai/src/recipe-draft.ts`): the picked ingredients go into the prompt inside `<kitchen>` data tags (angle brackets stripped), the answer carries a cuisine from the fixed list, and `answerToRecipe()` also refuses a recipe that uses none of them. The server (`draftUseUpForHousehold`, web action and `/api/recipes/use-up` for the phone) reads the items by id from the household's kitchen, drops staples and past-date items, reserves a `recipe_draft` slot and saves the result with `save_household_recipe` as not reviewed.
- Prices: `shoppingForIdeas()` builds one basket request (≤ 80 lines) for the shown ideas; the apps send it through the existing price route (web server action, phone `/api/pricing`) only when tapped, and `extraCosts()` adds up the priced lines per idea.

### How use-soon reminders work

- Something calls `/api/jobs/use-soon` hourly with the cron secret (`lib/planning/reminders.ts`). It calls `use_soon_reminders()` with the service role; the database does the rest.
- For each person with reminders on (in the app or on the phone), in their active household: it works out their local time (their saved time zone, else the household's weekly-drafts zone, else US Central), skips anyone outside 8 AM–8 PM or already reminded today (`use_soon_runs`), and finds non-staple items with quantity left whose use-by date is today or tomorrow. Past-date items are never included.
- It writes the notice ("Use soon: Chicken thighs and 2 more" / "Chicken thighs (by Nov 2)…", link `/kitchen`, expiring at the end of the person's day) when in-app is on, and returns the phone notifications to send; the server looks up push addresses and sends them through Expo, forgetting dead addresses. Old use-soon notices and run rows are tidied after a week.
- Notification switches are saved one at a time (only the changed column), and the apps take the server's answer, so two screens or devices can't overwrite each other. The apps save the device's time zone whenever the person changes a reminder switch. On the phone, turning on any phone notification registers this phone; when the server says none are left on, the phone is forgotten.

### How One Store vs. Best Deals works

`packages/shopping-optimizer` is pure and unit-tested (26 tests), so web and mobile behave the same.

- **Prices.** `priceStores()` runs grocery-pricing's `priceBasket()` at each store (two at a time, sharing the search cache). `buildCostTable()` drops lines that are unpriced, out of stock, estimated (real stores) or older than 24 hours, and applies eligibility: a sale price counts only when the shopper has that retailer's card (Kroger's card covers all its banners); otherwise the same product is costed at its regular price and the difference is reported.
- **Trips.** `optimizeMultiStore()` tries every set of up to `maxStops` stores among at most 8 candidates (excluded and out-of-radius stores removed; radius is straight-line, only as a filter). Each item goes to the cheapest store in the set; a set where a store gets nothing is skipped. Trips are ranked by items covered, then by groceries + fuel; the time and distance limits are applied against the one-store trip when drive times are known. Best overall value adds time × value of time and prefers fewer stops, then preferred stores, within $1.
- **Travel.** `orderStops()` tries every visiting order (≤ 24) on the routing provider's matrix and picks the least drive time; any unroutable leg means no travel figure. Fuel = miles ÷ mpg × the shopper's fuel price; time = drive + their minutes per store. `isOpenAt()` checks Kroger's store hours in the store's time zone at each estimated arrival.
- **Comparison.** `compareStrategies()` compares against the household's usual store when it's in the set (else the best single store), counts savings only on items both trips price, sets confidence (complete / partial / insufficient) and writes the recommendation sentence from the numbers. It lists every limitation (practice data, failed stores, items priced nowhere, no drive times, no fuel price, card-only sales, coupons, one-package assumptions, closed stores).
- **Server.** `apps/web/src/lib/shopping/server.ts` validates the request, re-reads each store from Kroger (client store details and coordinates are never trusted), geocodes the starting address with Mapbox per request, and returns the result with an HMAC-signed copy of the advisor facts (bound to the user, 30 minutes). `/api/shopping/compare` and `/api/shopping/advice` serve the phone. Practice mode runs the same code with `SampleStoresPricingProvider` and `SampleRoutingProvider` (on the phone, locally).
- **Advisor.** `ai/src/shopping-advice.ts` sends only `buildAdviceFacts()` (formatted numbers, store names, up to six item names per stop with their digits removed) and rejects any answer containing a number — digits or words — that isn't in the facts, or any fraction, multiplier, percentage or non-ASCII digit.
- **Meal planning (§6).** Cook the Specials loads sale prices at the usual store *and* the stores on the household's active trip. `meal-planner/src/cheaper-week.ts` suggests up to three cheaper swaps for a planned week: candidates already pass the household's filters, must score within 8 points of the meal they replace, and favourites, locked and hand-picked nights stay. Savings are labelled exact, at least (the new recipe is fully priced, the old one isn't) or estimate (≥ 70% of both priced, no more unknowns in the new one, ≥ $1.50 a serving). It doesn't yet re-plan the whole week around the cheapest multi-store basket.

### How cooking mode and Chef mode work

These live in `recipe-engine/src/cooking.ts` (pure and unit-tested), so web and mobile behave the same.

- **Amounts in each step.** `cookingSteps(recipe, factor)` puts scaled amounts into each step. `stepIngredients()` matches an ingredient when all its main words appear in the step, or when one distinctive word does. A word shared by two ingredients counts only for the one where it's the noun ("rice" means the cooked rice, not the rice vinegar), and generic words ("the sauce") never match alone. The step's own component is preferred.
- **Substitutions.** `substitutionsFor()` is a curated table, filtered with the same allergen screen as recipes and the household's never-recommend list.
- **Chef mode.** `isChefRecipe()` is true for skill ≥ 4 or ≥ 3 components. `miseEnPlace()` groups everything that needs measuring or prep by component. `serviceTimeline()` gives a sequential running order: each step's timer, or 3/5/8-minute estimates by length, worked back from service. The apps say plainly that cooks should overlap components.
- **The assistant.** `ai/src/cooking-help.ts` builds a prompt from the recipe, the scaled steps, the current step and the household's allergen codes, with nothing personal. It asks for a validated `{answer, safetyNote}`. Any answer that trips the allergen screen is thrown away. The server loads the recipe and allergens itself, as the signed-in user; it logs `ai_usage` under `cooking_help`, has its own daily limit, and fails closed. `cookingTips()` is the curated fallback.

### How who's eating and the activity feed work

- **Attendance** comes from `dayAttendance(data, day, cookingFor)` in `meal-planner/src/household.ts`:
  - Members eat unless they answered "out".
  - `others = max(0, cookingFor − members)` covers people without accounts.
  - Servings = ⌈Σ portion(eating members) + others + guests⌉.

  `set_meal_attendance()` only ever writes the caller's own row, for yesterday through 62 days ahead. `set_meal_guests()` is for any member. Both tables are read-only to clients and published for Realtime (`subscribeToAttendance`). Servings change only when a member taps the suggestion.
- **Portion** is set with `set_my_portion()`, rounded to quarters between ¼ and 3. It lives in `user_preferences`, so it's individual, not household data.
- **Activity** comes from `household_activity(max)`, a security-definer function scoped to `current_household_id()`. It unions existing records: the pantry log (added, consumed, discarded, expired), grocery items (added and checked, with who), ratings, ordered carts, logged shops, confirmed plans and weekly drafts. Actor names come from display names, with "You" for yourself and "A former member" for people who have left. `summarizeActivity()` groups same-person, same-kind bursts within 10 minutes and writes plain sentences.

### How the Savings dashboard works

The calculations are pure functions in `meal-planner/src/savings.ts` and are unit-tested. They read three household records through `savings_overview(since)`: the pantry log (removals only), logged shops and finished carts.

- **Verified sale savings** come from `cartSavings()`. A line counts only if all of these hold:
  - the cart was sent to a real retailer (not `mock`);
  - the household marked the cart `purchase = 'ordered'`;
  - the line is included;
  - the selected product has `saleCents < regularCents` and `priceStatus = 'verified'`, and isn't sold by weight.

  The saving is (regular − sale) × count. Every other sale line in a sent cart counts as an estimate.
- **Food used** comes from `pantrySummary()`. It sums the household's own `price_paid_cents` for "consumed" removals and reports value, not savings, as spec 02 §7 requires. **Rescued** means consumed between 0 and 3 days before `use_by`. **Wasted** means discarded or expired, shown as "up to" the price paid.
- **Spending** comes from `spendingByWeek()` and `spendingTrend()`: Monday weeks over the last 8, using logged shops only. The trend direction compares the first and second halves of the logged weeks (needs ≥ 4 weeks, with a ±5 % band). `unloggedOrders()` offers ordered carts for one-tap logging; `grocery_spending.cart_draft_id` is unique, so each order is logged once.
- **Basket** reuses live grocery-list pricing and `summarizeBasket()`. Nothing is stored, as with all prices.

### How weekly drafts work

1. **Settings.** `weekly_planning_settings` holds one row per household and is off by default. It records the ISO day, the hour, an IANA time zone (checked against `pg_timezone_names`) and the mode. `enabled_by` is whoever switched it on; the draft uses that person's skill and tastes. Any member can change the settings through `save_weekly_planning()`.
2. **Claim.** `claim_planning_jobs(max)` is service role only. It runs every hour and finds each enabled household whose local drafting time has passed this week. For each, it inserts the `planning_jobs` row for next Monday's week; the unique key on (household, week) means that happens at most once. Jobs hold a 10-minute lease, and failed or interrupted jobs are retried up to 3 times. `weeklySchedule()` in meal-planner mirrors this rule so the apps can show "Next draft: Saturday at 9 AM".
3. **Inputs.** `planning_job_context(job)` is service role only. It returns `{skip}` when the week is confirmed or already has meals. Otherwise it picks a member (`planning_member`: whoever switched drafts on, then the owner, then the longest-standing member). That member must have finished setup and have this household open. It then **acts as that member inside the call** (`planning_act_as`, which is transaction-local and restored before returning), so `get_onboarding_profile()` and `can_read_recipe()` behave as they do in the app. It returns the profile, pantry, favourites, ratings, events, rating summaries, readable recipe ids and the store. The server loads those recipes by id.
4. **Draft.** `draftWeek()` (meal-planner) is pure and unit-tested:
   - Cook the Specials only: real specials via `findSpecials`, counted against the household's hourly limit.
   - `rankRecipes` applies every hard filter and "Not for us".
   - Recipes cooked in the last 10 days get a soft `avoid`.
   - Planning goes through `planWeekWithClaude`. Claude is used only within the household's `AI_DAILY_PLAN_LIMIT`; usage is logged to `ai_usage`, and the call fails closed.
   - `assembleWeeklyDraft` re-checks every pick against the safe candidates, fills gaps with the deterministic planner and adds desserts at the household's frequency. It then writes a ≤300-character notice from facts only: dinners, items it uses up, sale items, open nights, and "Nothing was bought".
5. **Save.** `finish_planning_job(job, plan, details)` locks the week and re-checks it. If the week was confirmed or started in the meantime, the job is marked skipped. Otherwise it checks every recipe with `can_read_recipe` and saves through the existing `save_meal_plan(…, false)` with `confirmedAt` forced to null. Then it adds a `notifications` row for each member with in-app notices on, and returns the members who want phone pushes.
6. **Push.** `sendExpoPushes()` (integrations) sends to the Expo push service. It accepts Expo addresses only, keeps in-app links only and forgets addresses Expo reports as `DeviceNotRegistered`. Phones register themselves with `register_push_token()`, which moves an address to whoever is signed in on that phone; signing out unregisters it.
7. **Apps.**
   - The plan page shows "Drafted for you…" above a job-made, unconfirmed week, and the job's reason when it skipped or failed.
   - Planning settings has the Weekly drafts card, including an honest line when the server job isn't set up.
   - Home shows the newest unread "plan is ready" notice. The web also has a bell.
   - Notices link to `/plan?week=YYYY-MM-DD`.

### How Surprise Me and learned taste work

1. **Taste.** `tasteProfile(recipes, myRatings)` uses only this household's ratings. Each rating gives a signal: ★ − 3, +0.5 for "would cook again" (−1 if not), and a little for family approval. That signal goes to the recipe's cuisine and main proteins, and averages are shrunk (sum ÷ (n+1)). `tasteFit` gives a ±12-point nudge; it never applies to recipes the household has already rated, or to desserts. A reason appears only with ≥2 ratings and a clearly positive average. `rankRecipes` works out the taste profile automatically, like seasons.
2. **History.** `surpriseHistory(events, myRatings)` records the last cooked day (ratings and "cooked" events) and the last day Surprise Me showed each recipe (`recommendation_events` surface `surprise`). Anything cooked or shown in the last 14 days is skipped unless it's a favourite.
3. **Kinds.** `surpriseMe()` uses the ranked list, which has already passed every hard filter. Desserts are excluded, and above-skill recipes are allowed only for "restaurant quality" (+1 level). See the README for what each kind does.
   - "Popular" needs ≥20 real ratings with a ≥4.2 average. Otherwise it says so and offers the household's own hits.
   - "Under $5" needs `costRecipes()` with real prices; "On sale" needs `findStoreSpecials()`. With no store or no prices, the result reports `needs`.
4. **Recipe cost.** `costRecipes()` prices each ingredient, minus long-lasting basics, as its share of the chosen package: amount ÷ package size × shelf/sale price, or pounds × price for items sold by weight. Anything that can't be compared is "unpriced", never guessed. Only verified or recent store prices count. At most 8 recipes per request, counted once against the hourly limit, using the shared search cache. A recipe qualifies for "under $5" only when fully priced, or with one gap and ≤ $4.50.
5. **Explanations.** `explainPick()` builds "You're getting this because …" from the kind, sale items (not basics), up to two owned ingredients (fresh ones first) and the taste reason. Every clause comes from data the person can check.

### How Cook the Specials works

1. **What to ask.** `cookTheSpecialsTerms(candidates)` lists the fresh things the top 40 eligible recipes would make you buy (shelf-stable basics left out), most-needed first, up to 45. Only names leave the device.
2. **Sale prices.** The same `findStoreSpecials()` as the Specials tab, at the household's store: real promo prices below regular, in stock, verified or recent. No store, no price connection, or nothing on sale: the week is planned like Balanced, and the plan says so.
3. **Matching.** `saleMatches(recipe, specials)` checks only ingredients the recipe still needs to buy, using the pricing matcher (every key word; "dill" never matches "dill pickles"). Spices, oils and other long-lasting basics don't count. Everyday basics (onions, garlic, citrus, herbs) count for little (`isMinorSaleItem`).
4. **Planning.** In `planWeek`, cook_the_specials scores +12 per main sale ingredient (max 3) plus a little for the discount, minus 2 per item to buy. Variety, weeknight and sharing rules apply as usual, and notes read "On sale: boneless chicken thighs (33% off)". The summary names the store, says how many items are on sale, and adds "sale prices can change". Swaps reuse the same sale list.
5. **Claude.** In this mode each candidate gets an `onSale` list (ingredient + % off, never prices). Claude is told to build around sale items without picking weak dishes or quoting prices. The server re-validates the specials it's sent with `specialSchema`; they only steer the household's own plan.

### How Smart Cart works

1. **Needs.** `cartNeeds()` takes unchecked list items, merges the same thing (singular/plural, case), adds quantities in the same unit and keeps both amount texts otherwise. It flags typed items that look like something usable in the kitchen; plan lines already had the kitchen subtracted by `buildGroceryList()`.
2. **Matching.** `matchCart()` searches the retailer through a `PricingProvider` (Kroger Products API at the household's store, or `SampleCatalogProvider` for the practice retailer). It ranks with `rankProducts()` (same rules as pricing: key words, form words, in stock, package math, cheapest) and keeps up to 5 options. Line states:
   - *matched*: clean match.
   - *needs_review*: the amount can't be compared to the package.
   - *substitute*: the best match is out of stock, so another product is suggested.
   - *unavailable*: nothing matched.
   Typed items without an amount go in as one package with a note. Review and substitute lines must be approved; choosing a product yourself counts as approval.
3. **Draft.** `cart_drafts` holds one open cart per household. Lines are validated jsonb (`cartLineSchema`); writes go only through functions; `version` blocks edits made from an out-of-date copy. Any edit after approval returns the cart to draft. Members get changes live (Realtime).
4. **Send, once.** `approve_cart_draft` creates a `transfer_key`. `begin_cart_transfer` returns one of:
   - *go*: only when approved.
   - *done*: already sent, with the stored result.
   - *busy*: a send is running.
   - *unknown*: a send was interrupted (stuck for 5 minutes).
   - *invalid*: wrong key.
   `sendCartDraft()` (shared by server and preview) calls the adapter, then `finish_cart_transfer` records the outcome:
   - *sent*: the API confirmed.
   - *not_sent*: nothing reached the retailer — auth, quota or 4xx; can be approved and sent again with the same key.
   - *unknown*: a timeout or 5xx; a person checks the retailer cart, then `resolve_cart_transfer`, and a "nothing there" answer issues a new key.
5. **Adapters.** `RetailerCartAdapter` has `mode` (direct_cart / shopping_link), fulfillment methods and `requiresUserAuth`.
   - `MockCartAdapter` confirms with `confirmedBy: "mock"` and no checkout link.
   - `KrogerCartAdapter` sends one `PUT /v1/cart/add` with 13-digit UPCs, quantities and `PICKUP`/`DELIVERY`. A 2xx counts as accepted; 401/403 means sign in again; 429 means rate-limited; other 4xx are rejected; 5xx or a timeout is unknown.
   - Instacart (`products_link`) and Walmart (affiliate add-to-cart links) would be `shopping_link` adapters once access exists.
6. **Kroger sign-in.** `/api/cart` (phone) and server actions (web) start an authorization-code + PKCE flow. `state` is sealed (AES-256-GCM, `RETAILER_TOKEN_KEY`) with the user id, PKCE verifier and a 10-minute expiry. The callback (`/api/retailers/kroger/callback`) finishes on the web with the cookie session, or hands the code to the app via `kitchenpantry://cart`, which finishes it with its bearer token; either way the state's user must match. Tokens are sealed before they're stored in `retailer_connections` (server-only) and refreshed server-side; Kroger refresh tokens rotate. Redirects use `NEXT_PUBLIC_SITE_URL`, never the request's host. A future improvement is iOS/Android app links instead of the custom scheme.
7. **Who may send.** Members start and finish only practice (mock) sends. For a real retailer, `begin_cart_transfer` and `finish_cart_transfer` accept only the server: service role plus an `acting_user` whose membership is re-checked. Results are shape-checked in SQL (kind, `confirmedBy`, https-only links), so nobody can mark a cart "sent" without the retailer being asked. Lines are shape-checked in SQL too (`cart_lines_valid`), and edits and approvals must name the version they started from.
8. **Tokens.** Clients have no privileges on `retailer_connections`; `retailer_connected()` answers "am I connected?". The server seals tokens with the context `token:<user>:kroger` (GCM associated data), so a copied ciphertext doesn't open in anyone else's row. The access token is fetched only after `begin` says go, so one cart can't trigger two refreshes. A connection is removed only if Kroger rejects the refresh token still stored; an outage just says "try later".
9. **Purchase status.** `cart_drafts.purchase` (`not_ordered`/`ordered`) is set only by a person. It never changes the grocery list; "Tick these off" is a separate, explicit action.

Sources (Oct–Nov 2026): Kroger's portal blocks automated reading, so the Cart API details (PUT /v1/cart/add → 204, add-only, `cart.basic:write`, 30-minute access tokens, rotating refresh tokens) come from published client libraries (kroger-api, ha-kroger) that test against the live API. Verify against your Kroger app before switching it on. Instacart: docs.instacart.com (Developer Platform; applications closed at the time). Walmart: affiliates.walmart.com and walmart.io (affiliate add-to-cart links only).

### How specials work

1. **Terms.** `specialsTerms()` builds up to 45 search terms: unchecked grocery-list items (max 20), in-season produce (when seasonal produce is on), then `STAPLE_SPECIALS_TERMS`. Only names and departments are sent.
2. **Source.** `findStoreSpecials()` runs each term through the store's `PricingProvider` (Kroger Products API at the household's `locationId`, 25 results per term, cached). `toSpecial()` keeps a product only when the store reports a promo price below regular, it isn't out of stock, the price is verified or recent (mock data can never qualify) and any stated end date hasn't passed. Unit prices come from the parsed package size. Promo end dates and product links are read from optional Kroger fields when present; membership and coupon requirements are `null` ("not stated") because the source doesn't say. Products are de-duplicated, and the household's own terms win.
3. **View.** `viewSpecials()` (pure) screens names with `screenProduct()` (everyone's allergies, your diet style, your "never recommend" list), filters by department, discount and search, and sorts by relevance (on list → in season → % off), discount, or unit price within each unit.
4. **Providers.** `PromotionProvider` is the seam for weekly-ad, coupon or partner feeds; `StorePriceSpecialsProvider` wraps any `PricingProvider`. A new source is added only after its terms allow this use.

### How seasons work

1. **Where and when.** `regionFor(country, postal, override)` maps US ZIP prefixes to a state and a climate band (warm / temperate / cold), Australian postcodes to warm or temperate, Canada to cold, the UK to temperate; the household override wins. `seasonOn(date, region)` uses climate-specific start dates and flips the months south of the equator. Nothing is stored, so the season changes with the calendar.
2. **Produce.** USDA SNAP-Ed seasonal lists (public domain). "Signature" produce = listed in at most two seasons, so year-round staples (onions, carrots) don't count. `matchProduce` matches ingredient lines by whole words, preferring the head noun ("cherry tomatoes" is tomatoes, not cherries).
3. **Ranking.** `rankRecipes` works out the `SeasonalContext` from the profile unless one is passed. Boost: 5 points per in-season produce item (max 3), +6 for a matching season tag, +12 for a recipe tagged for an opted-in holiday in the next 14 days. It never filters and never outranks safety rules; switching seasons off removes the boost only. Meals and desserts are toggled separately.
4. **Holidays.** `holidayDate` computes fixed and rule-based dates (Easter, Thanksgiving US/CA, Mother's/Father's Day by country); lunar and lunisolar dates for 2026–2030 come from a checked table (`MOVING_DATES`, sources in the file). Eids are flagged approximate and span the published dates. Past 2030 those holidays return nothing rather than a guess — extend the table.
5. **Deals.** Only on request and only when opted in: the in-season produce names go to the same server pricing endpoint as the grocery list, and `onSale()` keeps lines with a real promo price below regular, in stock, verified or recent.

### How desserts work

1. **Separate slots.** Plans hold dinners and desserts with a `mealType`; at most one of each per day. `rankRecipes` returns dinners by default (`course: "main"`), so desserts can never fill a dinner slot, and the AI planner never sees them.
2. **How many.** `dessertDays(week, frequency, today, dinnerDays)` gives at most two days a week (weekly → Saturday or the nearest night with a dinner; twice → mid-week + weekend; weekends → Sat/Sun; never/occasions → none).
3. **Which.** `planDesserts` ranks eligible desserts with the person's dessert skill and the household's categories, adds a bonus for fresh ingredients shared with the week's dinners, prefers variety and quick ones on weeknights, and writes timing notes from chill/freeze minutes.
4. **Edits.** "Add dessert" stores the dessert as hand-picked (`locked`), so rebuilding the week keeps it; automatic ones are replaced. Grocery lists merge dessert and dinner ingredients.

### How store prices work

1. **Source.** `KrogerClient` (server only, OAuth2 client credentials, token cached ~30 min) finds stores by ZIP and searches products at one `locationId`. Every response is validated with zod; unreadable rows are dropped. Package sizes are parsed from Kroger's size text ("14.5 oz", "1/2 gal", "12 ct"); items sold by weight are priced per pound.
2. **Matching** (`chooseProduct`, deterministic): every key word of the list item must appear in the product name (plurals and descriptors like "baby", "diced" handled); products that are a different form ("lemon juice" for "lemon", "dill pickles" for "dill") are rejected; in-stock first; then the cheapest way to buy the amount needed using real package sizes.
3. **Lines and totals** (`priceBasket`): packages × shelf price (sale price only when below regular), status from `classifyPrice` (*Verified* ≤ 6 h, *Recent* ≤ 7 days), "No price" when nothing matches. Totals report priced/missing/assumed counts; budget comparison only when complete. Credential or quota failures stop the run and say so.
4. **Trust boundary.** Browsers and phones send item names and amounts only (`pricingRequestSchema`); prices come back from the server and are validated again (`basketPriceSchema`). Search results are cached in memory (`PRICING_CACHE_MINUTES`) and each person is limited per hour (`PRICING_HOURLY_LIMIT`) to protect the shared daily quota. The household's store is shared; prices are never written to the database.

### How shared households work

1. **Joining.** The owner creates an invite: 256 random bits shown once (only a SHA-256 hash is stored), optional email lock, expires in 1–14 days (default 7), single use, at most 20 a day, and seats are capped at 6 people including open invites. Opening a link requires signing in first; `accept_household_invite()` checks every rule in the database. Email invites open the inviter's own mail app (no server email yet).
2. **Roles.** Owners invite, cancel invites, remove members and transfer ownership; an owner must transfer before leaving. Membership changes only through these functions — the direct insert/update/delete policies on `household_members` were removed.
3. **Shared vs personal.** Kitchen, meal plans, grocery list and household settings (size, budget, diet style, equipment, store) are shared. Skill, goals, cuisines/proteins **and allergies/diet choices** are personal: each person's rows are private, and the database rebuilds the household's combined list whenever someone saves, joins, leaves or is removed. Planning uses the person's own taste plus everyone's restrictions (`householdProfile()`), so editing your own profile can never remove someone else's allergy.
4. **Live list.** Members add, edit, check and remove items; who added and who checked is set by a trigger from the session, never by the client. Supabase Realtime (which applies RLS) pushes changes; both apps apply them with one pure reducer that ignores echoes and out-of-order events, and reload when the connection comes back or the app returns to the foreground.
5. **From the plan.** `buildGroceryList()` merges the week's recipes, scales servings, subtracts the kitchen and drops optional garnishes. "Add to list" replaces earlier plan lines but keeps typed items and anything already in the cart.

## 9. Schema review for desserts and seasonal cooking

Reviewed against the current schema before writing each migration (columns and functions only, nothing deleted).

**Desserts (spec 05) — built.** Decision taken: frequency and categories are per household (desserts are eaten together); dessert skill is per person (null = same as cooking skill). See *How desserts work* in §8. The onboarding save wraps the previous function (`save_onboarding_profile_base`) instead of copying it.

**Seasonal cooking (spec 06) — built.** Decisions taken: the season is computed, never stored; personal settings live in one validated `user_preferences.seasonal` jsonb (enabled, produce/meals/desserts/holidays on, deals off, holiday opt-ins empty); the climate override is per household (`households.seasonal_region`, null = automatic). Recipes use their existing `tags` for seasons and holidays instead of new columns. The produce source is USDA SNAP-Ed (US-national); a regional harvest calendar remains a possible upgrade. See *How seasons work* in §8.

### How weekly planning works

1. **Candidates** are the household's ranked recipes after every hard filter (allergies, diet, equipment, skill, "Not for us") — the same list the Recipes page shows.
2. **Built-in planner** (`planWeek`, deterministic, runs on web, phone and server): mode weights (Budget First = fewer items to buy and shared purchases; Use What I Have = kitchen coverage and use-by dates; Chef's Choice = best-rated, more ambitious dishes; Balanced), shared *perishable* purchases across the week (shelf-stable staples don't count), protein/cuisine variety on neighbouring nights, quick weeknights and bigger weekend projects, and only nights that haven't passed. Swaps, locks, moves, servings and "Suggest a dinner" all use it — instant and free.
3. **Claude** (optional, server-only): sees at most 30 candidates as compact facts, the open nights, kept meals and the mode. Structured outputs constrain recipe ids and dates to what we offered; the answer is validated again (ids, dates, duplicates, no price claims), gaps are filled by the built-in planner, and any failure falls back to it with a plain notice. Per-household daily limit (`ai_usage`), short in-process cache, token usage logged. The phone reaches it through `POST /api/meal-plan` with its Supabase token.
4. **Saving:** `save_meal_plan()` replaces a week atomically; a confirmed week is never overwritten unless the person agreed (rebuild dialog). Locked meals and the household's own meals survive every rebuild.
5. **Cost** is shown as "not available yet" until real store prices exist — never estimated from nothing.

### How recipe recommendations work today

1. **Hard filters first** (`checkEligibility`): allergens (with aliases and cross-contact warnings), diet style, never-recommend terms, skill level (unless the user opts into harder recipes), and equipment with viable substitutions (air fryer → oven). Anything filtered out is listed under "hidden" with a plain reason — never silently dropped.
2. **Deterministic score** (`rankRecipe`): pantry coverage, ingredients that need using up soon, favourites, the household's own ratings and real community rating summaries, cooking goals and cuisine preferences. Each recipe carries the plain-English reasons shown on the card.
3. **Ratings are only ever real.** Summaries come from `recipe_rating_summaries()` (aggregated across households without exposing anyone's rows). A recipe with no ratings shows "Editorial".
4. **History:** "Not for us" hides a recipe until the household undoes it (latest dismiss/undo event wins, and the hidden list offers "Show again"). Anything cooked in the last week sinks and says "You made this N days ago". Opens, cooks and dismissals are logged append-only in `recommendation_events` for Surprise Me and proactive planning later.
5. **Photos** are credited, free-licence photos of a similar dish, labelled "Similar dish"; a failed load falls back to the typographic tile.
6. Later, Claude may re-rank the *eligible* list; it can never re-introduce a filtered or dismissed recipe.
