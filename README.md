# Kitchen Pantry

An AI-powered kitchen assistant: weekly meal plans people actually want to cook, a grocery list that knows what's already in the kitchen, honest prices, and less food waste.

This repository is a **Turborepo monorepo** containing the web app (Next.js), the mobile app (Expo / React Native), shared packages and the Supabase database.

> **Status:** Foundation done (monorepo, design system, database with row-level security, sign-in, onboarding, web + mobile navigation). **My Kitchen inventory** works on web and mobile. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the roadmap and [docs/specs](docs/specs) for the product specs.

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

Scan the QR code with the **Expo Go** app on your phone (same Wi-Fi as your PC). The phone app has sign-in, the full questionnaire, **My Kitchen** (staples, add/edit, use-by urgency) and the same Home, Plan and Profile screens as the website.

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

Database checks (with local Supabase running):

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/pantry_smoke_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/recipes_smoke_test.sql
```

Every result line should end in `t`.

## Environment variables

| Variable | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | No | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | No (RLS protects data) | Supabase anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | `apps/web/.env.local` | No | Base URL for auth email links |
| `ANTHROPIC_API_KEY` | `apps/web/.env.local` | **Yes — server only** | Claude API (from Phase 3) |
| `ANTHROPIC_MODEL` | `apps/web/.env.local` | No | Claude model id |
| `AI_MAX_OUTPUT_TOKENS` | `apps/web/.env.local` | No | Per-request AI output cap |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | `apps/mobile/.env` | No (RLS protects data) | Mobile Supabase; empty = preview mode |

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
  recipe-engine/       Test Kitchen recipe catalogue, allergen screening, eligibility, pantry match + ranking, scaling
  inventory-engine/    Units, inventory subtraction, use-by urgency, staples, kitchen summaries
  grocery-pricing/     Pricing provider interface, package math, labelled mock provider
  meal-planner/        Week maths, budget verdicts (never "within budget" on estimates)
  ai/                  Server-only Claude guard rails + structured-output validation
  integrations/        Registry of verified store/pricing integrations (empty by design)
supabase/
  migrations/          Schema, row-level security, onboarding functions
  seed.sql             Reference data only — no fake prices, stores or ratings
  seed_recipes.sql     Generated from the recipe catalogue (don't edit by hand)
  tests/               SQL smoke tests (RLS, pantry, recipes)
docs/ARCHITECTURE.md   Decisions, risks, roadmap
docs/specs/            Product specs (platform, AI & specials, one store vs best deals)
```

## Troubleshooting

- **`npm install` fails with ERESOLVE / peer dependency errors** — run `npm install --legacy-peer-deps` once and let us know which package complained.
- **Mobile versions out of step with Expo** — `cd apps/mobile` then `npx expo install --fix`.
- **Port 3000 busy** — `npm run dev -- -p 3001` (from `apps/web`).
- **Changed `tokens.ts` but colours didn't update** — run `npm run tokens`.
