import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { catalogRecipes, dietConflicts, isCookable, rankRecipes, screenAllergens } from "./index";

function defaultOnboardingProfileForTest(): OnboardingProfile {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 1;
  p.equipment = ["stove", "oven"];
  return p;
}

test("vegan: plant milks and nut butters are fine; dairy and eggs by any name are not", () => {
  const ok = ["13.5 oz canned coconut milk", "2 tbsp peanut butter", "1 cup oat milk", "0.5 tsp cream of tartar", "1 tbsp coconut cream"];
  assert.deepEqual(dietConflicts(ok, "vegan"), []);
  for (const bad of ["2 tbsp unsalted butter", "0.5 cup Parmesan cheese", "1 cup cheddar", "2 eggs", "1 cup whole milk", "0.5 cup heavy cream", "2 tbsp honey"]) {
    assert.equal(dietConflicts([bad], "vegan").length, 1, bad);
  }
  assert.deepEqual(dietConflicts(["13.5 oz canned coconut milk"], "omnivore", ["dairy_free"]), []);
});

test("beginner dinners: a skill-1 cook with a basic kitchen can fill a week without repeats", () => {
  const p = defaultOnboardingProfileForTest();
  const ranked = rankRecipes(catalogRecipes.filter(isCookable), { profile: p, pantry: [], today: "2026-11-02", favorites: new Set(), ratings: new Map(), myRatings: new Map(), seasonal: null, taste: null }).recipes;
  assert.ok(ranked.length >= 14, `only ${ranked.length} dinners`);
  assert.ok(ranked.every((r) => r.recipe.skillLevel === 1));
  const vegetarian = rankRecipes(catalogRecipes.filter(isCookable), { profile: { ...p, diet: { ...p.diet, style: "vegetarian" } }, pantry: [], today: "2026-11-02", favorites: new Set(), ratings: new Map(), myRatings: new Map(), seasonal: null, taste: null }).recipes;
  assert.ok(vegetarian.length >= 7, `only ${vegetarian.length} vegetarian dinners`);
});

test("goat is meat, goat cheese is not; teff flour is not wheat", () => {
  assert.ok(dietConflicts(["2 lb bone-in goat, cut into chunks"], "vegetarian", []).length > 0);
  assert.deepEqual(dietConflicts(["4 oz goat cheese, crumbled", "1 cup goat's milk"], "vegetarian", []), []);
  assert.deepEqual(screenAllergens(["3 cups teff flour"], ["wheat", "gluten"]).conflicts, []);
});

test("fish and vegetable steaks aren't beef; hamburger buns aren't ham; green beans aren't a bean protein", () => {
  assert.deepEqual(dietConflicts(["4 salmon steaks", "1 cauliflower steak"], "pescatarian", []), []);
  assert.deepEqual(dietConflicts(["4 potato hamburger buns"], "vegetarian", []), []);
  assert.ok(dietConflicts(["1 lb flank steak"], "pescatarian", []).length > 0);
});
