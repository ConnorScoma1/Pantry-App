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

test("named cheeses, custards and less common seafood are caught", () => {
  for (const line of ["1 cup Pecorino Romano, grated", "4 oz Gruyère", "6 slices provolone", "1 cup cheese curds", "0.5 cup labneh"]) {
    assert.equal(screenAllergens([line], ["milk"]).conflicts.length, 1, line);
  }
  assert.equal(screenAllergens(["1 cup hollandaise"], ["egg"]).conflicts.length, 1);
  assert.equal(screenAllergens(["1 lb salt cod (bacalhau)"], ["fish"]).conflicts.length, 1);
  assert.equal(screenAllergens(["1 tsp shrimp paste (belacan)"], ["shellfish"]).conflicts.length, 1);
  assert.equal(screenAllergens(["8 oz udon noodles", "1 tbsp Shaoxing wine"], ["wheat"]).conflicts.length, 2);
});

test("look-alike names are not flagged: butter lettuce, butter beans, oyster mushrooms, bean curd", () => {
  assert.deepEqual(screenAllergens(["1 head butter lettuce", "1 can butter beans", "4 oz bean curd"], ["milk"]).conflicts, []);
  assert.deepEqual(screenAllergens(["8 oz oyster mushrooms"], ["shellfish"]).conflicts, []);
  assert.equal(screenAllergens(["2 tbsp oyster sauce"], ["shellfish"]).conflicts.length, 1);
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

test("diet and restrictions: cuts of meat, cheese and alcohol are caught; vinegar and goat cheese aren't", async () => {
  const { dietConflicts } = await import("./index");
  assert.ok(dietConflicts(["1 lb ribeye, thinly sliced"], "vegetarian").length > 0, "ribeye is meat");
  assert.ok(dietConflicts(["2 lb flank steak"], "pescatarian").length > 0);
  assert.ok(dietConflicts(["1 cup shredded cheddar"], "vegan").length > 0, "cheddar is dairy");
  assert.ok(dietConflicts(["2 tbsp fish sauce"], "vegetarian").length > 0);
  assert.deepEqual(dietConflicts(["4 oz goat cheese", "1 cup beets"], "vegetarian"), []);
  assert.ok(dietConflicts(["8 oz spaghetti"], "omnivore", ["gluten_free"]).length > 0);
  assert.ok(dietConflicts(["1 cup whole milk"], "omnivore", ["dairy_free"]).length > 0);
  assert.ok(dietConflicts(["4 oz pancetta"], "omnivore", ["halal"]).length > 0);
  assert.ok(dietConflicts(["1/2 cup dry white wine"], "omnivore", ["halal"]).length > 0);
  assert.deepEqual(dietConflicts(["2 tbsp red wine vinegar"], "omnivore", ["halal"]), []);
  assert.ok(dietConflicts(["1 lb shrimp"], "omnivore", ["kosher"]).length > 0);
  assert.ok(dietConflicts(["1 lb ground beef", "1 cup shredded cheddar"], "omnivore", ["kosher"]).some((r) => /meat with dairy/.test(r)));
  assert.deepEqual(dietConflicts(["1 lb chicken thighs"], "omnivore", ["low_sodium", "keto"]), [], "nutrition-based restrictions aren't guessed");
});
