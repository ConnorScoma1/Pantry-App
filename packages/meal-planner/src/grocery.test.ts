import { strict as assert } from "node:assert";
import { test } from "node:test";
import { testKitchenRecipes } from "@kitchen-pantry/recipe-engine";
import type { PantryItem } from "@kitchen-pantry/shared-types";
import { buildGroceryList, departmentFor, formatQuantity } from "./index";

const r = (slug: string) => testKitchenRecipes.find((x) => x.slug === slug)!;
function item(name: string, patch: Partial<PantryItem> = {}): PantryItem {
  return {
    id: name, ingredientId: null, name, category: "other", quantity: null, unit: null, storageLocation: "fridge",
    purchasedOn: null, useBy: null, openedOn: null, estimatedRemainingPct: null, pricePaidCents: null, isStaple: false,
    createdAt: "", updatedAt: "", ...patch,
  };
}
const TODAY = "2026-11-09";

test("friendly amounts in US kitchen units", () => {
  assert.equal(formatQuantity({ value: 680.39, unit: "g" }), "1½ lb");
  assert.equal(formatQuantity({ value: 226.8, unit: "g" }), "8 oz");
  assert.equal(formatQuantity({ value: 354.88, unit: "ml" }), "1½ cups");
  assert.equal(formatQuantity({ value: 29.57, unit: "ml" }), "2 tbsp");
  assert.equal(formatQuantity({ value: 4.93, unit: "ml" }), "1 tsp");
  assert.equal(formatQuantity({ value: 3, unit: "each" }), "3");
  assert.equal(formatQuantity({ value: 4, unit: "clove" }), "4 cloves");
});

test("departments come from the staple list or a category guess", () => {
  assert.equal(departmentFor("kosher salt"), "spices");
  assert.equal(departmentFor("baby spinach"), "produce");
  assert.equal(departmentFor("fresh dill"), "produce");
  assert.equal(departmentFor("boneless chicken thighs"), "meat_seafood");
  assert.equal(departmentFor("heavy cream"), "dairy");
});

test("the same ingredient across meals becomes one line, scaled to servings", () => {
  const garlic = r("creamy-garlic-chicken-spinach-parmesan");
  const penne = r("creamy-tomato-spinach-penne");
  const single = buildGroceryList({ meals: [{ recipe: garlic, servings: garlic.servings }], pantry: [], today: TODAY });
  const cream1 = single.toBuy.find((l) => l.key === "heavy cream")!;
  const both = buildGroceryList({
    meals: [{ recipe: garlic, servings: garlic.servings * 2 }, { recipe: penne, servings: penne.servings }],
    pantry: [],
    today: TODAY,
  });
  const cream = both.toBuy.find((l) => l.key === "heavy cream")!;
  assert.deepEqual(cream.neededFor, [penne.title, garlic.title].sort());
  assert.ok(cream.quantities[0]!.value > cream1.quantities[0]!.value * 2 - 1e-6, "doubled servings plus the penne");
  assert.equal(both.toBuy.filter((l) => l.key === "heavy cream").length, 1);
  assert.equal(cream.status, "buy");
});

test("tracked kitchen amounts are subtracted; covered items move to 'in your kitchen'", () => {
  const garlic = r("creamy-garlic-chicken-spinach-parmesan"); // 1½ lb chicken thighs for 4
  const half = buildGroceryList({
    meals: [{ recipe: garlic, servings: garlic.servings }],
    pantry: [item("Chicken thighs", { quantity: 1, unit: "lb" })],
    today: TODAY,
  });
  const chicken = half.toBuy.find((l) => l.key.includes("chicken thighs"))!;
  assert.equal(chicken.amount, "8 oz");
  assert.match(chicken.note!, /already in your kitchen/);
  const full = buildGroceryList({
    meals: [{ recipe: garlic, servings: garlic.servings }],
    pantry: [item("Chicken thighs", { quantity: 2, unit: "lb" })],
    today: TODAY,
  });
  assert.ok(full.inKitchen.some((l) => l.key.includes("chicken thighs")));
  assert.ok(!full.toBuy.some((l) => l.key.includes("chicken thighs")));
});

test("untracked kitchen items: staples are covered, fresh food asks you to check", () => {
  const garlic = r("creamy-garlic-chicken-spinach-parmesan");
  const list = buildGroceryList({
    meals: [{ recipe: garlic, servings: garlic.servings }],
    pantry: [item("Kosher salt", { isStaple: true }), item("Baby spinach")],
    today: TODAY,
  });
  assert.ok(list.inKitchen.some((l) => l.key === "kosher salt"));
  const spinach = list.toBuy.find((l) => l.key === "baby spinach")!;
  assert.equal(spinach.status, "check");
});

test("expired kitchen items don't count", () => {
  const garlic = r("creamy-garlic-chicken-spinach-parmesan");
  const list = buildGroceryList({
    meals: [{ recipe: garlic, servings: garlic.servings }],
    pantry: [item("Heavy cream", { quantity: 2, unit: "cup", useBy: "2026-11-01" })],
    today: TODAY,
  });
  assert.equal(list.toBuy.find((l) => l.key === "heavy cream")!.status, "buy");
});

test("optional-only ingredients stay off the list", () => {
  const honey = r("honey-garlic-chicken-broccoli");
  const list = buildGroceryList({ meals: [{ recipe: honey, servings: honey.servings }], pantry: [], today: TODAY });
  const optional = honey.ingredients.filter((i) => i.optional).map((i) => i.item.toLowerCase());
  assert.ok(optional.length > 0);
  for (const o of optional) assert.ok(!list.toBuy.some((l) => l.key === o), o);
});
