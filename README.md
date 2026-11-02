# Kitchen Pantry

An AI-powered kitchen assistant: weekly meal plans people actually want to cook, a grocery list that knows what's already in the kitchen, honest prices, and less food waste.

This repository is a **Turborepo monorepo** containing the web app (Next.js), the mobile app (Expo / React Native), shared packages and the Supabase database.

> **Status:** Onboarding, **My Kitchen**, **Recipes**, **Meal Plan** (with optional AI planning), a **shared household with a live grocery list**, **live Kroger store prices**, **optional dessert planning**, **seasonal cooking**, a **Specials tab**, **Cook the Specials**, **Smart Cart checkout**, **Surprise Me**, **weekly drafts**, the **Savings dashboard**, **who's eating / household activity** **cooking mode with Chef mode and a cooking assistant**, the **recipe library with menus**, **One Store vs. Best Deals**, **barcode and receipt import**, **use-soon reminders**, **Use it before you lose it**, **cooking history** and **saved grocery lists** work on web and mobile, and AI can run on Gemini, Claude, OpenAI or Groq (see **AI setup**). Sixteen database migrations are waiting for your review — `…0800_shared_household`, `…0900_store_prices`, `…1000_desserts`, `…1100_seasonal`, `…1200_smart_cart`, `…1300_surprise_me`, `…1400_weekly_planning`, `…1500_smart_savings`, `…1600_household_life`, `…1700_cooking_mode`, `…1800_recipe_library`, `…1900_shopping_optimizer`, `…2000_kitchen_import`, `…2100_use_soon_reminders`, `…2200_saved_grocery_lists` and `…2300_ai_costs` (see the sections below). See **Going to production** for CI, monitoring and app builds. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the roadmap and [docs/specs](docs/specs) for the product specs.

---

## Quick start (no database needed)

You need **Node.js 22 LTS** (or newer) — download from <https://nodejs.org>. Check with `node -v`.

Open a terminal **in this folder** (in File Explorer: click the address bar, type `powershell`, press Enter), then:

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. With no Supabase keys set, the web app runs in **preview mode**: no sign-in, and your questionnaire answers are saved in that browser only. It's the fastest way to see and click through the app.

## Connect the real database (Supabase)

Preview mode is for looking around. Accounts, households and saved data need Supabase.

