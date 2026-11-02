import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RecipeRating } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { rankRecipes, tasteFit, tasteProfile, testKitchenRecipes, type RankingContext } from "./index";

const bySlug = (s: string) => testKitchenRecipes.find((r) => r.slug === s)!;
const rate = (slug: string, overall: number, wouldCookAgain: boolean | null = null): RecipeRating => ({
  recipeId: bySlug(slug).id, overall, flavor: null, difficulty: null, wouldCookAgain, actualMinutes: null, familyApproval: null, notes: null, createdAt: "2026-10-01T18:00:00Z",
});
const profile = (() => {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven", "air_fryer"];
  return p;
})();
const ctx = (ratings: RecipeRating[]): RankingContext => ({
  profile, pantry: [], today: "2026-11-01", favorites: new Set(), ratings: new Map(), myRatings: new Map(ratings.map((r) => [r.recipeId, r])),
});

test("taste: learned only from the household's own ratings, shrunk so one rating can't swing it", () => {
  const empty = tasteProfile(testKitchenRecipes, new Map());
  assert.equal(empty.evidence, 0);
  assert.deepEqual(tasteFit(bySlug("mushroom-thyme-risotto"), empty), { points: 0, reason: null });

  const one = tasteProfile(testKitchenRecipes, ctx([rate("creamy-tomato-spinach-penne", 5, true)]).myRatings);
  const risotto = tasteFit(bySlug("mushroom-thyme-risotto"), one);
  assert.equal(risotto.reason, null, "one rating isn't enough to claim a taste");
  assert.ok(risotto.points > 0);
});

test("taste: two loved Italian dinners lift other Italian dishes and say why; bad ratings sink a cuisine", () => {
  const loved = ctx([rate("creamy-tomato-spinach-penne", 5, true), rate("creamy-garlic-chicken-spinach-parmesan", 5, true)]);
  const italian = bySlug("mushroom-thyme-risotto");
  assert.equal(italian.cuisine, "italian");
  const withTaste = rankRecipes(testKitchenRecipes, loved, { includeAboveSkill: true }).recipes.find((r) => r.recipe.id === italian.id)!;
  const without = rankRecipes(testKitchenRecipes, { ...loved, taste: null }, { includeAboveSkill: true }).recipes.find((r) => r.recipe.id === italian.id)!;
  assert.ok(withTaste.score > without.score);
  assert.ok(withTaste.reasons.includes("You've enjoyed similar Italian dishes"));

  const disliked = tasteProfile(testKitchenRecipes, ctx([rate("creamy-tomato-spinach-penne", 1, false), rate("creamy-garlic-chicken-spinach-parmesan", 2, false)]).myRatings);
  const fit = tasteFit(italian, disliked);
  assert.ok(fit.points < 0 && fit.points >= -12 && fit.reason === null, "a quiet, bounded sink — no scolding");
});
