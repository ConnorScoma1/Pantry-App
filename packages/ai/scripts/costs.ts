/**
 * Estimated monthly AI cost for 1,000 / 10,000 / 100,000 active users.
 *
 *   npm run ai:costs                         # Gemini 3.1 Flash-Lite list price
 *   npm run ai:costs -- --in 0.25 --out 1.5  # any other price per million tokens
 *
 * Input sizes are measured from the app's real prompts (system text + the
 * data sent + the response schema), built from the recipe catalogue with a
 * fake model that answers nothing. Tokens are estimated at 4 characters per
 * token; output sizes are typical answer lengths. Usage per user is an
 * assumption — edit USAGE below, and replace both with the numbers the
 * proof of concept and ai_usage report once real people use it.
 */
import { buildAdviceFacts, DEFAULT_SETTINGS, runComparison, SAMPLE_STORES, SampleRoutingProvider, SampleStoresPricingProvider } from "@kitchen-pantry/shopping-optimizer";
import { askCookingQuestion, draftRecipe, explainComparison, KNOWN_PRICES, planWeekWithAi, type AiConfig, type FetchLike } from "../src/index";
import { arg, loadRecipes, nextWeek, rank, sampleProfile } from "./lib";

let captured = 0;
const capture: FetchLike = async (_url, init) => {
  captured = init.body.length;
  return { ok: false, status: 500, json: async () => ({}) };
};
const config: AiConfig = { provider: "gemini", apiKey: "AIza-measure-only", model: "gemini-3.1-flash-lite", maxOutputTokens: 4000, dailyPlanLimit: 10 };
const tokens = (chars: number) => Math.round(chars / 4);

/** Requests per active user per month (assumptions — see docs/AI_COSTS.md). */
const USAGE: Record<string, { perMonth: number; outTokens: number; cacheHit: number }> = {
  "Weekly meal plan (incl. regenerate)": { perMonth: 6, outTokens: 450, cacheHit: 0.15 },
  "Cooking assistant question": { perMonth: 4, outTokens: 200, cacheHit: 0 },
  "Recipe adaptation (simpler / budget / …)": { perMonth: 2, outTokens: 1800, cacheHit: 0.3 },
  "New dinner from kitchen leftovers": { perMonth: 1, outTokens: 1800, cacheHit: 0 },
  "Shopping trip explanation": { perMonth: 1, outTokens: 120, cacheHit: 0 },
};

async function main() {
  const priceIn = Number(arg("in") ?? KNOWN_PRICES["gemini-3.1-flash-lite"]!.inputPerMillion);
  const priceOut = Number(arg("out") ?? KNOWN_PRICES["gemini-3.1-flash-lite"]!.outputPerMillion);
  const { recipes } = await loadRecipes();
  const profile = sampleProfile((p) => (p.diet.allergies = ["peanut"]));
  const today = new Date().toISOString().slice(0, 10);
  const ranked = rank(recipes, profile, today);
  const measured: Record<string, number> = {};

  await planWeekWithAi({ config, input: { days: nextWeek(), candidates: ranked, mode: "balanced", goals: profile.goals.ranked, servings: 2 }, skillLevel: 3, householdSize: 2, cacheScope: "measure", fetchImpl: capture });
  measured["Weekly meal plan (incl. regenerate)"] = captured;
  const r = ranked[0]!.recipe;
  await askCookingQuestion({ config, recipe: r, question: { recipeId: r.id, step: 2, question: "Can I use chicken breast instead of thighs?", servings: 2 }, allergies: ["peanut"], fetchImpl: capture }).catch(() => {});
  measured["Cooking assistant question"] = captured;
  const household = { allergies: ["peanut"] as const, dietStyle: "omnivore" as const, avoid: [], equipment: profile.equipment, skillLevel: 3, servings: 2 };
  await draftRecipe({ config, draft: { kind: "version", recipe: r, variant: "simplified" }, household, householdKey: "m", fetchImpl: capture }).catch(() => {});
  measured["Recipe adaptation (simpler / budget / …)"] = captured;
  await draftRecipe({ config, draft: { kind: "use_up", ingredients: [{ name: "chicken thighs", amount: "1 lb", due: "today" }, { name: "spinach", amount: null, due: "tomorrow" }] }, household, householdKey: "m", fetchImpl: capture }).catch(() => {});
  measured["New dinner from kitchen leftovers"] = captured;
  const now = new Date();
  const needs = ["broccoli", "chicken thighs", "rice", "yellow onions", "milk", "eggs", "bread", "apples"].map((name, i) => ({ id: String(i), name, quantity: null }));
  const cmp = await runComparison({ pricing: new SampleStoresPricingProvider(() => now), stores: SAMPLE_STORES, needs, settings: DEFAULT_SETTINGS, routing: new SampleRoutingProvider(() => now), start: { lat: 0, lng: 0 }, now: () => now });
  await explainComparison({ config, facts: buildAdviceFacts(cmp, new Map(needs.map((n) => [n.id, n.name])), DEFAULT_SETTINGS), fetchImpl: capture }).catch(() => {});
  measured["Shopping trip explanation"] = captured;

  console.log(`Price: $${priceIn} in / $${priceOut} out per million tokens\n`);
  console.log("| Request | Input tokens (measured) | Output tokens (typical) | Cost each | Per user / month |");
  console.log("|---|---:|---:|---:|---:|");
  let perUser = 0;
  for (const [name, u] of Object.entries(USAGE)) {
    const inTok = tokens(measured[name] ?? 0);
    const each = (inTok * priceIn + u.outTokens * priceOut) / 1e6;
    const month = each * u.perMonth * (1 - u.cacheHit);
    perUser += month;
    console.log(`| ${name} | ${inTok.toLocaleString()} | ${u.outTokens.toLocaleString()} | $${each.toFixed(5)} | ${u.perMonth}× → $${month.toFixed(4)} |`);
  }
  console.log(`\nPer active user per month: $${perUser.toFixed(4)} (≈$${(perUser * 12).toFixed(3)} a year)\n`);
  console.log("| Active users | Per month | Per year | Share of $24.99/yr revenue |");
  console.log("|---:|---:|---:|---:|");
  for (const n of [1_000, 10_000, 100_000]) {
    console.log(`| ${n.toLocaleString()} | $${(perUser * n).toFixed(2)} | $${(perUser * n * 12).toFixed(2)} | ${((perUser * 12) / 24.99 * 100).toFixed(2)}% |`);
  }
  const heavy = perUser * 2.5 + (500 * priceOut / 1e6) * 14;
  console.log(`\nHeavy user (2.5× the usage, plus ≈500 thinking tokens on every request): ≈$${heavy.toFixed(4)} a month.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
