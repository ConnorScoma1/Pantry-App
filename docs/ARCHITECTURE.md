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

28 tables in `supabase/migrations` (4 migrations), grouped as:

- **People:** `profiles`, `households`, `household_members`, `user_preferences`
- **Constraints:** `household_allergies` (→ `allergens`), `dietary_restrictions`, `household_equipment` (→ `equipment`)
- **Inventory:** `ingredients`, `pantry_items`, `pantry_transactions` (barcode/receipt fields ready). Every add, amount change and removal is logged to `pantry_transactions` by trigger; `pantry_remove_item(id, reason)` records *used up / thrown out / went off*; `search_ingredients(q)` does name, alias and typo-tolerant search.
- **Recipes:** `recipe_sources`, `recipes`, `recipe_ingredients`, `recipe_instructions`, `recipe_ratings`, `user_favorites`
- **Planning:** `meal_plans`, `planned_meals`, `cooking_history`
- **Shopping:** `grocery_lists`, `grocery_list_items`
- **Pricing:** `retailers`, `store_locations`, `retailer_products`, `product_price_observations`, `ingredient_product_mappings`

Security: helper functions `is_household_member` / `is_household_owner` (security definer, fixed `search_path`); every household-scoped table is limited to members; reference data is read-only to users; recipes are public only from approved sources. The SQL smoke test in `supabase/tests` checks that a second user cannot read, join, write into or redirect to another household, and cannot fabricate price data.

## 5. Roadmap

Product specs live in [`docs/specs`](specs): the original platform spec (01), **AI intelligence & local specials** (02) and **One Store vs. Best Deals** (03). The order below merges the priority list from spec 02 with the original phases. Each step ships with real persistence and tests, and labels mock data as mock.

| # | Milestone | Specs | Status |
| --- | --- | --- | --- |
| 1 | **Foundation** — monorepo, tokens, schema + RLS, auth, onboarding, web + mobile shells | 01 | **Done** |
| 2 | **My Kitchen inventory** — items, staples checklist, use-by urgency, transaction log, category guessing; mobile sign-in + onboarding | 01 §5–6, 02 §9.1 | **Done (web + mobile)** · barcode/receipt import later |
| 3 | **Recipes & ratings** — approved-source catalogue, recipe detail, skill/equipment/allergy filtering, ratings, favourites, recommendation history | 01 §7, 02 §4 | **Done (web + mobile)** · recommendation history next |
| 4 | **AI weekly meal planning** — Claude-ranked plans from deterministic candidates; planning modes *Budget First / Balanced / Chef's Choice / Use What I Have* | 01 §8, 02 §3 | — |
| 5 | **Consolidated grocery lists** — merge, convert units, subtract pantry, package math, mock pricing | 01 §9 | Engines built |
| 6 | **Local pricing integration** — store preferences (several stores, radius, multi-store OK, loyalty cards), first verified provider, "Price unavailable" when none | 01 §10, 02 §1 | Needs provider decision |
| 7 | **Specials tab** — promotions from permitted feeds/partners with filters, source links, expiry, regular vs sale, unit price | 02 §2 | Needs §6 |
| 8 | **Cook the Specials** — fifth planning mode built on verified promotions | 02 §3 | Needs §7 |
| 9 | **One Store vs. Best Deals** — basket pricing per store, multi-store optimiser, fuel/time cost, route, AI explanation | 03 | Needs §6 + routing provider |
| 10 | **Personalised recommendations & Surprise Me** — learns from ratings/history, avoids repeats, explains each pick | 02 §4–5 | Needs §3 |
| 11 | **Proactive weekly planning** — opt-in background drafts + notifications; never buys, never overwrites a confirmed plan | 02 §6 | Needs §4, §7 |
| 12 | **Smart Savings dashboard** — budget vs basket, verified savings vs estimates, waste avoided, trends | 02 §7 | Needs §5–7 |
| 13 | Cooking mode, Chef mode, household sharing, production readiness | 01 §11–14, §18 | — |

## 6. Design notes for the new features (specs 02 & 03)

These keep the existing architecture — new providers and engines plug into the packages that already exist.

**Promotions (Specials, Cook the Specials).** `@kitchen-pantry/grocery-pricing` gains a `PromotionProvider` interface beside `PricingProvider`. Every promotion records: retailer, store, product match, regular and sale price (only when the source shows both), promo type (sale, BOGO, digital coupon, loyalty price, multi-buy), whether a coupon/membership is required, valid-from/valid-to, source URL and retrieval time. Providers are registered in `@kitchen-pantry/integrations` only after access terms are confirmed — public visibility is not permission to scrape. A labelled mock provider comes first.

