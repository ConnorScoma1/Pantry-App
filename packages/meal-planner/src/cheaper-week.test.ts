import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RecipeCost } from "@kitchen-pantry/grocery-pricing";
import { rankRecipes, testKitchenRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { cheaperSwaps, cheaperWeekToPrice, type CheaperWeekMeal } from "./index";

const profile = (() => {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 5;
  p.equipment = ["stove", "oven", "blender", "dutch_oven", "air_fryer"];
  return p;
})();
const ctx: RankingContext = { profile, pantry: [], today: "2026-11-10", favorites: new Set(), ratings: new Map(), myRatings: new Map() };
const ranked = rankRecipes(testKitchenRecipes, ctx).recipes.filter((r) => (r.recipe.course ?? "main") === "main");
const byId = new Map(ranked.map((r) => [r.recipe.id, r]));
const cost = (id: string, perServing: number | null, complete = true, unpriced = complete ? 0 : 1): RecipeCost => ({ id, perServingCents: perServing, totalCents: (perServing ?? 0) * 4, pricedCount: 5, unpriced: Array.from({ length: unpriced }, (_, i) => `x${i}`), complete, observedAt: "2026-11-10T12:00:00Z" });

const [a, b, c, d] = ranked;
const meals: CheaperWeekMeal[] = [
  { date: "2026-11-10", recipeId: a!.recipe.id, servings: 4, locked: false },
  { date: "2026-11-11", recipeId: b!.recipe.id, servings: 4, locked: true },
];

test("cheaper week: suggests a fully priced, similar-quality swap and says what it saves", () => {
  const costs = new Map([[a!.recipe.id, cost(a!.recipe.id, 500)], [b!.recipe.id, cost(b!.recipe.id, 900)], [c!.recipe.id, cost(c!.recipe.id, 250)]]);
  const s = cheaperSwaps(meals, byId, ranked, costs, { scoreMargin: 1000 });
  assert.equal(s.length, 1);
  assert.equal(s[0]!.to.recipe.id, c!.recipe.id);
  assert.equal(s[0]!.savingCents, 1000);
  // The locked night is never touched, even though it's the dearest.
  assert.ok(s.every((x) => x.date !== "2026-11-11"));
});

test("cheaper week: labels how sure each saving is, and refuses shaky comparisons", () => {
  // Partly priced swap with more unknowns than the meal it replaces: refused.
  const shaky = new Map([[a!.recipe.id, cost(a!.recipe.id, 500)], [c!.recipe.id, cost(c!.recipe.id, 100, false)], [d!.recipe.id, cost(d!.recipe.id, 450)]]);
  assert.equal(cheaperSwaps(meals, byId, ranked, shaky, { scoreMargin: 1000 }).length, 0);
  // A partly priced planned meal can only cost more, so the saving is "at least".
  const fromPartial = new Map([[a!.recipe.id, cost(a!.recipe.id, 500, false)], [c!.recipe.id, cost(c!.recipe.id, 200)]]);
  assert.equal(cheaperSwaps(meals, byId, ranked, fromPartial, { scoreMargin: 1000 })[0]!.confidence, "at_least");
  // Both partly priced, mostly priced, new one no worse covered, big gap: an estimate.
  const both = new Map([[a!.recipe.id, cost(a!.recipe.id, 600, false, 2)], [c!.recipe.id, cost(c!.recipe.id, 300, false, 1)]]);
  const e = cheaperSwaps(meals, byId, ranked, both, { scoreMargin: 1000 });
  assert.equal(e[0]!.confidence, "estimate");
  assert.deepEqual(e[0]!.toUnpriced, ["x0"]);
  // …but not when too little of it is priced.
  const thin = new Map([[a!.recipe.id, cost(a!.recipe.id, 600, false, 4)], [c!.recipe.id, cost(c!.recipe.id, 300, false, 3)]]);
  assert.equal(cheaperSwaps(meals, byId, ranked, thin, { scoreMargin: 1000 }).length, 0);
  const cheap = new Map([[a!.recipe.id, cost(a!.recipe.id, 500)], [c!.recipe.id, cost(c!.recipe.id, 200)]]);
  assert.equal(cheaperSwaps(meals, byId, ranked, cheap, { scoreMargin: 1000, favourites: new Set([a!.recipe.id]) }).length, 0);
});

test("cheaper week: a much lower-scoring recipe isn't offered", () => {
  const worst = ranked[ranked.length - 1]!;
  const costs = new Map([[a!.recipe.id, cost(a!.recipe.id, 900)], [worst.recipe.id, cost(worst.recipe.id, 100)]]);
  const s = cheaperSwaps(meals, byId, ranked, costs, { scoreMargin: 0 });
  assert.ok(s.every((x) => x.to.score >= x.from.score));
});

test("cheaper week: prices at most 8 planned meals and 8 alternatives not already planned", () => {
  const p = cheaperWeekToPrice(meals, ranked);
  assert.deepEqual(p.planned, [a!.recipe.id]);
  assert.ok(p.alternatives.length <= 8 && !p.alternatives.includes(a!.recipe.id) && !p.alternatives.includes(b!.recipe.id));
});
