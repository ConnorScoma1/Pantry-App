import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import { chooseDinnerDays, type PlanWeekInput } from "@kitchen-pantry/meal-planner";
import { rankRecipes, testKitchenRecipes } from "@kitchen-pantry/recipe-engine";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import {
  ANTHROPIC_API_URL,
  ANTHROPIC_VERSION,
  buildMealPlanPrompt,
  clearAiPlanCache,
  planWeekWithClaude,
  validateAiPicks,
  type AiConfig,
  type FetchLike,
} from "./index";

const WEEK = "2026-11-09";
const config: AiConfig = { apiKey: "test-key", model: "claude-sonnet-5-5", maxOutputTokens: 2048, dailyPlanLimit: 10 };

function input(patch: Partial<PlanWeekInput> = {}): PlanWeekInput {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 3;
  p.diet.allergies = ["peanut"];
  p.equipment = ["stove", "oven", "blender", "dutch_oven"];
  const candidates = rankRecipes(
    testKitchenRecipes,
    { profile: p, pantry: [], today: WEEK, favorites: new Set(), ratings: new Map(), myRatings: new Map() },
    { includeAboveSkill: true },
  ).recipes;
  return { days: chooseDinnerDays(WEEK, 3), candidates, mode: "balanced", goals: ["reduce_waste"], servings: 2, ...patch };
}

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeClaude(reply: (body: Record<string, unknown>) => { status?: number; json: unknown }) {
  const calls: Captured[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const r = reply(body);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json, headers: { get: () => "req_test" } };
  };
  return { fetchImpl, calls };
}

const ok = (meals: unknown[], summary = "A varied week that uses up what you have.") => ({
  json: {
    model: "claude-sonnet-5-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ meals, summary }) }],
    usage: { input_tokens: 1800, output_tokens: 220 },
  },
});

const id = (slug: string) => testKitchenRecipes.find((r) => r.slug === slug)!.id;

beforeEach(() => clearAiPlanCache());

test("prompt offers only safe candidates and constrains ids and dates in the schema", () => {
  const i = input();
  const { schema, candidates, user } = buildMealPlanPrompt({ ...i, skillLevel: 3, householdSize: 2 });
  const ids = candidates.map((c) => c.recipe.id);
  assert.ok(!ids.includes(id("peanut-noodles-chicken-crunchy-vegetables")), "allergen recipe never offered");
  assert.ok(!ids.includes(id("seared-scallops-beurre-blanc-pea-puree")), "above-skill recipe never offered");
  const items = (schema.properties as any).meals.items;
  assert.deepEqual(items.properties.recipeId.enum, ids);
  assert.deepEqual(items.properties.date.enum, i.days);
  assert.equal(items.additionalProperties, false);
  assert.ok(!/minLength|maxLength|minimum|maximum/.test(JSON.stringify(schema)), "only schema features structured outputs support");
  assert.ok(!user.includes("test-key"));
});

