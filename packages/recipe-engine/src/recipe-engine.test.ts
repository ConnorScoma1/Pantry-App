import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  checkEligibility,
  checkEquipment,
  matchesAnyTerm,
  recommendationLabel,
  screenAllergens,
} from "./index";

test("dairy aliases are caught", () => {
  const r = screenAllergens(["1 cup heavy cream", "2 tbsp whey protein", "Parmesan, grated"], ["milk"]);
  assert.equal(r.conflicts.length, 3);
  assert.equal(r.certifiedAllergenFree, false);
});

test("non-dairy look-alikes are not flagged as dairy", () => {
  const r = screenAllergens(
    ["1 can coconut milk", "1/2 tsp cream of tartar", "2 tbsp peanut butter", "1 butternut squash"],
    ["milk"],
  );
  assert.deepEqual(r.conflicts, []);
});

test("eggplant is not egg, buckwheat is not wheat", () => {
  assert.deepEqual(screenAllergens(["1 eggplant"], ["egg"]).conflicts, []);
  assert.deepEqual(screenAllergens(["1 cup buckwheat groats"], ["wheat"]).conflicts, []);
  assert.equal(screenAllergens(["2 large eggs"], ["egg"]).conflicts.length, 1);
});

test("hidden sources are caught: soy sauce has wheat, worcestershire has fish", () => {
  assert.equal(screenAllergens(["3 tbsp soy sauce"], ["gluten"]).conflicts.length, 1);
  assert.equal(screenAllergens(["1 tsp Worcestershire sauce"], ["fish"]).conflicts.length, 1);
  assert.equal(screenAllergens(["2 tbsp tahini"], ["sesame"]).conflicts.length, 1);
  assert.equal(screenAllergens(["1/4 cup pesto"], ["tree_nut"]).conflicts.length, 1);
});

test("almond flour is a tree nut but not wheat", () => {
  assert.deepEqual(screenAllergens(["2 cups almond flour"], ["wheat"]).conflicts, []);
  assert.equal(screenAllergens(["2 cups almond flour"], ["tree_nut"]).conflicts.length, 1);
});

test("cross-contact produces warnings rather than silence", () => {
  const r = screenAllergens(["1 cup rolled oats"], ["gluten"]);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.warnings.length, 1);
});

test("equipment alternatives are used only when viable", () => {
  assert.deepEqual(checkEquipment(["air_fryer"], ["oven", "stove"]), {
    ok: true,
    adaptations: [{ requires: "air_fryer", use: "oven" }],
    missing: [],
  });
  assert.equal(checkEquipment(["sous_vide"], ["oven", "stove"]).ok, false);
});

test("eligibility combines allergy, diet, exclusions, skill and equipment", () => {
  const recipe = {
    ingredientLines: ["1 lb chicken thighs", "1 cup heavy cream", "4 oz mushrooms"],
    skillLevel: 3 as const,
    requiredEquipment: ["stove" as const],
  };
  const ok = checkEligibility(recipe, {
    allergies: [],
    dietStyle: "omnivore",
    neverRecommend: [],
    maxSkillLevel: 3,
    equipment: ["stove"],
  });
  assert.ok(ok.eligible);

  const blocked = checkEligibility(recipe, {
    allergies: ["milk"],
    dietStyle: "vegetarian",
    neverRecommend: ["Mushrooms"],
    maxSkillLevel: 2,
    equipment: ["oven"],
  });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.reasons.length, 5);
});

test("free-text exclusions match plurals", () => {
  assert.deepEqual(matchesAnyTerm(["8 oz mushrooms, sliced"], ["mushroom"]), ["mushroom"]);
});

test("ratings are never invented", () => {
  assert.equal(recommendationLabel(null, "original"), "editorial");
  assert.equal(recommendationLabel(null, "ai_generated"), "ai_suggestion");
  assert.equal(recommendationLabel({ average: 4.9, count: 3 }, "licensed_api"), "few_ratings");
  assert.equal(recommendationLabel({ average: 4.6, count: 250 }, "licensed_api"), "community_rated");
});
