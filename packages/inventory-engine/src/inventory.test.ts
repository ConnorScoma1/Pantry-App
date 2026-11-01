import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  assessUrgency,
  canonicalUnit,
  convert,
  normalize,
  sortByUrgency,
  subtractInventory,
  sumQuantities,
} from "./index";

const near = (a: number | null, b: number, eps = 1e-6) =>
  assert.ok(a !== null && Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

test("unit aliases resolve to canonical units", () => {
  assert.equal(canonicalUnit("Tablespoons"), "tbsp");
  assert.equal(canonicalUnit("lbs"), "lb");
  assert.equal(canonicalUnit("fl oz"), "fl_oz");
  assert.equal(canonicalUnit("bunch"), "bunch");
});

test("normalize converts to base units and keeps package units", () => {
  near(normalize({ value: 1, unit: "lb" }).value, 453.59237);
  assert.equal(normalize({ value: 2, unit: "cups" }).unit, "ml");
  assert.deepEqual(normalize({ value: 1, unit: "can" }), { value: 1, unit: "can", isBase: false });
  assert.throws(() => normalize({ value: -1, unit: "g" }));
});

test("convert within a dimension", () => {
  near(convert({ value: 12, unit: "oz" }, "lb"), 0.75);
  near(convert({ value: 3, unit: "tsp" }, "tbsp"), 1);
  near(convert({ value: 1, unit: "dozen" }, "each"), 12);
});

test("convert across dimensions only with hints", () => {
  assert.equal(convert({ value: 1, unit: "cup" }, "g"), null);
  near(convert({ value: 1, unit: "cup" }, "g", { densityGPerMl: 0.5 }), 118.29411825);
  near(convert({ value: 2, unit: "each" }, "g", { gramsPerEach: 100 }), 200);
  assert.equal(convert({ value: 1, unit: "can" }, "g"), null);
});

test("subtractInventory covers what it can and reports the rest", () => {
  const result = subtractInventory({ value: 2, unit: "cup" }, [
    { value: 250, unit: "ml" },
    { value: 1, unit: "bunch" },
  ]);
  near(result.covered.value, 250 / 236.5882365);
  near(result.stillNeeded.value, 2 - 250 / 236.5882365);
  assert.deepEqual(result.incomparable, [{ value: 1, unit: "bunch" }]);
});

test("subtractInventory never goes negative", () => {
  const result = subtractInventory({ value: 1, unit: "lb" }, [{ value: 2, unit: "lb" }]);
  assert.equal(result.stillNeeded.value, 0);
  assert.equal(result.covered.value, 1);
});

test("sumQuantities consolidates by base unit", () => {
  const totals = sumQuantities([
    { value: 1, unit: "tbsp" },
    { value: 3, unit: "tsp" },
    { value: 2, unit: "each" },
    { value: 1, unit: "each" },
  ]);
  const ml = totals.find((t) => t.unit === "ml");
  const each = totals.find((t) => t.unit === "each");
  near(ml?.value ?? null, 14.78676478125 * 2);
  assert.equal(each?.value, 3);
});

test("urgency never marks past-date food usable", () => {
  const today = "2026-11-09";
  assert.equal(assessUrgency("2026-11-08", today).usable, false);
  assert.equal(assessUrgency("2026-11-08", today).urgency, "past_date");
  assert.equal(assessUrgency("2026-11-09", today).urgency, "today");
  assert.equal(assessUrgency("2026-11-11", today).urgency, "soon");
  assert.equal(assessUrgency("2026-11-14", today).urgency, "this_week");
  assert.equal(assessUrgency(null, today).urgency, "unknown");
});

test("sortByUrgency puts the most urgent usable items first", () => {
  const items = [
    { name: "rice", useBy: null },
    { name: "spinach", useBy: "2026-11-10" },
    { name: "old milk", useBy: "2026-11-01" },
    { name: "cream", useBy: "2026-11-09" },
  ];
  assert.deepEqual(
    sortByUrgency(items, "2026-11-09").map((i) => i.name),
    ["cream", "spinach", "rice", "old milk"],
  );
});