**Promotion eligibility.** A deterministic `isEligible(promo, household)` checks loyalty memberships, digital-coupon opt-in, store selection and dates. Savings count as *verified* only when the regular price, sale price and eligibility are all known; anything else is an estimate.

**Shopping optimiser (spec 03).** A new `@kitchen-pantry/shopping-optimizer` package, all deterministic and unit-tested:
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

**Proactive planning.** A scheduled job (Supabase Cron + Edge Function) runs per opted-in household when new promotions arrive: retrieve specials → check pantry and use-by dates → candidates → basket optimisation → save a **draft** plan → notify. It never purchases anything and never replaces a plan the user has confirmed (`meal_plans.status = 'active'`).

**Savings dashboard.** Pantry usage is reported as "value of food used", not cash savings, unless compared against a defined alternative basket. Verified and estimated savings are shown separately.

**Navigation.** A Specials destination makes six top-level areas. On desktop it's a sidebar item. On phones, five tabs is the comfortable maximum — proposal: put Specials as a tab and move Profile behind an avatar button in the header. (Decision for milestone 7.)

### Planned schema additions (added in the milestone that needs them)

| Milestone | Tables / columns |
| --- | --- |
| 3 | ✅ `recipes.tags`, `recipes.tips`, `recipe_ingredients.item`, `recipe_ratings.household_id` default, `recipe_rating_summaries()` · still to add: `recommendation_events`; `recipes.quality_score` cache |
| 4 | `meal_plans.planning_mode` (`budget_first`, `balanced`, `chefs_choice`, `use_what_i_have`, `cook_the_specials`), `meal_plans.confirmed_at` |
| 6 | `household_store_preferences` (store, preferred/excluded, rank), `household_loyalty_memberships`, `households.max_travel_km`, `households.multi_store_ok`; `product_price_observations.source_url`, `requires_membership`, `requires_coupon` |
| 7 | `promotions` (store, product, type, regular/sale price, requirements, valid dates, source URL, provider, retrieved_at) |
| 9 | `household_shopping_preferences` (start location, max stops, max extra minutes, value of time, fuel price source, vehicle efficiency), `shopping_trip_plans` + `shopping_trip_stops` |
| 11 | `notification_preferences`, `planning_jobs` (status, inputs hash, result plan) |

## 7. Open decisions (added by specs 02 & 03)

1. **Promotion/price sources** — which retailers or data partners allow commercial use of their weekly ads and prices (e.g. retailer partner APIs, Instacart Developer Platform, Flipp-style circular partners). Same blocker as pricing.
2. **Recipe source** — original Test Kitchen catalogue for now; licensing a bigger catalogue is still open (see §3.2).
3. **Routing provider** for store distances/routes — cost and terms (Mapbox, Google Routes, self-hosted OSRM).
4. **Fuel price** — user-entered default vs a licensed regional fuel-price feed.
5. **Notifications** — email first (Supabase Auth email) vs push (Expo notifications) for "your plan is ready".
6. **Six-destination navigation on phones** (see §6).

## 8. Next step

**Close out milestone 3:** add `recommendation_events` (shown / opened / cooked / dismissed) so repeat-avoidance in milestone 10 has history to work from, plus a "Not for us" dismiss on recipe cards. Then **milestone 4 — AI weekly meal planning**, which needs `ANTHROPIC_API_KEY` on the server (mobile will call it through an authenticated Next.js route handler, never directly).

### How recipe recommendations work today

1. **Hard filters first** (`checkEligibility`): allergens (with aliases and cross-contact warnings), diet style, never-recommend terms, skill level (unless the user opts into harder recipes), and equipment with viable substitutions (air fryer → oven). Anything filtered out is listed under "hidden" with a plain reason — never silently dropped.
2. **Deterministic score** (`rankRecipe`): pantry coverage, ingredients that need using up soon, favourites, the household's own ratings and real community rating summaries, cooking goals and cuisine preferences. Each recipe carries the plain-English reasons shown on the card.
3. **Ratings are only ever real.** Summaries come from `recipe_rating_summaries()` (aggregated across households without exposing anyone's rows). A recipe with no ratings shows "Editorial".
4. Later, Claude may re-rank the *eligible* list; it can never re-introduce a filtered recipe.