**Option A — local Supabase (free, runs on your PC; needs [Docker Desktop](https://www.docker.com/products/docker-desktop/))**

```powershell
npx supabase start        # first run downloads images; prints an API URL and an anon key
npx supabase db reset     # applies supabase/migrations + seed.sql + seed_recipes.sql
```

**Option B — hosted Supabase project** (create one at <https://supabase.com>)

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push      # applies the migrations
```

Then run the seeds once from the dashboard's SQL editor: `supabase/seed.sql`, then `supabase/seed_recipes.sql` (the recipe catalogue).

**Then point the web app at it:** copy `apps/web/.env.example` to `apps/web/.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...      # API URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # anon / publishable key
```

Restart `npm run dev`. You'll now get a sign-in page; create an account and go through onboarding. Local Supabase shows confirmation/magic-link emails at <http://127.0.0.1:54324>.

## Mobile app (iOS & Android)

```powershell
npm install
npm run dev:mobile
```

Scan the QR code with the **Expo Go** app on your phone (same Wi-Fi as your PC). The phone app has sign-in, the full questionnaire, **My Kitchen** (staples, add/edit, use-by urgency), **Recipes** (favourites, servings scaling, "I cooked this" ratings, "Not for us"), the **Meal Plan** (build, swap, lock, move, confirm) and the same Home and Profile screens as the website. To plan with Claude on the phone, set `EXPO_PUBLIC_API_URL` to your web server (see below); otherwise the built-in planner runs on the phone.

- **No Supabase keys → preview mode**: no sign-in, everything is saved on that phone only.
- **With Supabase**: copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the same project URL and anon key as the web app. Phones can't reach `127.0.0.1` on your PC — for local Supabase use your PC's network address, e.g. `http://192.168.1.20:54321` (find it with `ipconfig`). Same account works on web and phone.
- If Expo reports version mismatches, run `npx expo install --fix` inside `apps/mobile`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Web app at <http://localhost:3000> |
| `npm run dev:mobile` | Expo dev server for iOS/Android |
| `npm test` | Unit tests for every shared package |
| `npm run typecheck` | TypeScript across the whole repo |
| `npm run build` | Production build |
| `npm run tokens` | Regenerate CSS after editing `packages/ui-tokens/src/tokens.ts` |
| `npm run db:reset` | Rebuild the local database from migrations + seed |
| `npm run db:types` | Generate TypeScript types from the local database |
| `npm run seed --workspace=@kitchen-pantry/recipe-engine` | Regenerate `supabase/seed_recipes.sql` after editing recipes in `packages/recipe-engine/src/catalog` |
| `npm run recipes:import -- --file feed.json` | Validate a licensed recipe feed and write a report (dry run). Add `--sql out.sql` for a SQL file to review, or `--apply` to send it to Supabase. See [docs/RECIPE_LIBRARY.md](docs/RECIPE_LIBRARY.md) |
| `npm run recipes:draft -- --count 100` | Draft full recipes for dish ideas offline with the Claude Batch API (then import and review them) |

Database checks (with local Supabase running):

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/pantry_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/recipes_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/recommendations_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/meal_plans_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/household_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/store_prices_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/desserts_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/seasonal_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/smart_cart_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/surprise_smoke_test.sql
```

Every result line should end in `t`.

## Environment variables

| Variable | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | No | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | No (RLS protects data) | Supabase anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | `apps/web/.env.local` | No | Base URL for auth email links |
| `AI_PROVIDER` / `AI_MODEL` | `apps/web/.env.local` | No | Which AI answers: `gemini`, `anthropic`, `openai` or `groq` (default: whichever key is set), and its model |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` | `apps/web/.env.local` | **Yes — server only** | The chosen provider's key. All empty = built-in features only |
| `ANTHROPIC_MODEL` | `apps/web/.env.local` | No | Claude model id (older setting; `AI_MODEL` wins) |
| `AI_MONTHLY_BUDGET_USD` / `AI_MONTHLY_REQUESTS_PER_PERSON` | `apps/web/.env.local` | No | App-wide monthly AI spending cap, and AI requests per person per month (needs migration `…2300`) |
| `AI_PRICE_INPUT_PER_M` / `AI_PRICE_OUTPUT_PER_M` | `apps/web/.env.local` | No | The model's price per million tokens, for cost logging and the budget (built in for `gemini-3.1-flash-lite`) |
| `AI_MAX_OUTPUT_TOKENS` | `apps/web/.env.local` | No | Per-request AI output cap |
| `AI_DAILY_PLAN_LIMIT` | `apps/web/.env.local` | No | AI meal plans per household per 24 h (default 10; 0 turns AI planning off) |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | `apps/web/.env.local` | **Yes — server only** | Live Kroger-family store prices. Empty = no prices shown |
| `PRICING_CACHE_MINUTES` | `apps/web/.env.local` | No | How long a product search is reused (default 30, max 360) |
| `PRICING_HOURLY_LIMIT` | `apps/web/.env.local` | No | Price checks per person per hour (default 30) |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/web/.env.local` | **Yes — server only** | Smart Cart real-retailer sends and weekly drafts only (the database limits what it may do) |
| `AI_DAILY_DRAFT_LIMIT` | `apps/web/.env.local` | No | AI recipe versions and full-recipe drafts per household per 24 h (default 5; 0 = off) |
| `AI_DAILY_HELP_LIMIT` | `apps/web/.env.local` | No | Cooking-assistant questions per household per 24 h (default 30; 0 = built-in help only) |
| `AI_DAILY_ADVICE_LIMIT` | `apps/web/.env.local` | No | AI shopping-advisor explanations per household per 24 h (default 10; 0 = the app's own wording only) |
| `OPEN_FOOD_FACTS_USER_AGENT` | `apps/web/.env.local` | No | How the server identifies itself to Open Food Facts for barcode lookups: `KitchenPantry/0.1 (you@your-domain.example)` |
| `AI_DAILY_RECEIPT_LIMIT` | `apps/web/.env.local` | No | Receipt photos read per household per 24 h (default 5; 0 = off) |
| `MAPBOX_ACCESS_TOKEN` | `apps/web/.env.local` | **Yes — server only** | Drive times for One Store vs. Best Deals. Empty = grocery totals only; fuel and travel time are never estimated |
| `SHOPPING_ADVICE_SECRET` | `apps/web/.env.local` | **Yes — server only** | Signs the comparison the AI advisor explains. Long random string; needed with more than one server instance |
| `AI_IN_PREVIEW` | `apps/web/.env.local` | No | `on` allows AI in preview mode (no Supabase) on a production server. Not needed for `npm run dev`; leave unset when deployed |
| `RESEND_API_KEY` / `INVITE_EMAIL_FROM` | `apps/web/.env.local` | Key **yes** | Optional: email household invites from the server |
| `WEEKLY_DRAFTS` / `CRON_SECRET` | `apps/web/.env.local` | `CRON_SECRET` **yes** | Weekly drafts job switch (`on`) and the scheduler's bearer secret (32+ characters) |
| `WEEKLY_DRAFTS_PER_RUN` / `EXPO_ACCESS_TOKEN` | `apps/web/.env.local` | Token **yes** | Households per job call (default 10); Expo push token only with enhanced push security |
| `USE_SOON_REMINDERS` / `USE_SOON_PER_RUN` | `apps/web/.env.local` | No | Use-soon reminders job switch (`on`; also needs `CRON_SECRET` and the service role key) and people reminded per call (default 500) |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | `apps/mobile/.env` | No (RLS protects data) | Mobile Supabase; empty = preview mode |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` | No | Your web server (e.g. `http://192.168.1.20:3000`) so the phone can plan with Claude and share invite links that open in a browser; needs Supabase sign-in |

Never put the Supabase **service role** key or the Anthropic key in a `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variable — those are bundled into the browser/app. `.env*` files are git-ignored.

## Project structure

```text
apps/
  web/                 Next.js 16 (App Router) + Tailwind CSS 4 — desktop & mobile web
  mobile/              Expo SDK 58 + Expo Router + NativeWind — iOS & Android (talks to Supabase directly, under RLS)
packages/
  ui-tokens/           Design tokens (colour, type, radius, motion) → CSS for both apps
  shared-types/        Domain types + option catalogues (allergens, equipment, skill levels…)
  validation/          Zod schemas shared by client, server and onboarding
  database/            Shared data access for web + mobile: kitchen, profile & recipe stores (Supabase or on-device)
  recipe-engine/       Test Kitchen recipe catalogue, allergen screening, eligibility, pantry match + ranking, scaling, recipe tile art
  inventory-engine/    Units, inventory subtraction, use-by urgency, staples, kitchen summaries
  grocery-pricing/     Pricing provider interface, package math, labelled mock provider
  meal-planner/        Weekly planner (modes, ingredient reuse, variety), plan edits, budget verdicts
  ai/                  Server-only Claude client (structured outputs), AI meal planning with validation + fallback
  integrations/        Registry of verified store/pricing integrations (empty by design)
supabase/
  migrations/          Schema, row-level security, onboarding functions
  seed.sql             Reference data only — no fake prices, stores or ratings
  seed_recipes.sql     Generated from the recipe catalogue (don't edit by hand)
  tests/               SQL smoke tests (RLS, pantry, recipes, recommendation history, meal plans)
docs/ARCHITECTURE.md   Decisions, risks, roadmap
docs/specs/            Product specs (platform, AI & specials, one store vs best deals)
```

## AI setup (optional)

The app works without any AI. A built-in planner picks dinners from recipes that already passed your allergy, diet, restriction, equipment, skill and "Not for us" rules, shares perishable ingredients across the week, and keeps weeknights quick. To add AI (week planning, recipe adaptations, new dinners from leftovers, cooking help), pick a provider. Costs and the full design are in [docs/AI_COSTS.md](docs/AI_COSTS.md).

1. Create a key with one provider:
   - **Gemini** (the low-cost default, `gemini-3.1-flash-lite`): Google AI Studio (key starts `AIza`) or Vertex AI express mode (key starts `AQ.`).
   - **Claude**: <https://platform.claude.com>.
   - **OpenAI** or **Groq**: these also need `AI_MODEL`.
2. Put it in `apps/web/.env.local`, never with a `NEXT_PUBLIC_` prefix. For Gemini:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=...
   AI_MONTHLY_BUDGET_USD=5
   AI_MONTHLY_REQUESTS_PER_PERSON=60
   ```
3. Restart `npm run dev`. The Plan page now says "Plans with AI".
4. Try it: run `npm run ai:poc` for a 7-day plan with tokens and cost, `npm run ai:eval` for the quality test against the built-in planner, and `npm run ai:costs` for estimates at 1k, 10k and 100k users.

How it stays safe and cheap:

- Claude only ever sees recipes that already passed your household's hard filters, and the response format only allows those recipe ids and your open nights. Its answer is validated again on the server and on your device; anything off is dropped and the gap is filled by the built-in planner.
- No prices are invented: Claude is told none exist, and any price talk in its notes is removed.
- Each household gets `AI_DAILY_PLAN_LIMIT` AI plans per 24 hours (default 10). Identical requests are answered from a short cache. Swaps, locks and edits never call Claude.
- If Claude is busy, unreachable or returns something unusable, you get the built-in plan with a short note saying so.

## Shared households

Up to six people (an owner plus five) share one kitchen inventory, meal plans and a grocery list that updates live on every phone and browser.

- **Invite:** Profile → Household → *Create invite link*. Add their email to lock the link to that account (optional). Send it with *Copy*, *Email it* (opens your own mail app — the app doesn't send email itself) or *Share*. Links work once, need the person to sign in first, and expire after 7 days. On the phone, people can also paste a link or code under *Join a household*.
- **Roles:** the owner invites, cancels invites, removes people and can hand ownership to someone else (then leave). Members can leave any time.
- **What stays personal:** cooking skill, goals, favourite cuisines/proteins, and **your own allergies and diet choices**. Meal plans avoid everyone's allergies; other members see the combined list, not who has which.
- **Grocery list:** add, edit, check and remove items; each shows who added it and who got it. *Add to list* on the Grocery page brings in the week's recipes with what's already in your kitchen taken off; doing it again replaces the plan items but keeps what you typed and what's already in the cart. Prices stay off until a verified store source is connected.
- **Live updates** use Supabase Realtime, which local Supabase includes. On a hosted project, check **Database → Publications → supabase_realtime** lists `grocery_list_items` after the migration (the migration adds it).

**Review before applying.** `supabase/migrations/20261101000800_shared_household.sql` is new. It adds tables and columns only, copies each household's existing allergy and diet choices to every current member before switching them to personal, and replaces the old "owners can edit membership directly" policies with checked functions. Nothing has been applied to any database. When you're happy with it: local → `npx supabase db reset`; hosted → `npx supabase db push`; then run `supabase/tests/household_smoke_test.sql` (45 checks). The web and phone apps need it before sharing works in Supabase mode; preview mode doesn't use it.

## Store prices (Kroger)

The grocery list can show live shelf and sale prices from **Kroger-family stores** (Kroger, Ralphs, Fred Meyer, King Soopers, Harris Teeter, Fry's, Smith's, QFC, Dillons, Pick 'n Save, Metro Market, Mariano's and others) through Kroger's free public developer API. Other retailers don't offer a permitted price API yet, so they show no prices rather than guesses.

**Set it up (about 10 minutes):**

1. Create a free account at <https://developer.kroger.com>, then **Create an app** in the *Production* environment with the **Products** and **Locations** APIs. Read and accept Kroger's API terms — they govern how prices may be shown and stored.
2. Copy the app's **client ID** and **client secret** into `apps/web/.env.local` as `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` (never with a `NEXT_PUBLIC_` prefix).
3. Restart `npm run dev`. On the Grocery page, enter your ZIP under **Store prices**, pick your store, and prices appear. The store is shared with your household.
4. On the phone, prices come through your web server: set `EXPO_PUBLIC_API_URL` (see *Mobile app*) and sign in.

**How prices stay honest:**

- Prices come only from Kroger, for the store you picked, and are labelled *Verified* (checked in the last 6 hours) or *Recent* (up to 7 days). If Kroger has no price or no matching product, the item says **No price** and isn't counted.
- The total says how many items it covers ("19 of 21 items") and never presents a partial basket as the whole thing. Your weekly budget is compared only when every item has a price.
- Each line shows which product was matched and its package size. When a recipe amount can't be compared with the package (cups of spinach vs a 5 oz bag), it's priced as one package and says "check it's enough".
- Sale prices are used only when Kroger reports them below the regular price. Tax isn't included.
- Nothing is bought automatically. Prices aren't stored in the database — they're fetched when you check, reused for up to `PRICING_CACHE_MINUTES`, and each person can check up to `PRICING_HOURLY_LIMIT` times an hour so the app's shared Kroger quota (10,000 product searches a day) lasts.

**Review before applying:** `supabase/migrations/20261101000900_store_prices.sql` adds the household's chosen store (five columns on `households`, nothing deleted). Apply it after the shared-household migration, then run `supabase/tests/store_prices_smoke_test.sql` (6 checks). Preview mode keeps the store choice in your browser and still shows prices when the server has Kroger keys.

## Desserts (optional)

Desserts are planned alongside dinner — never instead of it, and never every day.

- **How often:** asked once during setup (on the cooking-skill step), default **once a week**. Options: never automatically, once a week, twice a week, weekends only, special occasions only. Change it any time under **Profile → Desserts**. Frequency and favourite kinds (cookies & bars, cakes, pastries & pies, frozen, plated, fruit) are shared by the household; **dessert skill** (Beginner → Professional pastry) is personal and can differ from your cooking skill.
- **Planning:** building the week adds desserts on nights that have a dinner, preferring ones that share fresh ingredients with the week's dinners (one carton of cream, not two) and keeping weeknight desserts quick. Chill and freeze times become notes like "Make it the day before — it needs 4 hours to chill".
- **Add dessert** on the Meal Plan lets anyone pick one for any day; hand-picked desserts stay when the week is rebuilt. Allergies, diet and equipment rules apply to desserts too.
- **Shopping:** the Grocery List's *Add to list* includes desserts, merged with dinner ingredients, and store prices cover them.
- **Recipes:** switch the Recipes page to *Desserts* to browse and favourite them. The catalogue has nine original desserts, from apple crisp (beginner) to raspberry mousse entremets (professional pastry).

**Review before applying:** `supabase/migrations/20261101001000_desserts.sql` adds columns and functions only (recipe course/category/chill time, household dessert settings, personal dessert skill, dessert meals in plans). Apply it after the other two, re-run `supabase/seed_recipes.sql`, then `supabase/tests/desserts_smoke_test.sql` (11 checks).

## Smart Cart (Build my cart)

**Build my cart** (Meal Plan, Grocery List, or `/cart`) turns the shared grocery list into products at a store. The household reviews the cart, and it goes into the store's online cart. You then pick a pickup or delivery time and pay on the store's own site. We never see or store payment details.

1. **List** — starts from the shared grocery list. "From your meal plan" adds the week first. Duplicates are merged. Plan items already had your kitchen taken off; typed items that look like something in your kitchen are flagged, not removed.
2. **Store** — choose a retailer, and pickup or delivery:
   - **Kroger family** (Kroger, Ralphs, Fred Meyer, King Soopers, Pick 'n Save…): real products and prices from your chosen store. It stays **off** until you switch it on (below).
   - **Sample Market**: a practice retailer with made-up products and prices, clearly labelled. Nothing is sent anywhere.
   - **Walmart** and **Instacart** show as unavailable, with the reason. Walmart has no public cart API (only affiliate add-to-cart links). Instacart's developer platform isn't taking applications, and its links open Instacart's own page rather than filling a cart.
3. **Review** — each item shows brand, size, how many, price and stock, with up to 5 alternatives.
   - Substitutions (the best match is out of stock) and amounts that can't be compared wait for a "yes".
   - Change products and quantities, or skip items.
   - The estimate is labelled as an estimate: the store sets the final total.
   - Everyone in the household sees the same cart live. An edit made from an out-of-date copy is refused, so changes aren't lost.
4. **Send** — one person approves and sends.
   - The database makes sure each approval is sent **once**: a retry or double tap gets the stored result.
   - If a send is interrupted (a timeout, or a server error at the store), the cart becomes "check your store cart" and nothing is re-sent until a person says what they see.
   - "Sent" only shows when the store's API accepted the items.
   - Afterwards you can tell us you placed the order. That's tracked separately from the grocery list, and you can tick the items off the list yourself.
5. **Fallback** — **Copy list / Download / Share** exports the cart as plain text for any store.

**Turning on Kroger carts** (live adds to your Kroger cart — not purchases):

1. On developer.kroger.com, add the **Cart** API to your app and register a redirect URI: `https://<your site>/api/retailers/kroger/callback`.
2. Set these on the server: `KROGER_REDIRECT_URI`, `RETAILER_TOKEN_KEY` (`openssl rand -base64 32`), `SUPABASE_SERVICE_ROLE_KEY` and `SMART_CART_KROGER=on`.
   - The service-role key is used for only two things: sends to a real store, which the database accepts only from the server, and the encrypted token table, which apps can't read.
3. Each shopper connects their own Kroger account once. Sign-in uses PKCE and asks only for `cart.basic:write`. Tokens are encrypted on the server, bound to that person, and never reach the browser or phone; apps can only ask "am I connected?".

Kroger's public Cart API can add items but not read the cart back, and items go to the store selected on the shopper's Kroger account. The app says so. Kroger's docs couldn't be read directly while building this: the endpoint and sign-in details come from published client libraries. Try one small cart on your own account before sharing it.

**Review before applying:** `supabase/migrations/20261101001200_smart_cart.sql` adds `cart_drafts` (shared, edited only through checked functions) and `retailer_connections` (each person's encrypted tokens, readable only by the server). Run `supabase/tests/smart_cart_smoke_test.sql` (25 checks).

## Recipe library and menus

The library is built to grow to 10,000–50,000 recipes. The plan, the research on where recipes can legally come from, and the cost estimates are in [docs/RECIPE_LIBRARY.md](docs/RECIPE_LIBRARY.md).

- **Recipes → For you.** A weekly-rotating selection ranked for your household. **Variety** can be set to Familiar, A mix or Something new:
  - a dish isn't repeated within three weeks;
  - cuisines and proteins rotate;
  - **Try a new cuisine** lists cuisines you haven't cooked yet.
- **Recipes → Explore the library.** Search everything in plain words, such as "authentic Thai dinner for four under $50", "five cheap dinners using chicken thighs" or "something completely different". You can also filter by cuisine (75, grouped by region), course, category, difficulty, diet and time, and include dish ideas.
  - Your household's allergens are never shown.
  - Versions of one dish appear as a single card.
- **Badges are honest:**
  - *Not yet reviewed* (complete and checked automatically, the starting point for everything);
  - *Reviewed* or *Kitchen-tested* (only with a named reviewer);
  - *AI draft* (saved only for your household);
  - *Dish idea* (no instructions yet, and it can't be cooked).

  Authentic and adapted versions are labelled, and raw or soft-egg dishes carry a food-safety note.
- **Versions.** On any recipe you can ask for a Simpler, Budget-friendly, Elevated or Traditional version. On a dish idea you can ask for the full recipe. Claude writes it on the server; it's then checked like any import (amounts, USDA temperatures, your allergens and your equipment) and saved for your household only. You get 5 a day (`AI_DAILY_DRAFT_LIMIT`).
- **Menus.** Budget Family Dinner, Thai, Steakhouse, Luxury Seafood, Fine Dining and more, or a dinner from any cuisine. Holiday menus appear only for holidays you opted in to.
  - Each course comes from your library and is scaled to your guests; you can swap any course.
  - You get a "what to start when" schedule and a merged shopping list.
  - Costs are added up **only from your store's real prices**, and the menu says when a course couldn't be priced.
  - Save menus, or send the shopping list to your grocery list.
- **Adding recipes.** Convert a licensed feed to the import format, or use `--format schema-org`, then run `npm run recipes:import`. New sources stay hidden until you approve them in `recipe_sources`.

**Review before applying:** `supabase/migrations/20261101001800_recipe_library.sql` adds library columns, search, the server-only import, saved menus and household AI drafts; nothing is deleted. Apply it after `…1700`, re-run `supabase/seed_recipes.sql` (80 complete recipes and 273 dish ideas), then run `supabase/tests/recipe_library_smoke_test.sql` (41 checks).

## Barcodes and receipts

**My Kitchen → Barcode** adds a product by its barcode. On the phone, point the camera at it; on the web, type the numbers under the bars (Chrome and Edge can also scan with the camera). The product's name, brand, size and a category guess come from **Open Food Facts**, a free open product database, and fill in the usual add form so you can check them first. If a product isn't there, add the name yourself — the barcode is kept with it.

**After cooking**, tapping *Done — I cooked it* offers to update My Kitchen: what the recipe used is listed item by item ("Chicken thighs 2 lb → 0.5 lb left", "Broccoli — all used up"). Amounts are only subtracted when the kitchen's amount and the recipe's can be compared; otherwise the item says "Used it all?" and starts unticked. Staples like salt and oil are left alone, and nothing changes until you tap **Update** (the kitchen's history records each change).

**My Kitchen → Receipt** reads a photo of a grocery receipt with the AI assistant and lists what you bought, with amounts and prices where they're printed. Food is ticked, everything else isn't; fix any names, untick what you don't want, and add the rest in one go (bought on the receipt's date, at the price paid).

**How it stays honest and private:**

- Nothing is added until you tap **Add**. Product data is volunteer-entered and receipts are read by AI, so both are shown as a starting point to check.
- The receipt photo is sent to Claude once and **never stored** — only the items you choose are saved. Claude is told to skip payment, card, loyalty and personal details, and any long number (card, account, phone, item code) and payment or total lines are removed before the list reaches you.
- Prices are copied from the receipt, never calculated or guessed; a line with no readable price says so.
- Barcode lookups go through your server, which caches answers for a week and stays under Open Food Facts' limit (15 lookups a minute per server; each person up to 30 an hour). Only the name, brand, size and categories are read — no images. Data © Open Food Facts contributors, under the Open Database Licence.

**Set it up:** set `OPEN_FOOD_FACTS_USER_AGENT` to your app name and a contact email or URL, e.g. `KitchenPantry/0.1 (you@example.com)` — Open Food Facts asks for this, and lookups stay off until it's set (you can still add by barcode and type the name). Receipts need `ANTHROPIC_API_KEY`; `AI_DAILY_RECEIPT_LIMIT` (default 5) caps photos per household per day. On the phone, run `npx expo install expo-camera expo-image-picker` once (they're in `apps/mobile/package.json`), then rebuild the development app — camera and photo permissions are declared in `app.json`. Both features need the web server (`EXPO_PUBLIC_API_URL`) and sign-in on the phone.

**Review before applying:** `supabase/migrations/20261101002000_kitchen_import.sql` adds a format check on `pantry_items.barcode` (columns that already existed) and the `receipt_import` AI feature; nothing is deleted. Run `supabase/tests/kitchen_import_smoke_test.sql` (5 checks).

## One store or best deals

**Grocery List → Compare stores** prices your whole list at several stores and answers: is it worth splitting the shop? It shows three ways to buy it —

- **One store** — the whole list at one store (your usual store, or the one that covers the most items for the least).
- **Best deals** — the cheapest way to buy it across up to 2, 3 or 4 stores (your choice), after fuel when you've entered your fuel price.
- **Best overall value** — groceries + fuel + your time at the value you set (default $15/hour), with your preferred stores winning near-ties.

A table puts them side by side (grocery total, stores, drive time, fuel, cash cost, savings, extra time) with a plain sentence such as *"Shopping at three stores could save $3.44 after estimated additional fuel costs, but would take about 47 extra minutes."* Pick a plan and the shared list is organised **by store, then by aisle**; everyone in the household sees it. **Finish trip** puts it back to aisles. On **Specials** you can switch between the stores on your trip, and **Cook the Specials** plans around sale prices at all of them.

On **Meal Plan**, **Is there a cheaper week?** prices the week's dinners and a few alternatives at your store and suggests up to three swaps that cost less — only recipes that already suit your household (allergies, diet, equipment, skill) and score about as well for you; locked nights and favourites are never touched. Each saving says how sure it is: exact, *at least* (the current meal couldn't be fully priced, so it would cost more), or a marked *estimate* (most of both recipes priced). When too little can be priced to compare fairly, it says so instead of guessing. Nothing changes until you tap **Swap**.

**How it stays honest:**

- Prices come only from the retailer (Kroger API) and must be current (24 hours); out-of-stock items, estimates and old prices don't count. Savings are counted **only on items both trips price**, and when prices are missing the page says "Partial data" or "Not enough data" instead of naming a cheapest store.
- Each store compared counts toward your hourly price checks (one per store for every 40 items), so a comparison can't use up the shared Kroger quota.
- Sale prices count only if you say you have the store's loyalty card (the retailer doesn't say whether a sale needs one). Digital coupons aren't counted — no coupon source is connected — and the page says so.
- Drive times and distances come only from **Mapbox** (`MAPBOX_ACCESS_TOKEN`). Without it, fuel and time aren't shown — never guessed. Fuel uses **your** price per gallon and mpg; the time in each store is your own estimate and labelled as such. Store hours from Kroger flag a store that will be closed when you'd arrive.
- **Explain this** (optional, Claude) gets a signed copy of the numbers the server calculated and nothing else. Any answer that mentions a figure that isn't in the comparison is thrown away and the app's own sentence is shown.
- **Practice mode**: with no store prices connected (or by choice), three made-up *Sample* stores with sample prices and drive times let you try it. It's labelled everywhere, never mixed with real stores, and can't organise a real list.

**Set it up:** Kroger keys (see *Store prices*), then a Mapbox token (free tier: <https://account.mapbox.com>) as `MAPBOX_ACCESS_TOKEN`, and a random `SHOPPING_ADVICE_SECRET` (32+ characters; in production the advisor stays off without it). Choose up to six Kroger-family stores near you on the Compare page. Only Kroger-family banners have a permitted price API today, so other chains appear once a legitimate price source is added (a new `PricingProvider`). Your settings (stops, fuel, value of time, starting address, cards) are personal; the chosen trip is shared. Your starting address is geocoded for each comparison and not stored by Mapbox or as coordinates.

**Review before applying:** `supabase/migrations/20261101001900_shopping_optimizer.sql` adds `shopping_preferences` (personal), `shopping_trips` / `_stops` / `_items` (shared, written only through `save_shopping_trip()`), and the `shopping_advice` AI feature; nothing is deleted. Prices are still never stored. Apply it after `…1800`, then run `supabase/tests/shopping_optimizer_smoke_test.sql` (28 checks).

## Cooking mode, Chef mode and the cooking assistant

On any recipe, tap **Start cooking**. Advanced recipes (level 4–5, or three or more components) say **Cook in Chef mode** instead.

- **Steps.** One step at a time in large text, with Back/Next (or ← → on a keyboard).
  - Each step shows the amounts it uses, scaled to the servings you pick.
  - It also shows the cooking temperature and the USDA safe internal temperature where it matters.
  - Steps with a set time get a **Start timer** button. Several timers can run at once; they beep and vibrate on the web and vibrate on phones.
  - On the web the screen stays on while cooking, where the browser supports it.
  - **Done** marks the recipe as cooked and asks how it was.
- **Ingredients.** A checklist to tick off as you set things out. **Swap?** shows curated substitutions, with anything containing your household's allergens or never-recommend items removed.
- **Chef plan** (Chef mode only).
  - A **running order** worked back from the time you want to serve, using each step's timer or an estimate.
  - **Mise en place**: everything to measure and cut, grouped by component (e.g. Pommes purée, Tarragon jus).
- **Ask.** Quick questions ("My sauce broke", "It's browning too quickly", "Make it restaurant-style", and a wine pairing in Chef mode), or type your own.
  - Claude sees only this recipe, the current step and your household's allergens.
  - It's told never to suggest your allergens or unsafe temperatures. An answer that mentions one of your allergens is thrown away and not shown.
  - Without an API key, or once the daily limit is used (`AI_DAILY_HELP_LIMIT`, default 30 per household), you get the built-in help instead: safe temperatures and swaps for that step.

## Who's eating and household activity

- **Who's eating.** On Home ("Dinner tonight") and under each dinner on the Meal Plan, each person taps **I'm in** or **I'm out** for themselves. Nobody answers for anyone else, and no answer means eating. Anyone can add **guests**.
  - The app works out the servings needed: everyone eating × their usual portion, plus people at home without an account (from your household size), plus guests.
  - When that differs from the plan, it offers **Use N** or **Make tonight N servings**. Servings never change on their own.
  - Answers update live for everyone, just like the grocery list.
- **Your usual portion** is on the Household page, from Small to Big. It's personal, and only you can change it.
- **Recent activity** is on the Household page. It shows what people did: added or used up kitchen items, threw something out, added or picked up groceries, rated a dinner, placed an order, logged a shop, confirmed a week, or had a weekly draft made. It's built only from records the app already keeps, nothing new is tracked, and only household members can see it. Bursts are grouped, for example "Sam added 10 items to the kitchen".
- Preview mode has just you, plus the rest of your household size counted as "others at home".

## Savings dashboard

**Savings** is in the sidebar on a computer. On a phone it opens from the "Savings this week" card on Home. Verified numbers and estimates are always labelled separately, and nothing is made up.

| What you see | Where it comes from | Label |
| --- | --- | --- |
| Weekly grocery budget | Your planning settings | — |
| Estimated basket | Your grocery list priced live at your store (same as the Grocery List). Shown only when you've chosen a store and prices are connected. | Estimate |
| Sale savings | Carts sent to a real store (not the practice store) that you **marked as ordered**, where the store reported both the regular and the sale price at fresh ("verified") prices. Items sold by weight, older prices and orders not marked as placed are listed separately. | Verified / Estimate |
| Food used from your kitchen | The "price paid" you entered for items you marked **Used it up**. This food was already bought, so it is never counted as money saved. | Value, not savings |
| Waste avoided | Items used up on, or within 3 days before, their use-by date. Thrown-out and expired items are shown beside it ("up to", because they may have been partly used). | Potential |
| Spending trend | Only the shops you log (**Log a shop**). Orders you placed can be logged in one tap, prefilled with the cart's estimate for you to correct. No logging, no trend. | — |

After you apply `…1500_smart_savings.sql`, the kitchen log records each item's price paid and use-by date when it's removed. Items removed before that show as "no price".

## Weekly drafts (next week, planned for you)

Plan → **Planning settings** → **Weekly drafts**. Off by default. One switch turns it on, and it uses your household's usual settings.

- **When it runs.** Once a week, on the day and hour you pick, in your own time zone. The default is Saturday at 9 AM. It drafts the week starting the following Monday.
- **What it does,** in this order:
  1. Fetches your store's sale prices, but only in Cook the Specials mode. Prices are real store prices; if you have no store or no prices, it plans like Balanced and says so.
  2. Checks your kitchen and what's close to its use-by date.
  3. Uses your preferences: everyone's allergies and diets, plus the cooking skill and tastes of whoever switched drafts on.
  4. Picks candidate recipes, with every filter applied. "Not for us" recipes never return, and anything cooked in the last ten days is less likely to come up.
  5. Builds the week with the planner, which keeps the shopping list small and reuses ingredients. It uses Claude if your server has a key and the household hasn't hit its daily AI limit.
  6. Saves the result as a **draft**.
  7. Leaves a notice: "Next week's meal plan is ready to review".
- **What it never does.** It never buys anything and never confirms the week. A draft only goes into an **empty** week. If the week is already confirmed, or someone has started planning it, it's left exactly as it is, even if that happens while the draft is being made. In that case the job records "skipped" with the reason.
- **Notices.** These are per person.
  - **In the app** (Home, plus the bell on the web) is on by default.
  - **On my phone** is off until you turn it on in the phone app. The phone asks permission, then saves its Expo push address for you. Signing out removes it.

**Turn it on (server).** Do this after you review and apply `…1400_weekly_planning.sql`:

1. On the web server, set `WEEKLY_DRAFTS=on`, a `CRON_SECRET` of at least 32 characters (`openssl rand -hex 32`) and `SUPABASE_SERVICE_ROLE_KEY`.
2. Have something call `GET https://your-site/api/jobs/weekly-drafts` **every hour** with `Authorization: Bearer <CRON_SECRET>`. Calling it more often is safe, because each household gets at most one draft a week.
   - **Vercel (Pro plan):** add `{"crons":[{"path":"/api/jobs/weekly-drafts","schedule":"0 * * * *"}]}` to `apps/web/vercel.json`. Vercel sends the `CRON_SECRET` header for you. The Hobby plan only allows daily cron jobs, which isn't enough.
   - **Supabase (any plan):** enable the `pg_cron` and `pg_net` extensions and store the secret in Vault as `kp_cron_secret`. Then run:

     ```sql
     select cron.schedule('kitchen-pantry-weekly-drafts', '5 * * * *', $$
       select net.http_get(
         url := 'https://your-site/api/jobs/weekly-drafts',
         headers := jsonb_build_object('Authorization', 'Bearer ' ||
           (select decrypted_secret from vault.decrypted_secrets where name = 'kp_cron_secret')),
         timeout_milliseconds := 60000);
     $$);
     ```

   Nothing is scheduled for you; the migration only adds the tables and functions.

**Phone notifications.** These need a development or store build of the app; Expo Go can't receive them.

1. Run `npx expo install --fix` in `apps/mobile` so `expo-notifications` matches your SDK.
2. Run `npx eas init` to add `expo.extra.eas.projectId`.
3. Android also needs FCM credentials set up in your Expo account.
4. Set `EXPO_ACCESS_TOKEN` on the server only if you turned on Expo's "enhanced push security".

**Security.** The job uses the service role, and only for this. The database lets only the server claim jobs, read a household's planning inputs and save a draft. While drafting, it works as one member of the household inside the database, so the same checks apply as in the app: which recipes that member can see, which household they're in, and that the week isn't confirmed. Members can read what the job did, but can't create or change jobs.

## Cooking history

Recipes → **History** (the clock button on the phone). Every meal the household finished in cooking mode or rated, newest first and grouped by month, with the rating, "would cook again", how long it actually took, the family's verdict and any notes. Above it: meals cooked in the last 30 days, how many different recipes, the average rating, the cuisines you cook most (twice or more), and **Worth making again** — recipes you rated 4★+ or would cook again that you haven't made for three weeks. Counted only from what was actually logged (finishing and then rating the same meal counts once); nothing is estimated. No migration needed.

## Saved grocery lists

Grocery List → **Saved lists**. Save what's on the list under a name ("Weekly basics", "Costco run"), then tap **Add** to put it back later; anything already on the list (and not yet bought) is skipped. Saved lists are shared with the household; anyone can rename or delete them. Up to 30 lists of 150 items. Saving again under the same name updates the list. Needs migration `…2200_saved_grocery_lists` (test: `saved_grocery_lists_smoke_test.sql`, 15 checks).

## Use it before you lose it

My Kitchen (or Home) → **Find recipes to use these up**. Pick one ingredient or several — the ones closest to their use-by date are picked for you — and you get up to six recipes that use as many of them as possible.

- **Order.** Recipes that use the most of what you picked come first, then the ones using the most urgent item, then the fewest things to buy. Every picked ingredient gets at least one idea when a recipe uses it; if none does, the page says so.
- **What each idea says.** "Uses your spinach, chicken thighs and heavy cream. You already have most of the ingredients — you'd only need to buy one thing: chicken broth." Salt, pepper, oil and dried spices are listed separately ("if you're out"). It also shows the cooking time and how much of each ingredient the recipe uses, with "you have 1 lb" when the recipe needs more than you've got.
- **Extra cost.** Tap **What would the extra shopping cost?** to price what you'd need at your store — real shelf prices for whole packages, one check against the hourly limit. Items without a price are counted ("2 of 3 priced", "at least $…"), never guessed. Nothing is priced until you tap.
- **Safety.** Only the dates you entered count. Anything past its date can't be picked and is never suggested; the page reminds you that dates are a guide, not a safety check.
- **Something new (AI).** **Ask AI for a new idea** has Claude write a new dinner around up to five of the picked ingredients. It goes through the same checks as every AI draft (amounts, USDA safe temperatures, the household's allergens, diet and equipment, and it must actually use something you picked), is saved for your household as "AI draft · not reviewed", and counts against `AI_DAILY_DRAFT_LIMIT`. On the server, the ingredients are read from your own kitchen by id, never from what the browser or phone sends, and past-date items are left out. Needs `ANTHROPIC_API_KEY`; on the phone it needs a signed-in account.

## Use-soon reminders

Profile → **Reminders**. Once a day, in the daytime, you hear about what in your kitchen is due **today or tomorrow**, going by the use-by dates your household entered — for example "Use soon: Chicken thighs and 2 more" / "Chicken thighs (by Nov 2), Spinach (by Nov 3)…". Dates are written out, and the in-app notice disappears at the end of your day, so an old reminder never points at food whose date has passed.

- **Per person.** Each person chooses for themselves. **In the app** (the bell on the web, a card on the phone's Home) is on by default. **On my phone** is off until you turn it on in the phone app.
- **When.** Between 8 AM and 8 PM in your own time zone (saved from your device when you change the setting; otherwise the household's weekly-drafts time zone, otherwise US Central). At most once a day, however often the job runs.
- **What's included.** Items in your active household with a use-by date of today or tomorrow. Staples, used-up items and anything already past its date are left out — Home and My Kitchen already flag those, and the app never suggests eating something past its date. Dates are a guide, not a safety check.

**Turn it on (server).** After you review and apply `…2100_use_soon_reminders.sql`:

1. Set `USE_SOON_REMINDERS=on`. It uses the same `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` as weekly drafts.
2. Have something call `GET https://your-site/api/jobs/use-soon` **every hour** with `Authorization: Bearer <CRON_SECRET>` — the same way as weekly drafts above (a second Vercel cron entry, or a second `cron.schedule('kitchen-pantry-use-soon', '10 * * * *', …)` with the new URL).

Run `supabase/tests/use_soon_reminders_smoke_test.sql` (15 checks) after applying. The migration also removes your notices about a household when you leave it, and keeps at most 10 phones per person.

Phone notifications use the same setup as weekly drafts. The database alone decides who is reminded and what it says; the job can only run with the service role, and nobody signed in can read its bookkeeping.

## Surprise Me and learned taste

**Surprise Me** (on Recipes and Home) gives three fresh dinner ideas of the kind you ask for, each with a plain reason. A typical reason: "You're getting this because boneless chicken thighs are on sale at Pick 'n Save, you already have garlic and rice, and you've enjoyed similar Italian dishes."

- **Never cooked**: things your household hasn't made.
- **Highly rated**: real community ratings only (at least 20). Until a recipe has that many, the card says so and offers your household's own 4–5★ dishes instead.
- **Restaurant quality**: composed, technique-led dishes, allowing one step above your skill and saying so.
- **Under $5**: what the ingredients cost **for the amounts used**, from your store's current prices. Salt, spices and oil are left out. Amounts that can't be matched to a package size (e.g. "3 cups spinach") aren't guessed; the card says what couldn't be priced.
- **Uses what I have**: dinners built on your kitchen, use-it-up items first.
- **On sale**: built around this week's sale prices at your store.
- **New cuisine**: one idea per cuisine you haven't cooked in the last month.

**No repeats:** anything cooked or suggested by Surprise Me in the last two weeks is skipped, unless it's a favourite. "Show me others" keeps going without repeating.

**Learned taste:** recipe rankings everywhere (Recipes, Home, the planner) now learn from your household's own ratings. Cuisines and main proteins you rate highly get a small, capped boost. "You've enjoyed similar Italian dishes" only appears once at least two of your ratings back it up. Dishes you didn't enjoy sink quietly. Other households' ratings never shape your taste.

**Review before applying:** `supabase/migrations/20261101001300_surprise_me.sql` changes one rule so suggestions can be recorded under a new "surprise" label (one line); nothing is deleted. Run `supabase/tests/surprise_smoke_test.sql` (3 checks).

## Cook the Specials

On **Meal Plan**, the fifth planning mode, **Cook the Specials**, builds the week around what's on sale at your chosen Kroger-family store.

- It checks the store for the fresh ingredients your best-fitting recipes need, then favours dinners whose main ingredients are on sale. Onions, garlic, citrus and spices on sale count for little.
- Each dinner says why ("On sale: boneless chicken thighs (33% off)"). The week's summary names the store and reminds you that sale prices can change.
- Only real store sale prices are used. With no store chosen, no price connection, or nothing on sale, the week is planned like Balanced, and the plan says so.
- It works with Claude planning too: Claude sees which ingredients are on sale (not the prices) and is told never to pick a weak dish just because something is cheap.

## Specials

The **Specials** tab lists products your chosen Kroger-family store reports at a sale price below its regular price.

- **What's checked:** what's still on your grocery list, this season's produce and about 37 everyday staples across meat, produce, dairy, bakery, pantry and frozen (up to 45 searches per refresh, each cached for `PRICING_CACHE_MINUTES`). Item names are all that leave the device; each refresh counts once toward `PRICING_HOURLY_LIMIT`.
- **Each special shows** the sale and regular price, savings and % off, unit price (worked out from the package size the store gives), department, stock level and when it was checked. If Kroger includes a promotion end date or product page link, they're shown. Otherwise the card says the end date wasn't given — nothing is guessed. The source doesn't say whether a loyalty card or digital coupon is needed, so the card says "not stated".
- **Filters:** department, minimum discount (20 / 33 / 50%), search, sort (for you · most off · unit price), and **Fits our diet** (on by default). It hides products whose names conflict with anyone's allergies, your diet style or your "never recommend" list. It reads names only, so always check the label.
- **For you** puts items on your list first, then in-season produce, then the biggest discounts. **Add to list** puts the item on the shared grocery list with a note.
- **Not covered yet:** weekly ads, buy-one-get-one, digital coupons and other stores. These need a source that permits it; the `PromotionProvider` interface is ready for one.
- **Phones:** the five tabs are now Home, Kitchen, Plan, Specials and Grocery. Profile opens from the avatar at the top of each screen; on desktop it stays in the sidebar.

No database change: specials, like prices, are fetched live and never stored.

## Seasonal cooking

Seasonal recipes get a gentle nudge — nothing out of season is ever hidden.

- **Automatic season.** Worked out from the household's country + ZIP/postcode and today's date, in both hemispheres (US ZIPs → cold / temperate / warm climate; Australia flips the months). It changes by itself through the year. If the guess is wrong, pick your climate under **Profile → Seasons** (shared with the household).
- **On by default.** One switch during setup ("Enjoy seasonal recipes", on the goals step). Seasonal produce, meals, desserts and holiday recipes are preselected; **seasonal grocery deals** are opt-in. Everything can be changed any time under **Profile → Seasons**, and these settings are personal.
- **Holidays.** None are assumed. Pick the ones you celebrate (18 to choose from, including Lunar New Year, Passover, Eid al-Fitr, Diwali, Hanukkah, Thanksgiving and Christmas). Fixed and rule-based dates are calculated; lunar dates for 2026–2030 come from published calendars (Hong Kong Observatory, Hebcal, Drik Panchang, timeanddate). Eid dates depend on the moon sighting, so they're shown as "around" a one- or two-day window.
- **Home → In season this week.** Signature produce for the season, a few seasonal dinners and one dessert (e.g. apple crisp in fall, gingerbread in winter, strawberry shortcakes in summer), and ideas for opted-in holidays in the next two weeks. Recipe cards show an *In season* label.
- **Deals (opt-in).** "Check sale prices" asks your chosen Kroger-family store about this week's in-season produce and lists only items the store reports on sale, with the regular price beside it. We never assume in-season produce is cheaper.
- **Desserts stay optional.** Seasons only change *which* dessert is suggested, never how often.

The produce list is the USDA SNAP-Ed *Seasonal Produce Guide* (public domain, US-national), so it's a guide rather than a local harvest calendar.

**Review before applying:** `supabase/migrations/20261101001100_seasonal.sql` adds two columns (`user_preferences.seasonal`, `households.seasonal_region`) and functions only. Apply it after the dessert migration, then run `supabase/tests/seasonal_smoke_test.sql` (6 checks).

## Recipe photos

Recipe photos are free-licence photos of a **similar dish** (not our exact recipe) from Unsplash, each credited to its photographer and labelled "Similar dish" in the app. They're listed in `packages/recipe-engine/src/catalog/photos.ts`. Rules:

- Only use photos whose licence you've checked on the photo's own page (Unsplash, Pexels, or Wikimedia Commons with CC0 / CC BY / CC BY-SA). Never copy photos from recipe sites, blogs or search results — they're copyrighted.
- Only `images.unsplash.com`, `images.pexels.com` and `upload.wikimedia.org` are accepted; validation and a database constraint reject anything else, and every photo needs a credit and a source page.
- When you have your own photos, set `license: "owned"` and `representative: false`.
- If a photo fails to load, the app falls back to the coloured recipe tile.

After changing photos, run `npm run seed --workspace=@kitchen-pantry/recipe-engine` to regenerate `supabase/seed_recipes.sql`.

## Going to production

- **CI.** `.github/workflows/ci.yml` runs on every push and pull request: type-check, unit tests, the database smoke tests (`npm run test:sql`, on a throwaway Postgres — never your Supabase project) and a production build of the web app. It needs no secrets and deploys nothing. Run the database tests locally with `npm run test:sql` against any Postgres 15+ you can create databases on (set `PGHOST`, `PGUSER`, `PGPASSWORD`).
- **Security.** See [docs/SECURITY.md](docs/SECURITY.md) for how data is protected and what to check before launch. The web app sends these headers: `X-Frame-Options`, `nosniff`, a strict referrer policy, a permissions policy and HSTS.
- **Monitoring.**
  - `GET /api/health` is for uptime monitors. It reports which optional parts are on, never keys.
  - Every server error is logged as one JSON line (`src/instrumentation.ts`), with paths masked, so your host's log alerts can catch it. To use Sentry or similar, call its SDK there.
- **Invite emails** are optional. Set `RESEND_API_KEY` and `INVITE_EMAIL_FROM` (an address on a domain you've verified with Resend), with `NEXT_PUBLIC_SITE_URL` on https. Invites that include an email address are then also emailed from the server, at most 5 per person per hour. Without these, "Email it" opens your own mail app as before.
- **Phone app builds.** `apps/mobile/eas.json` has three profiles: `development` (needs `npx expo install expo-dev-client`), `preview` (an installable test build; APK on Android) and `production`. Run `npx eas init` once, then `npx eas build --profile preview`. The bundle IDs are `com.kitchenpantry.app` — change them in `app.json` before publishing.
- **Deploying the web app.** Any Node host works (Vercel, Fly, Render).
  - Set the environment variables from `apps/web/.env.example`.
  - Apply the reviewed migrations with `supabase db push`, then schedule the weekly drafts job if you use it.
  - Server-only secrets must never be prefixed `NEXT_PUBLIC_` or `EXPO_PUBLIC_`: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `KROGER_*`, `RETAILER_TOKEN_KEY`, `CRON_SECRET` and `RESEND_API_KEY`.

## Troubleshooting

- **`npm install` fails with ERESOLVE / peer dependency errors** — run `npm install --legacy-peer-deps` once and let us know which package complained.
- **Mobile versions out of step with Expo** — `cd apps/mobile` then `npx expo install --fix`.
- **Port 3000 busy** — `npm run dev -- -p 3001` (from `apps/web`).
- **Changed `tokens.ts` but colours didn't update** — run `npm run tokens`.
