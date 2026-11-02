import assert from "node:assert/strict";
import { test } from "node:test";
import type { PantryItem, Recipe } from "@kitchen-pantry/shared-types";
import { kitchenUpdatesAfterCooking } from "./index";

const now = "2026-11-01T00:00:00Z";
const item = (id: string, name: string, quantity: number | null, unit: string | null, extra: Partial<PantryItem> = {}): PantryItem => ({
  id, ingredientId: null, name, category: "other", quantity, unit, storageLocation: "fridge", purchasedOn: null, useBy: null, openedOn: null,
  estimatedRemainingPct: null, pricePaidCents: null, isStaple: false, createdAt: now, updatedAt: now, ...extra,
});
const ing = (item: string, quantity: number | null, unit: string | null) => ({ position: 1, component: null, quantity, unit, item, preparation: null, optional: false });
const recipe: Pick<Recipe, "ingredients"> = {
  ingredients: [ing("boneless chicken thighs", 1.5, "lb"), ing("heavy cream", 0.5, "cup"), ing("large eggs", 2, null), ing("baby spinach", 4, "cup"), ing("kosher salt", 1, "tsp"), ing("water", 1, "cup")],
};

test("after cooking: subtracts comparable amounts, asks about the rest, leaves staples alone", () => {
  const pantry = [
    item("c", "chicken thighs", 2, "lb"),
    item("cr", "heavy cream", 16, "fl oz"),
    item("e", "eggs", 2, "each"),
    item("s", "baby spinach", 5, "oz"),
    item("salt", "kosher salt", null, null, { isStaple: true }),
  ];
  const u = kitchenUpdatesAfterCooking(recipe, 1, pantry, "2026-11-02");
  const by = new Map(u.map((x) => [x.item.id, x]));
  assert.equal(by.get("c")!.kind, "reduce");
  assert.equal(by.get("c")!.remaining, 0.5);
  assert.equal(by.get("cr")!.remaining, 12); // half a cup = 4 fl oz
  assert.equal(by.get("e")!.kind, "use_up");
  assert.equal(by.get("s")!.kind, "ask"); // cups of spinach vs an ounce bag: never guessed
  assert.equal(by.get("s")!.selected, false);
  assert.ok(!by.has("salt"));
});

test("after cooking: scales with servings, uses the older pack, skips expired food", () => {
  const pantry = [item("new", "chicken thighs", 3, "lb", { useBy: "2026-11-09" }), item("old", "chicken thighs", 3, "lb", { useBy: "2026-11-03" }), item("bad", "heavy cream", 16, "fl oz", { useBy: "2026-10-20" })];
  const u = kitchenUpdatesAfterCooking(recipe, 2, pantry, "2026-11-02");
  assert.equal(u.length, 1);
  assert.equal(u[0]!.item.id, "old");
  assert.equal(u[0]!.kind, "use_up");
  assert.match(u[0]!.lines[0]!, /3 lb/);
});
