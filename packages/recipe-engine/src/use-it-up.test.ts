import assert from "node:assert/strict";
import { test } from "node:test";
import type { PantryItem } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { ideasToUseUp, rankRecipes, testKitchenRecipes, toUseUpFirst } from "./index";

const today = "2026-11-02";
const now = "2026-11-01T00:00:00Z";
const item = (id: string, name: string, extra: Partial<PantryItem> = {}): PantryItem => ({
  id, ingredientId: null, name, category: "other", quantity: null, unit: null, storageLocation: "fridge", purchasedOn: null, useBy: null, openedOn: null,
  estimatedRemainingPct: null, pricePaidCents: null, isStaple: false, createdAt: now, updatedAt: now, ...extra,
});

function rank(pantry: PantryItem[]) {
  const profile = defaultOnboardingProfile();
  profile.skillLevel = 3;
  profile.equipment = ["stove", "oven", "blender", "dutch_oven"];
  return rankRecipes(testKitchenRecipes, { profile, pantry, today, favorites: new Set(), ratings: new Map(), myRatings: new Map(), seasonal: null, taste: null }, { includeAboveSkill: true }).recipes;
}

test("use it up: recipes that use the most picked items come first, with what you'd still buy", () => {
  const pantry = [
    item("ch", "chicken thighs", { useBy: "2026-11-03", quantity: 1, unit: "lb" }),
    item("sp", "spinach", { useBy: "2026-11-02" }),
    item("cr", "heavy cream", { useBy: "2026-11-05" }),
    item("ga", "garlic", { isStaple: true }),
    item("pa", "parmesan"),
  ];
  const r = ideasToUseUp(rank(pantry), [pantry[0]!, pantry[1]!, pantry[2]!], today);
  assert.ok(r.picks.length > 0);
  const top = r.picks[0]!;
  assert.ok(top.uses.length >= 2, `top idea uses ${top.uses.map((u) => u.name)}`);
  assert.ok(top.uses.some((u) => u.id === "sp"), "the most urgent item is used first");
  assert.match(top.why, /^Uses your /);
  assert.ok(top.have <= top.of && top.missing.length === top.of - top.have);
  for (const p of r.picks) assert.ok(p.usage.every((u) => u.lines.length > 0));
  // 1 lb of chicken in the kitchen; every chicken recipe here needs more.
  const chicken = r.picks.find((p) => p.uses.some((u) => u.id === "ch"))!;
  assert.equal(chicken.usage.find((u) => u.item.id === "ch")!.short, "you have 1 lb");
  // Each picked item gets an idea when one exists.
  const covered = new Set(r.picks.flatMap((p) => p.uses.map((u) => u.id)));
  for (const id of ["ch", "sp", "cr"]) assert.ok(covered.has(id), `${id} is used by some idea`);
});

test("use it up: food past its date is never used, and nothing is suggested for it", () => {
  const pantry = [item("old", "chicken thighs", { useBy: "2026-10-30" }), item("ok", "baby spinach", { useBy: "2026-11-03" })];
  const r = ideasToUseUp(rank(pantry), pantry, today);
  assert.deepEqual(r.pastDate.map((p) => p.id), ["old"]);
  for (const p of r.picks) assert.ok(!p.uses.some((u) => u.id === "old"));
  const none = ideasToUseUp(rank(pantry), [pantry[0]!], today);
  assert.equal(none.picks.length, 0);
});

test("use it up: an ingredient no recipe uses is reported, and suggestions skip staples and later dates", () => {
  const pantry = [item("x", "dragon fruit", { useBy: "2026-11-03" }), item("s", "salt", { isStaple: true, useBy: "2026-11-03" }), item("l", "lettuce", { useBy: "2026-12-30" }), item("t", "tomatoes", { useBy: "2026-11-02" })];
  const r = ideasToUseUp(rank(pantry), [pantry[0]!], today);
  assert.deepEqual(r.unused.map((u) => u.id), ["x"]);
  assert.deepEqual(toUseUpFirst(pantry, today).map((p) => p.id), ["t", "x"]);
});

test("use it up: the extra shopping is priced per idea, unpriced items counted, never guessed", async () => {
  const { shoppingForIdeas, extraCosts } = await import("./index");
  const pantry = [item("sp", "baby spinach", { useBy: "2026-11-03" }), item("cr", "heavy cream", { useBy: "2026-11-03" })];
  const r = ideasToUseUp(rank(pantry), pantry, today);
  const items = shoppingForIdeas(r.picks);
  assert.ok(items.length > 0 && items.length <= 80 && items.every((i) => i.id.length <= 64));
  const first = r.picks[0]!;
  const mine = items.filter((i) => i.id.startsWith(`${first.ranked.recipe.id}~`));
  const lines = mine.map((i, n) => ({ id: i.id, lineTotalCents: n === 0 ? null : 250, outOfStock: false, assumedOnePackage: n === 1, observedAt: "2026-11-02T10:00:00Z" }));
  const c = extraCosts(r.picks, lines).get(first.ranked.recipe.id)!;
  assert.equal(c.of, first.missing.length);
  assert.equal(c.priced, Math.max(0, mine.length - 1));
  assert.equal(c.cents, 250 * c.priced);
});
