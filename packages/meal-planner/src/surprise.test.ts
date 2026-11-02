import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RecipeCost, Special } from "@kitchen-pantry/grocery-pricing";
import { rankRecipes, tasteProfile, testKitchenRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import type { PantryItem, RecipeRating, RecommendationEvent } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { explainPick, recipeCostInput, surpriseHistory, surpriseMe, type SurpriseInput } from "./index";

const TODAY = "2026-11-10";
const bySlug = (s: string) => testKitchenRecipes.find((r) => r.slug === s)!;
const profile = (() => {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven", "air_fryer"];
  return p;
})();
const pantryItem = (name: string, useBy: string | null = null): PantryItem => ({
  id: name, ingredientId: null, name, category: "other", quantity: null, unit: null, storageLocation: "fridge", purchasedOn: null, useBy, openedOn: null,
  estimatedRemainingPct: null, pricePaidCents: null, isStaple: false, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
});
const rating = (slug: string, overall: number, day: string): RecipeRating => ({
  recipeId: bySlug(slug).id, overall, flavor: null, difficulty: null, wouldCookAgain: overall >= 4, actualMinutes: null, familyApproval: null, notes: null, createdAt: `${day}T19:00:00Z`,
});

function setup(ratings: RecipeRating[] = [], pantry: PantryItem[] = [], favorites: string[] = []) {
  const myRatings = new Map(ratings.map((r) => [r.recipeId, r]));
  const ctx: RankingContext = { profile, pantry, today: TODAY, favorites: new Set(favorites), ratings: new Map(), myRatings };
  const ranked = rankRecipes(testKitchenRecipes, ctx, { includeAboveSkill: true }).recipes;
  return { ranked, myRatings, taste: tasteProfile(testKitchenRecipes, myRatings) };
}
const base = (s: ReturnType<typeof setup>, kind: SurpriseInput["kind"], events: RecommendationEvent[] = []): SurpriseInput => ({
  kind, ranked: s.ranked, history: surpriseHistory(events, s.myRatings), today: TODAY, skillLevel: 3, taste: s.taste, myRatings: s.myRatings,
});

test("surprise: never cooked skips anything made before; no repeats of recent suggestions", () => {
  const s = setup([rating("honey-garlic-chicken-broccoli", 4, "2026-09-01")]);
  const r = surpriseMe(base(s, "never_cooked"));
  assert.equal(r.picks.length, 3);
  assert.ok(r.picks.every((p) => p.ranked.recipe.slug !== "honey-garlic-chicken-broccoli"));
  assert.ok(r.picks.every((p) => p.why.includes("you haven't made it before")));
  assert.ok(r.picks.every((p) => p.ranked.recipe.course !== "dessert" && !p.ranked.aboveSkill));

  const shown: RecommendationEvent[] = r.picks.map((p) => ({ recipeId: p.ranked.recipe.id, event: "shown", surface: "surprise", createdAt: "2026-11-05T12:00:00Z" }));
  const again = surpriseMe(base(s, "never_cooked", shown));
  assert.ok(again.picks.every((p) => !r.picks.some((q) => q.ranked.recipe.id === p.ranked.recipe.id)), "shown in the last two weeks → not repeated");
  const old = shown.map((e) => ({ ...e, createdAt: "2026-10-01T12:00:00Z" }));
  assert.ok(surpriseMe(base(s, "never_cooked", old)).picks.some((p) => r.picks.some((q) => q.ranked.recipe.id === p.ranked.recipe.id)), "after two weeks they can come back");
});

test("surprise: 'popular' never invents ratings — it says so and offers the household's own hits", () => {
  const s = setup([rating("creamy-tomato-spinach-penne", 5, "2026-09-01")]);
  const r = surpriseMe(base(s, "popular"));
  assert.match(r.note!, /No recipe has at least 20 ratings yet/);
  assert.deepEqual(r.picks.map((p) => p.ranked.recipe.slug), ["creamy-tomato-spinach-penne"]);
  assert.match(r.picks[0]!.why, /your household gave it 5★/);
});

test("surprise: restaurant quality allows one step up, and says so", () => {
  const s = setup();
  const r = surpriseMe(base(s, "restaurant"));
  assert.ok(r.picks.length > 0);
  assert.ok(r.picks.every((p) => p.ranked.recipe.skillLevel <= 4));
  assert.ok(r.picks.some((p) => /one step up/.test(p.why)));
});

test("surprise: uses what I have — pantry first, with a reason the person can check", () => {
  const s = setup([], [pantryItem("Boneless chicken thighs", "2026-11-11"), pantryItem("Broccoli"), pantryItem("Garlic"), pantryItem("Soy sauce"), pantryItem("Honey")]);
  const r = surpriseMe(base(s, "use_what_i_have"));
  assert.equal(r.picks[0]!.ranked.recipe.slug, "honey-garlic-chicken-broccoli");
  assert.match(r.picks[0]!.why, /uses up your boneless chicken thighs before it goes off/);
  assert.match(r.picks[0]!.why, /you already have/);
});

test("surprise: specials and under-$5 need a store and real prices; they say what's missing", () => {
  const s = setup();
  assert.equal(surpriseMe(base(s, "specials")).needs, "store");
  assert.equal(surpriseMe({ ...base(s, "under_5"), storeName: "Pick 'n Save" }).needs, "prices");
  const special: Special = {
    id: "kroger:1", provider: "kroger", retailer: "kroger", storeId: "x", productId: "1", name: "Kroger Boneless Skinless Chicken Thighs", brand: null, sizeLabel: null,
    department: "meat_seafood", matchedTerm: "boneless chicken thighs", regularCents: 899, saleCents: 599, percentOff: 33, soldByWeight: false, unitPrice: null, promoType: "sale",
    requiresMembership: null, requiresCoupon: null, endsOn: null, sourceUrl: null, availability: "in_stock", observedAt: "2026-11-10T12:00:00Z",
  };
  const sale = surpriseMe({ ...base(s, "specials"), storeName: "Pick 'n Save", specials: [special] });
  assert.ok(sale.picks.length > 0 && sale.picks.every((p) => /boneless chicken thighs are on sale at Pick 'n Save/.test(p.why)));

  const cheap = bySlug("air-fryer-crispy-chickpea-tacos");
  const costs = new Map<string, RecipeCost>([
    [cheap.id, { id: cheap.id, perServingCents: 310, totalCents: 1240, pricedCount: 6, unpriced: [], complete: true, observedAt: "2026-11-10T12:00:00Z" }],
    [bySlug("red-wine-braised-short-ribs").id, { id: "x", perServingCents: 900, totalCents: 3600, pricedCount: 8, unpriced: [], complete: true, observedAt: null }],
  ]);
  const under = surpriseMe({ ...base(s, "under_5"), storeName: "Pick 'n Save", costs });
  assert.deepEqual(under.picks.map((p) => [p.ranked.recipe.slug, p.costPerServingCents]), [["air-fryer-crispy-chickpea-tacos", 310]]);
  assert.match(under.picks[0]!.why, /about \$3\.10 a serving at Pick 'n Save/);
  assert.match(under.note!, /Cost of the amounts used/);
});

test("surprise: a new cuisine — one idea per cuisine you haven't cooked lately", () => {
  const s = setup([rating("honey-garlic-chicken-broccoli", 4, "2026-11-01"), rating("creamy-tomato-spinach-penne", 4, "2026-08-01")]);
  const r = surpriseMe(base(s, "new_cuisine"));
  const cuisines = r.picks.map((p) => p.ranked.recipe.cuisine);
  assert.equal(new Set(cuisines).size, cuisines.length);
  assert.ok(!cuisines.includes("chinese"), "cooked Chinese this month");
  const italian = surpriseMe({ ...base(s, "new_cuisine"), count: 10 }).picks.find((p) => p.ranked.recipe.cuisine === "italian");
  assert.match(italian!.why, /you haven't cooked Italian in the last month/);
});

test("surprise: explanations read like the spec's example; cost inputs leave out basics", () => {
  const s = setup([], [pantryItem("Garlic")]);
  const r = s.ranked.find((x) => x.recipe.slug === "creamy-garlic-chicken-spinach-parmesan")!;
  assert.match(explainPick(r, { lead: "you haven't made it before" }), /^You're getting this because you haven't made it before and you already have garlic\.$/);
  const input = recipeCostInput(bySlug("honey-garlic-chicken-broccoli"));
  assert.ok(input.ingredients.every((i) => !/^(kosher salt|black pepper|olive oil|vegetable oil)$/i.test(i.name)));
  assert.ok(input.ingredients.some((i) => i.name === "boneless chicken thighs" && i.quantity?.unit === "g"));
});
