import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PantryItem } from "@kitchen-pantry/shared-types";
import {
  filterItems,
  formatQuantity,
  groupByCategory,
  normalizeForStorage,
  remainingLabel,
  searchLocalIngredients,
  STAPLES,
  stapleChecklist,
  summarizeKitchen,
} from "./index";

const here = dirname(fileURLToPath(import.meta.url));

function item(partial: Partial<PantryItem> & { name: string }): PantryItem {
  return {
    id: partial.name,
    ingredientId: null,
    category: "other",
    quantity: null,
    unit: null,
    storageLocation: "pantry",
    purchasedOn: null,
    useBy: null,
    openedOn: null,
    estimatedRemainingPct: null,
    pricePaidCents: null,
    isStaple: false,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...partial,
  };
}

test("staples catalogue matches supabase/seed.sql", () => {
  const seed = readFileSync(resolve(here, "../../../supabase/seed.sql"), "utf8");
  const block = seed.slice(seed.indexOf("insert into public.ingredients"));
  const seeded = [...block.matchAll(/^\s+\('([^']+)', '([a-z_]+)', '([a-z_]+)', '([a-z_]+)'/gm)].map((m) => ({
    name: m[1],
    category: m[2],
    unit: m[4],
  }));
  assert.equal(seeded.length, STAPLES.length);
  for (const s of STAPLES) {
    const row = seeded.find((r) => r.name === s.name);
    assert.ok(row, `${s.name} missing from seed.sql`);
    assert.equal(row.category, s.category, `${s.name} category`);
    assert.equal(row.unit, s.defaultUnit, `${s.name} unit`);
  }
});

test("staple checklist only shows common staples", () => {
  const names = stapleChecklist().map((s) => s.name);
  assert.ok(names.includes("Kosher salt"));
  assert.ok(!names.includes("Lemon"));
});

test("local search matches names and aliases, prefix first", () => {
  assert.equal(searchLocalIngredients("mayo")[0]?.name, "Mayonnaise");
  assert.equal(searchLocalIngredients("garl")[0]?.name, "Garlic");
  assert.deepEqual(searchLocalIngredients("  "), []);
});

test("normalizeForStorage only fills base units", () => {
  assert.deepEqual(normalizeForStorage(1, "lb"), { normalizedQuantity: 453.5924, normalizedUnit: "g" });
  assert.deepEqual(normalizeForStorage(2, "can"), { normalizedQuantity: null, normalizedUnit: null });
  assert.deepEqual(normalizeForStorage(null, null), { normalizedQuantity: null, normalizedUnit: null });
});

test("formatQuantity reads naturally", () => {
  assert.equal(formatQuantity(1.5, "lb"), "1.5 lb");
  assert.equal(formatQuantity(3, "each"), "3");
  assert.equal(formatQuantity(2, "cups"), "2 cups");
  assert.equal(formatQuantity(1, "cup"), "1 cup");
  assert.equal(formatQuantity(2, "can"), "2 can");
  assert.equal(formatQuantity(null, null), null);
});

test("remainingLabel snaps to the nearest level", () => {
  assert.equal(remainingLabel(48), "About half");
  assert.equal(remainingLabel(20), "A little left");
  assert.equal(remainingLabel(0), "Empty");
  assert.equal(remainingLabel(null), null);
});

test("summary separates use-soon from past-date items", () => {
  const today = "2026-11-09";
  const summary = summarizeKitchen(
    [
      item({ name: "Spinach", storageLocation: "fridge", useBy: "2026-11-10" }),
      item({ name: "Cream", storageLocation: "fridge", useBy: "2026-11-09" }),
      item({ name: "Old milk", storageLocation: "fridge", useBy: "2026-11-02" }),
      item({ name: "Rice", useBy: null }),
      item({ name: "Peas", storageLocation: "freezer", useBy: "2027-03-01" }),
    ],
    today,
  );
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.useSoon.map((v) => v.item.name), ["Cream", "Spinach"]);
  assert.deepEqual(summary.pastDate.map((v) => v.item.name), ["Old milk"]);
  assert.equal(summary.byLocation.fridge, 3);
  assert.equal(summary.byLocation.freezer, 1);
});

test("groups follow catalogue order and filters combine", () => {
  const items = [
    item({ name: "Salt", category: "spice" }),
    item({ name: "Chicken", category: "protein", storageLocation: "freezer" }),
    item({ name: "Apples", category: "produce", storageLocation: "counter" }),
  ];
  assert.deepEqual(groupByCategory(items, "2026-11-09").map((g) => g.category), ["protein", "produce", "spice"]);
  assert.deepEqual(filterItems(items, { location: "freezer" }).map((i) => i.name), ["Chicken"]);
  assert.deepEqual(filterItems(items, { query: "APP", location: "all" }).map((i) => i.name), ["Apples"]);
});
