import assert from "node:assert/strict";
import { test } from "node:test";
import type { RecipeRating, RecommendationEvent } from "@kitchen-pantry/shared-types";
import { cookingHistory, testKitchenRecipes } from "./index";

const [a, b, c] = testKitchenRecipes;
const cooked = (recipeId: string, createdAt: string): RecommendationEvent => ({ recipeId, event: "cooked", surface: "detail", createdAt });
const rating = (recipeId: string, createdAt: string, overall: number, wouldCookAgain: boolean | null = null): RecipeRating => ({
  recipeId, overall, flavor: null, difficulty: null, wouldCookAgain, actualMinutes: null, familyApproval: null, notes: null, createdAt,
});

test("cooking history: one cook per meal, ratings attached, stats from real records", () => {
  const h = cookingHistory({
    cooked: [
      cooked(a!.id, "2026-11-01T23:00:00Z"),
      cooked(a!.id, "2026-11-01T23:20:00Z"), // finishing, then rating: same cook
      cooked(a!.id, "2026-10-20T23:00:00Z"),
      cooked(b!.id, "2026-10-25T23:00:00Z"),
      cooked("gone-recipe", "2026-10-10T23:00:00Z"),
      { recipeId: b!.id, event: "opened", surface: "detail", createdAt: "2026-10-26T10:00:00Z" },
    ],
    ratings: [rating(a!.id, "2026-11-01T23:21:00Z", 5, true), rating(c!.id, "2026-09-01T23:00:00Z", 4)],
    recipes: [a!, b!, c!],
    today: "2026-11-02",
  });
  assert.equal(h.entries.length, 5, "4 cooks + 1 rating-only cook");
  assert.equal(h.entries[0]!.recipeId, a!.id);
  assert.equal(h.entries[0]!.rating?.overall, 5);
  assert.equal(h.entries.find((e) => e.recipeId === "gone-recipe")!.recipe, null);
  assert.equal(h.stats.last30, 4);
  assert.equal(h.stats.different30, 3);
  assert.equal(h.stats.averageRating, 4.5);
  assert.deepEqual(h.stats.mostCooked.map((m) => [m.recipe.id, m.count]), [[a!.id, 2]]);
  assert.deepEqual(h.stats.topCuisines.map((x) => x.count), [2], "only cuisines cooked twice or more");
  assert.ok(h.stats.topCuisines[0]!.label.length > 0);
  // Loved but not made for 3+ weeks: c (rated 4, Sep 1). a was just made.
  assert.deepEqual(h.comeBack.map((x) => x.recipe.id), [c!.id]);
  assert.ok(h.comeBack[0]!.daysAgo >= 60);
});

test("cooking history: 'wouldn't cook again' never comes back, empty history is empty", () => {
  const h = cookingHistory({ cooked: [], ratings: [rating(a!.id, "2026-09-01T23:00:00Z", 5, false)], recipes: [a!], today: "2026-11-02" });
  assert.equal(h.comeBack.length, 0);
  const none = cookingHistory({ cooked: [], ratings: [], recipes: [], today: "2026-11-02" });
  assert.equal(none.entries.length, 0);
  assert.equal(none.stats.averageRating, null);
});