test("a valid Claude plan is used, with the right request shape", async () => {
  const i = input();
  const { fetchImpl, calls } = fakeClaude(() =>
    ok([
      { date: "2026-11-09", recipeId: id("weeknight-vegetable-fried-rice"), why: "Quick Monday dinner that uses your rice." },
      { date: "2026-11-11", recipeId: id("salmon-lemon-dill-yogurt-green-beans"), why: "Light midweek fish to vary the proteins." },
      { date: "2026-11-13", recipeId: id("mushroom-thyme-risotto"), why: "A cosy Friday project." },
    ]),
  );
  const result = await planWeekWithClaude({ config, input: i, skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  assert.equal(result.source, "ai");
  assert.equal(result.notice, null);
  assert.deepEqual(result.picks.map((p) => p.date), i.days);
  assert.equal(result.picks[0]!.note, "Quick Monday dinner that uses your rice.");
  assert.deepEqual(result.usage, { inputTokens: 1800, outputTokens: 220 });

  const call = calls[0]!;
  assert.equal(call.url, ANTHROPIC_API_URL);
  assert.equal(call.headers["x-api-key"], "test-key");
  assert.equal(call.headers["anthropic-version"], ANTHROPIC_VERSION);
  assert.equal(call.body.model, "claude-sonnet-5-5");
  assert.equal((call.body.output_config as any).format.type, "json_schema");
  assert.ok(!("temperature" in call.body) && !("tool_choice" in call.body));
});

test("invented ids, wrong dates, duplicates and price talk are rejected; gaps are filled by the planner", async () => {
  const i = input();
  const { fetchImpl } = fakeClaude(() =>
    ok([
      { date: "2026-11-09", recipeId: "00000000-0000-4000-8000-000000000999", why: "Made up" },
      { date: "2026-11-10", recipeId: id("weeknight-vegetable-fried-rice"), why: "Not an open date" },
      { date: "2026-11-11", recipeId: id("peanut-noodles-chicken-crunchy-vegetables"), why: "Allergen!" },
      { date: "2026-11-13", recipeId: id("mushroom-thyme-risotto"), why: "Only $4 a serving — cheapest option!" },
      { date: "2026-11-13", recipeId: id("salmon-lemon-dill-yogurt-green-beans"), why: "Duplicate date" },
    ]),
  );
  const result = await planWeekWithClaude({ config, input: i, skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  assert.equal(result.source, "ai");
  assert.deepEqual(result.picks.map((p) => p.date), i.days, "every open night is filled");
  const ids = result.picks.map((p) => p.recipeId);
  assert.ok(!ids.includes(id("peanut-noodles-chicken-crunchy-vegetables")));
  assert.ok(!ids.includes("00000000-0000-4000-8000-000000000999"));
  assert.equal(new Set(ids).size, ids.length);
  const risotto = result.picks.find((p) => p.recipeId === id("mushroom-thyme-risotto"))!;
  assert.equal(risotto.note, "Chosen to fit your week", "price claims are stripped");
});

test("API errors, refusals and truncation fall back to the standard plan with a plain notice", async () => {
  for (const [reply, expected] of [
    [{ status: 429, json: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } }, /busy/],
    [{ status: 500, json: { type: "error", error: { type: "api_error" } } }, /couldn't be used/],
    [{ json: { stop_reason: "refusal", content: [] } }, /couldn't be used/],
    [{ json: { stop_reason: "max_tokens", content: [{ type: "text", text: '{"meals":[' }] } }, /couldn't be used/],
    [{ json: { stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] } }, /couldn't be used/],
  ] as const) {
    clearAiPlanCache();
    const { fetchImpl } = fakeClaude(() => reply as { status?: number; json: unknown });
    const result = await planWeekWithClaude({ config, input: input(), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
    assert.equal(result.source, "rules");
    assert.match(result.notice ?? "", expected);
    assert.equal(result.picks.length, 3, "still a full week");
  }
});

test("network failures fall back too", async () => {
  const fetchImpl: FetchLike = async () => {
    throw new TypeError("fetch failed");
  };
  const result = await planWeekWithClaude({ config, input: input(), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  assert.equal(result.source, "rules");
  assert.match(result.notice!, /Couldn't reach Claude/);
});

test("no API key: deterministic plan, no notice, no network", async () => {
  let called = false;
  const fetchImpl: FetchLike = async () => {
    called = true;
    throw new Error("should not be called");
  };
  const result = await planWeekWithClaude({ config: null, input: input(), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  assert.equal(result.source, "rules");
  assert.equal(result.notice, null);
  assert.equal(called, false);
});

test("identical requests are cached per household; a new seed calls again", async () => {
  const meals = [
    { date: "2026-11-09", recipeId: id("weeknight-vegetable-fried-rice"), why: "Quick." },
    { date: "2026-11-11", recipeId: id("salmon-lemon-dill-yogurt-green-beans"), why: "Fish night." },
    { date: "2026-11-13", recipeId: id("mushroom-thyme-risotto"), why: "Friday treat." },
  ];
  const { fetchImpl, calls } = fakeClaude(() => ok(meals));
  const a = await planWeekWithClaude({ config, input: input({ seed: 1 }), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  const b = await planWeekWithClaude({ config, input: input({ seed: 1 }), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  assert.equal(calls.length, 1);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  await planWeekWithClaude({ config, input: input({ seed: 1 }), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h2" });
  await planWeekWithClaude({ config, input: input({ seed: 2 }), skillLevel: 3, householdSize: 2, fetchImpl, cacheScope: "h1" });
  assert.equal(calls.length, 3, "other households and regenerations are never served from this cache");
});

test("validateAiPicks keeps locked meals out of the week", () => {
  const locked = id("mushroom-thyme-risotto");
  const { picks, rejected } = validateAiPicks(
    { meals: [{ date: "2026-11-09", recipeId: locked, why: "x" }], summary: "s" },
    new Set([locked]),
    ["2026-11-09"],
    new Set([locked]),
    2,
  );
  assert.equal(picks.length, 0);
  assert.equal(rejected, 1);
});

test("cook the specials: Claude sees which candidates use sale items (no prices)", () => {
  const specials = [{
    id: "kroger:1", provider: "kroger", retailer: "kroger", storeId: "01400376", productId: "1", name: "Kroger Boneless Skinless Chicken Thighs", brand: "Kroger",
    sizeLabel: null, department: "meat_seafood" as const, matchedTerm: "boneless chicken thighs", regularCents: 899, saleCents: 599, percentOff: 33,
    soldByWeight: false, unitPrice: null, promoType: "sale" as const, requiresMembership: null, requiresCoupon: null, endsOn: null, sourceUrl: null,
    availability: "in_stock" as const, observedAt: "2026-11-08T18:00:00Z",
  }];
  const { user } = buildMealPlanPrompt({ ...input({ mode: "cook_the_specials", specials }), skillLevel: 3, householdSize: 2 });
  const body = JSON.parse(user) as { planningMode: { guidance: string }; candidates: Array<{ title: string; onSale?: Array<{ ingredient: string; percentOff: number }> }> };
  assert.match(body.planningMode.guidance, /never quote prices/);
  const chicken = body.candidates.find((c) => c.onSale && c.onSale.length > 0);
  assert.deepEqual(chicken?.onSale, [{ ingredient: "boneless chicken thighs", percentOff: 33 }]);
  assert.ok(!user.includes("599") && !user.includes("899"), "no prices in the prompt");
  const balanced = buildMealPlanPrompt({ ...input({ mode: "balanced", specials }), skillLevel: 3, householdSize: 2 });
  assert.ok(!balanced.user.includes("onSale"));
});
