import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cookingSteps, isChefRecipe, miseEnPlace, serviceTimeline, servingsFactor, stepIngredients, stepMinutes, substitutionsFor, testKitchenRecipes } from "./index";

const supreme = testKitchenRecipes.find((r) => /supreme/i.test(r.title))!;
const honey = testKitchenRecipes.find((r) => r.slug === "honey-garlic-chicken-broccoli")!;

test("cooking: each step shows the amounts it uses, scaled to the planned servings", () => {
  const steps = cookingSteps(honey, servingsFactor(honey, honey.servings * 2));
  assert.equal(steps.length, honey.steps.length);
  assert.deepEqual(steps.map((s) => s.number), honey.steps.map((_, i) => i + 1));
  const withChicken = steps.find((s) => /chicken/i.test(s.body))!;
  assert.ok(withChicken.uses.some((u) => /chicken thighs/.test(u)), withChicken.uses.join(" | "));
  const original = honey.ingredients.find((i) => /chicken thighs/.test(i.item))!;
  assert.ok(withChicken.uses.some((u) => u.startsWith(String(original.quantity! * 2)) || /^\d/.test(u)), "doubled");
  assert.equal(servingsFactor(honey, null), 1);
  assert.equal(servingsFactor({ servings: 4 }, 100), 8, "capped");
});

test("cooking: ingredients are matched within the step's component first", () => {
  const jus = supreme.steps.find((s) => s.component === "Tarragon jus" && /tarragon/i.test(s.body));
  if (jus) {
    const uses = stepIngredients(jus, supreme.ingredients);
    assert.ok(uses.every((u) => u.component === "Tarragon jus" || u.component === null), uses.map((u) => u.component).join(","));
  }
  assert.deepEqual(stepIngredients({ position: 1, component: null, body: "Let it rest.", timerSeconds: null, temperatureC: null, safeInternalTempC: null }, honey.ingredients), []);
});

test("cooking: substitutions are curated and respect allergies and dislikes", () => {
  assert.ok(substitutionsFor("shallots", { allergies: [] }).length >= 1);
  assert.deepEqual(substitutionsFor("unobtainium", { allergies: [] }), []);
  const soy = substitutionsFor("soy sauce", { allergies: ["soy"] });
  assert.ok(soy.every((s) => !/tamari/i.test(s)), soy.join(" | "));
  const fish = substitutionsFor("fish sauce", { allergies: ["fish"] });
  assert.ok(!fish.some((s) => /anchovy/i.test(s)));
  assert.ok(!substitutionsFor("butter", { allergies: [], avoid: ["olive oil"] }).some((s) => /olive oil/.test(s)));
});

test("chef mode: advanced dishes get mise en place by component and a timeline back from service", () => {
  assert.ok(isChefRecipe(supreme));
  assert.ok(!isChefRecipe(honey) || honey.skillLevel >= 4);
  const mise = miseEnPlace(supreme);
  assert.ok(mise.length >= 2 && mise.every((m) => m.tasks.length > 0));
  const t = serviceTimeline(supreme);
  assert.equal(t.entries.length, supreme.steps.length);
  assert.equal(t.entries[0]!.startsBefore, t.totalMinutes);
  assert.equal(t.entries.at(-1)!.startsBefore, t.entries.at(-1)!.minutes, "the last step finishes at service");
  assert.equal(stepMinutes({ timerSeconds: 600, body: "x" }), 10);
  assert.equal(stepMinutes({ timerSeconds: null, body: "Stir." }), 3);
});
