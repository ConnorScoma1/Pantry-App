import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { MealPlan } from "@kitchen-pantry/shared-types";
import {
  addCustomMeal,
  applyPicks,
  confirmPlan,
  daysToPlan,
  emptyPlan,
  moveMeal,
  removeMeal,
  repeatWeek,
  replaceMeal,
  setServings,
  toggleLock,
  type PlanDraft,
} from "./index";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const pick = (date: string, recipeId: string) => ({ date, recipeId, servings: 2, note: "n" });

function week(): PlanDraft {
  return applyPicks(emptyPlan("2026-11-09"), [pick("2026-11-09", A), pick("2026-11-10", B), pick("2026-11-11", C)], {
    source: "ai",
    summary: "s",
    mode: "balanced",
  });
}

test("applyPicks keeps locked and custom meals and clears confirmation", () => {
  let p = toggleLock(week(), "2026-11-10");
  p = addCustomMeal(p, "2026-11-12", "  Leftovers  ", 2);
  p = confirmPlan(p);
  assert.deepEqual(daysToPlan(p, 5), ["2026-11-09", "2026-11-11", "2026-11-13"]);
  const rebuilt = applyPicks(p, [pick("2026-11-09", C), pick("2026-11-10", A), pick("2026-11-13", A)], { source: "rules", summary: null, mode: "budget_first" });
  assert.deepEqual(rebuilt.meals.map((m) => m.recipeId ?? m.customTitle), [C, B, "Leftovers", A]);
  assert.equal(rebuilt.confirmedAt, null);
  assert.equal(rebuilt.mode, "budget_first");
});

test("servings are clamped; lock toggles; remove drops the night", () => {
  let p = setServings(week(), "2026-11-09", 99);
  assert.equal(p.meals[0]!.servings, 24);
  p = setServings(p, "2026-11-09", 0);
  assert.equal(p.meals[0]!.servings, 1);
  p = toggleLock(p, "2026-11-11");
  assert.equal(p.meals[2]!.locked, true);
  p = removeMeal(p, "2026-11-10");
  assert.deepEqual(p.meals.map((m) => m.date), ["2026-11-09", "2026-11-11"]);
});

test("replace keeps servings and lock, and never duplicates a recipe", () => {
  let p = setServings(week(), "2026-11-09", 4);
  p = replaceMeal(p, "2026-11-09", { recipeId: "00000000-0000-4000-8000-00000000000d", note: "swap" }, 2);
  assert.equal(p.meals[0]!.servings, 4);
  assert.equal(p.meals[0]!.recipeId, "00000000-0000-4000-8000-00000000000d");
  const same = replaceMeal(p, "2026-11-09", { recipeId: B, note: "dup" }, 2);
  assert.equal(same, p, "B is already on Tuesday");
});

test("move swaps with an occupied day and ignores days outside the week", () => {
  const p = moveMeal(week(), "2026-11-09", "2026-11-11");
  assert.deepEqual(p.meals.map((m) => [m.date, m.recipeId]), [["2026-11-09", C], ["2026-11-10", B], ["2026-11-11", A]]);
  const q = moveMeal(week(), "2026-11-09", "2026-11-14");
  assert.deepEqual(q.meals.map((m) => m.date), ["2026-11-10", "2026-11-11", "2026-11-14"]);
  assert.deepEqual(moveMeal(week(), "2026-11-09", "2026-11-20").meals, week().meals);
});

test("repeat a previous week shifts dates and skips recipes no longer suitable", () => {
  const prev: MealPlan = {
    id: "p", weekStart: "2026-11-02", status: "active", mode: "balanced", confirmedAt: "x", generatedBy: "ai", summary: "old", updatedAt: "x",
    meals: [
      { id: "1", date: "2026-11-02", mealType: "dinner", recipeId: A, customTitle: null, servings: 3, locked: true, note: null },
      { id: "2", date: "2026-11-04", mealType: "dinner", recipeId: B, customTitle: null, servings: 2, locked: false, note: null },
      { id: "3", date: "2026-11-06", mealType: "dinner", recipeId: null, customTitle: "Pizza night", servings: 2, locked: false, note: null },
    ],
  };
  const p = repeatWeek(emptyPlan("2026-11-09"), prev, new Set([A]));
  assert.deepEqual(p.meals.map((m) => [m.date, m.recipeId ?? m.customTitle, m.locked]), [
    ["2026-11-09", A, false],
    ["2026-11-13", "Pizza night", false],
  ]);
  assert.equal(p.meals[0]!.servings, 3);
});

test("planning mid-week skips nights that are over", () => {
  const p = emptyPlan("2026-11-09");
  assert.deepEqual(daysToPlan(p, 5, "2026-11-09"), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.deepEqual(daysToPlan(p, 5, "2026-11-12"), ["2026-11-12", "2026-11-13", "2026-11-14"]);
  assert.deepEqual(daysToPlan(p, 3, "2026-11-14"), ["2026-11-14"]);
  assert.deepEqual(daysToPlan(p, 5, "2026-11-15"), ["2026-11-15"]);
  assert.deepEqual(daysToPlan(p, 5, "2026-11-16"), []);
  assert.deepEqual(daysToPlan(p, 5, "2026-11-01"), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
});
