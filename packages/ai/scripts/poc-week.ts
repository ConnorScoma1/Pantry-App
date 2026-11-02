/**
 * Proof of concept: a seven-day dinner plan from recipes already in the
 * database, chosen by the configured AI provider (Gemini by default).
 *
 *   npm run ai:poc                 # call the model once, print the plan, tokens and cost
 *   npm run ai:poc -- --dry-run    # no AI call: show what would be sent and its size
 *
 * What it shows, in order:
 *   1. Recipes come from Supabase (or the bundled catalogue they're seeded
 *      from) and are filtered by ordinary code first — allergies, diet,
 *      equipment, skill — then ranked. No AI involved.
 *   2. Only the top 30 candidates go to the model, as short summaries (id,
 *      title, cuisine, time, skill, main proteins, what to buy). No
 *      ingredient amounts, steps, prices or anything about the person.
 *   3. The answer must be JSON naming only those recipe ids and the open
 *      dates; it's validated before use. Anything missing is filled by the
 *      built-in planner, and if the AI fails the built-in plan is used.
 *   4. Tokens and an estimated cost are printed (published price only).
 *
 * Reads the key from apps/web/.env.local (AI_PROVIDER, GEMINI_API_KEY, …);
 * it never prints it.
 */
import { buildMealPlanPrompt, estimateCostMicros, planWeekWithAi, readAiSetup, type AiConfig } from "../src/index";
import { loadRecipes, loadWebEnv, nextWeek, rank, sampleProfile, flag, usd } from "./lib";

async function main() {
  const envFile = loadWebEnv();
  const setup = readAiSetup();
  const dry = flag("dry-run");
  if ("problem" in setup && !dry) {
    console.error(`AI isn't set up: ${setup.problem}\n${envFile ? `(read ${envFile})` : "No apps/web/.env.local found."}\nRun with --dry-run to see the request without calling the model.`);
    process.exit(1);
  }
  const config: AiConfig | null = "problem" in setup ? null : setup;

  const { recipes, source } = await loadRecipes();
  // Sample household: two adults, peanut allergy, avoids cilantro, skill 3, budget-minded.
  const profile = sampleProfile((p) => {
    p.diet.allergies = ["peanut"];
    p.diet.neverRecommend = ["cilantro"];
    p.budget.priority = "budget_first";
  });
  const today = new Date().toISOString().slice(0, 10);
  const days = nextWeek();
  const candidates = rank(recipes, profile, today);
  const input = { days, candidates, mode: "balanced" as const, goals: profile.goals.ranked, servings: profile.household.cookingFor };
  const prompt = buildMealPlanPrompt({ ...input, skillLevel: profile.skillLevel, householdSize: profile.household.cookingFor });

  console.log(`Recipes: ${source}`);
  console.log(`Filtered by code for the sample household: ${candidates.length} suitable, ${prompt.candidates.length} sent to the model.`);
  const approxIn = Math.round((prompt.user.length + 1800) / 4);
  console.log(`Request size: ${prompt.user.length.toLocaleString()} characters (≈${approxIn.toLocaleString()} input tokens, estimated at 4 characters per token).`);
  if (config?.price) console.log(`Estimated cost before calling: ≈${usd(estimateCostMicros(config.price, { inputTokens: approxIn, outputTokens: 450 })!)} (≈450 output tokens).`);

  if (dry || !config) {
    console.log("\n--dry-run: no AI call made. First 1,500 characters of what would be sent:\n");
    console.log(prompt.user.slice(0, 1500));
    return;
  }

  console.log(`\nAsking ${config.provider} (${config.model})…`);
  const started = Date.now();
  const r = await planWeekWithAi({ config, input, skillLevel: profile.skillLevel, householdSize: profile.household.cookingFor, cacheScope: "poc" });
  const ms = Date.now() - started;
  const byId = new Map(recipes.map((x) => [x.id, x]));
  console.log(`\nPlan for the week of ${days[0]} — ${r.source === "ai" ? "chosen by the AI and validated" : "built-in planner (AI fallback)"} in ${(ms / 1000).toFixed(1)} s`);
  if (r.notice) console.log(`Note: ${r.notice}`);
  for (const p of r.picks) {
    const rec = byId.get(p.recipeId);
    const day = new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    console.log(`  ${day} ${p.date}  ${rec?.title ?? p.recipeId}  (${rec?.cuisine ?? "?"}, ${rec?.totalMinutes ?? "?"} min, skill ${rec?.skillLevel ?? "?"})\n                 ${p.note}`);
  }
  if (r.unfilled.length) console.log(`  Not filled: ${r.unfilled.join(", ")}`);
  console.log(`\nSummary: ${r.summary}`);
  if (r.usage) {
    const cost = estimateCostMicros(config.price, r.usage);
    console.log(`Tokens: ${r.usage.inputTokens} in, ${r.usage.outputTokens} out. Estimated cost: ${cost === null ? "unknown (no published price set)" : usd(cost)}${config.price ? ` at $${config.price.inputPerMillion}/$${config.price.outputPerMillion} per million tokens` : ""}.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
