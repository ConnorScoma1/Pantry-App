# Low-cost AI architecture and cost estimate

Target: a $24.99/year subscription. Status: **proof of concept, not
deployed.** Nothing paid has been signed up for. Turning on paid Gemini
billing and applying the migrations are your decisions.

## How AI is kept cheap

| Rule | Where it's done |
|---|---|
| One AI layer for every provider (Gemini, Claude, OpenAI, Groq). Pick one with `AI_PROVIDER`; the features don't change. | `packages/ai/src/providers.ts` |
| Keys live only in server settings and are sent in request headers. They never appear in URLs, logs, error messages, or the web or phone bundles. | `packages/ai/src/core.ts` (`assertServerOnly`) |
| Recipes are searched, filtered and ranked in Supabase and in plain code (allergies, diet, restrictions, equipment, skill, "not for us"). No AI is involved. | `search_recipes()`, `recipe-engine` |
| Quantities, pantry maths, grocery lists, prices and budgets are plain code. | `inventory-engine`, `meal-planner`, `grocery-pricing` |
| AI is used only for: picking a week from the filtered candidates, recipe adaptations, new dinners from kitchen leftovers, cooking questions and substitutions, and explaining a shopping comparison. | `packages/ai/src/*` |
| The model sees only short candidate summaries: id, title, cuisine, minutes, skill, main proteins, what to buy, and up to 30 candidates. No steps, amounts, prices, names or addresses. | `buildMealPlanPrompt` |
| Caching: identical meal-plan requests are reused for an hour. Each household keeps one adaptation per recipe and version, which is returned without calling the AI. | `meal-plan.ts`, `find_household_draft()` |
| Limits: per-feature daily limits per household and per person. Optional monthly limits: requests per person (`AI_MONTHLY_REQUESTS_PER_PERSON`) and an app-wide spending cap (`AI_MONTHLY_BUDGET_USD`). | `reserve_ai_request()`, migration `…2300_ai_costs` |
| Every request logs feature, model, tokens and estimated cost, and nothing else. No prompts or answers are stored. | `ai_usage`, `ai_spend_months` |
| Every answer is checked against a schema, then re-checked: only offered recipe ids, safe cooking temperatures, allergens, diet and restrictions, no invented prices. | each feature + `answerToRecipe`, `validateAiPicks` |
| If the AI is off, over a limit, slow, wrong or down, the app uses the built-in planner and normal recommendations, and says so. | `planWeekWithAi` fallback |

## Gemini 3.1 Flash-Lite price (checked 2026-11-02)

From Google's [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing):

| Tier | Input | Output |
|---|---|---|
| Paid, standard (text, image or video) | $0.25 per million tokens | $1.50 per million tokens |
| Batch | half of standard | half of standard |
| Free tier | free, with rate limits | free, with rate limits |

Google may use free-tier prompts to improve its products. For real users'
data, use a paid key. Vertex AI pricing for the same model can differ, so
check your Cloud billing page.

## Estimated monthly cost

The numbers come from `npm run ai:costs`. Input sizes are **measured from
the app's real prompts** (system text, data and response schema), built
from the recipe catalogue. Tokens are estimated at 4 characters per token.
Output sizes are typical answer lengths. Usage per user is an
**assumption**, listed here so you can change it.

| Request | Input tokens | Output tokens | Cost each | Assumed per active user per month |
|---|---:|---:|---:|---|
| Weekly meal plan (incl. regenerate) | ≈4,700 | ≈450 | $0.00185 | 6, of which 15% are cached |
| Cooking question or substitution | ≈660 | ≈200 | $0.00047 | 4 |
| Recipe adaptation (simpler, budget, …) | ≈1,300 | ≈1,800 | $0.00302 | 2, of which 30% are cached |
| New dinner from kitchen leftovers | ≈1,200 | ≈1,800 | $0.00300 | 1 |
| Shopping trip explanation | ≈1,060 | ≈120 | $0.00044 | 1 |

**About $0.019 per active user per month, or about $0.23 a year. That's
under 1% of the $24.99 subscription.**

| Active users | Per month | Per year |
|---:|---:|---:|
| 1,000 | ≈ $19 | ≈ $228 |
| 10,000 | ≈ $190 | ≈ $2,280 |
| 100,000 | ≈ $1,900 | ≈ $22,800 |

**Heavy use.** At 2.5× the usage above, with about 500 thinking tokens per
request, the cost is about $0.06 per user per month. `AI_MONTHLY_REQUESTS_PER_PERSON`
puts a ceiling on this: 60 requests at most costs about $0.18 per person per
month at these prices.

**What isn't included:**
- Receipt reading (photos are billed as image tokens, so measure with a real receipt).
- Supabase hosting, store-price APIs and app-store fees.
- Free-tier savings.

**Ways to cut cost further**, in order of value:
1. Don't call the AI for weeks the built-in planner already handles well. The quality test shows where AI adds something.
2. Move the overnight weekly drafts to the Batch API (half price).
3. Send fewer candidates (`MAX_AI_CANDIDATES`, now 30).
4. Lower the per-person monthly limit.

## Before you expand the integration

1. Create a new Gemini key. The one pasted into the chat should be deleted.
2. In `apps/web/.env.local`, set `AI_PROVIDER=gemini`, `GEMINI_API_KEY=…` and `AI_MONTHLY_BUDGET_USD=5`.
3. Run `npm run ai:poc`. It prints a real 7-day plan, the tokens used and the cost. Compare the cost with the table above.
4. Run `npm run ai:eval`. It runs 12 households (budget, international and authentic, advanced and beginner, vegetarian, vegan with nut allergies, gluten- and dairy-free, halal with a shellfish allergy, weeknights, using up the fridge). It scores each one with plain code against the built-in planner and writes a report to `packages/ai/eval/results/`. Repeat with another `AI_PROVIDER` or `AI_MODEL` to compare models.
5. Review and apply migration `…2300_ai_costs`, which adds monthly caps and cost logging.
6. Decide on paid billing.

## Changed alongside this work: diet safety

Building the test set turned up two gaps in the existing filters, and both are fixed:
- **Meat cuts got through.** Recipes listing meat by cut ("ribeye", "flank steak") passed the vegetarian and vegan filters, and cheese like "cheddar" passed the vegan filter.
- **Restrictions weren't applied.** Gluten-free, dairy-free, halal and kosher were collected at onboarding but never applied.

Diet checks now use the allergen rules too. Restrictions are applied where the ingredients can show them; halal and kosher can't be certified from ingredients, so they aren't claimed to be. Restrictions that need nutrition data (low sodium, lower carb, keto, paleo) are still not claimed. AI drafts are checked against diet and restrictions as well. `supabase/seed_recipes.sql` was regenerated: three library recipes had wrong diet tags (bulgogi and steak with chimichurri were tagged vegetarian and vegan). Run the seed again to update them.
