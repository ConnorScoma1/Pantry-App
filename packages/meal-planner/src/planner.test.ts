import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rankRecipes, recipeProteins, testKitchenRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import type { OnboardingProfile, PantryItem } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { chooseDinnerDays, isWeeknight, planWeek, suggestSwap, weekBasket, type PlanWeekInput } from "./index";

const WEEK = "2026-11-09"; // a Monday

function profile(patch: (p: OnboardingProfile) => void = () => {}): OnboardingProfile {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven"];
  p.goals.ranked = ["reduce_waste"];
  patch(p);
  return p;
}

function item(name: string, useBy: string | null = null): PantryItem {
  return {
    id: name, ingredientId: null, name, category: "other", quantity: null, unit: null, storageLocation: "fridge",
    purchasedOn: null, useBy, openedOn: null, estimatedRemainingPct: null, pricePaidCents: null, isStaple: false,
    createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
  };
}

function candidates(p: OnboardingProfile, pantry: PantryItem[] = [], extra: Partial<RankingContext> = {}) {
  const ctx: RankingContext = { profile: p, pantry, today: WEEK, favorites: new Set(), ratings: new Map(), myRatings: new Map(), ...extra };
  return rankRecipes(testKitchenRecipes, ctx, { includeAboveSkill: true }).recipes;
}

function input(p: OnboardingProfile, patch: Partial<PlanWeekInput> = {}, pantry: PantryItem[] = []): PlanWeekInput {
  return {
    days: chooseDinnerDays(WEEK, 5),
    candidates: candidates(p, pantry),
    mode: "balanced",
    goals: p.goals.ranked,
    servings: 2,
    ...patch,
  };
}

const title = (id: string) => testKitchenRecipes.find((r) => r.id === id)!.title;

test("dinner days spread across the week", () => {
  assert.deepEqual(chooseDinnerDays(WEEK, 5), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.deepEqual(chooseDinnerDays(WEEK, 3), ["2026-11-09", "2026-11-11", "2026-11-13"]);
  assert.equal(chooseDinnerDays(WEEK, 7).length, 7);
  assert.deepEqual(chooseDinnerDays(WEEK, 0), []);
  assert.ok(isWeeknight("2026-11-12") && !isWeeknight("2026-11-14"));
});

test("fills every requested day with distinct, allowed recipes", () => {
  const p = profile();
  const result = planWeek(input(p));
  assert.equal(result.picks.length, 5);
  assert.equal(new Set(result.picks.map((x) => x.recipeId)).size, 5, "no repeats");
  assert.deepEqual(result.picks.map((x) => x.date), chooseDinnerDays(WEEK, 5));
  for (const pick of result.picks) {
    assert.ok(pick.note.length > 0);
    assert.equal(pick.servings, 2);
  }
  assert.match(result.summary, /Balanced week: 5 new dinners/);
});

test("never plans a recipe that fails the household's allergies, skill or 'Not for us'", () => {
  const p = profile((x) => {
    x.diet.allergies = ["peanut", "shellfish"];
    x.skillLevel = 2;
  });
  const dismissedId = testKitchenRecipes.find((r) => r.slug === "creamy-tomato-spinach-penne")!.id;
  const result = planWeek(input(p, { days: chooseDinnerDays(WEEK, 7), candidates: candidates(p, [], { dismissed: new Set([dismissedId]) }) }));
  const chosen = result.picks.map((x) => testKitchenRecipes.find((r) => r.id === x.recipeId)!);
  assert.ok(chosen.every((r) => r.skillLevel <= 2));
  assert.ok(!chosen.some((r) => r.slug.includes("peanut") || r.slug.includes("scallops")));
  assert.ok(!chosen.some((r) => r.id === dismissedId));
});

test("reports unfilled days rather than repeating recipes", () => {
  const p = profile((x) => {
    x.skillLevel = 1;
    x.equipment = ["stove"];
  });
  const result = planWeek(input(p, { days: chooseDinnerDays(WEEK, 7) }));
  assert.ok(result.picks.length < 7);
  assert.equal(result.picks.length + result.unfilled.length, 7);
  assert.equal(new Set(result.picks.map((x) => x.recipeId)).size, result.picks.length);
});

test("neighbouring nights avoid the same main protein where possible", () => {
  const p = profile();
  const picks = planWeek(input(p, { days: chooseDinnerDays(WEEK, 7) })).picks;
  let clashes = 0;
  for (let i = 1; i < picks.length; i++) {
    const a = recipeProteins(testKitchenRecipes.find((r) => r.id === picks[i - 1]!.recipeId)!);
    const b = recipeProteins(testKitchenRecipes.find((r) => r.id === picks[i]!.recipeId)!);
    if (a.some((x) => b.includes(x))) clashes++;
  }
  assert.ok(clashes <= 2, `too many back-to-back proteins: ${clashes}`);
});

test("Use What I Have favours recipes covered by the kitchen and items near their date", () => {
  const p = profile();
  const pantry = [
    item("Chicken thighs", "2026-11-10"), item("Baby spinach", "2026-11-09"), item("Parmesan"),
    item("Heavy cream"), item("Garlic"), item("Olive oil"), item("Kosher salt"), item("Black pepper"),
  ];
  const use = planWeek(input(p, { mode: "use_what_i_have" }, pantry)).picks.map((x) => title(x.recipeId));
  assert.ok(use.includes("Creamy Garlic Chicken with Spinach & Parmesan"), use.join(", "));
});

test("Budget First prefers fewer items to buy than Chef's Choice", () => {
  const p = profile();
  const pantry = [item("Rice"), item("Large eggs"), item("Frozen peas"), item("Soy sauce"), item("Garlic"), item("Black beans"), item("Tortillas"), item("Cheddar")];
  const ranked = candidates(p, pantry);
  const missingFor = (ids: string[]) => ids.reduce((n, id) => n + ranked.find((r) => r.recipe.id === id)!.coverage.missing.length, 0);
  const budget = planWeek(input(p, { mode: "budget_first", candidates: ranked, days: chooseDinnerDays(WEEK, 3) }));
  const chef = planWeek(input(p, { mode: "chefs_choice", candidates: ranked, days: chooseDinnerDays(WEEK, 3) }));
  assert.ok(missingFor(budget.picks.map((x) => x.recipeId)) <= missingFor(chef.picks.map((x) => x.recipeId)));
  const chefSkill = chef.picks.reduce((n, x) => n + testKitchenRecipes.find((r) => r.id === x.recipeId)!.skillLevel, 0);
  const budgetSkill = budget.picks.reduce((n, x) => n + testKitchenRecipes.find((r) => r.id === x.recipeId)!.skillLevel, 0);
  assert.ok(chefSkill >= budgetSkill);
});

test("weeknights get quicker dinners than the weekend", () => {
  const p = profile();
  const picks = planWeek(input(p, { days: chooseDinnerDays(WEEK, 7) })).picks;
  const minutes = (d: (x: string) => boolean) => {
    const xs = picks.filter((x) => d(x.date)).map((x) => testKitchenRecipes.find((r) => r.id === x.recipeId)!.totalMinutes);
    return xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  };
  assert.ok(minutes(isWeeknight) <= minutes((d) => !isWeeknight(d)), "weeknight average should not exceed weekend average");
});

test("locked meals are kept, never duplicated, and count toward variety", () => {
  const p = profile();
  const ranked = candidates(p);
  const lockedId = ranked[0]!.recipe.id;
  const days = chooseDinnerDays(WEEK, 5).filter((d) => d !== "2026-11-11");
  const result = planWeek(input(p, { candidates: ranked, days, fixed: [{ date: "2026-11-11", recipeId: lockedId }] }));
  assert.equal(result.picks.length, 4);
  assert.ok(!result.picks.some((x) => x.recipeId === lockedId || x.date === "2026-11-11"));
});

test("same seed gives the same week; regenerate with a new seed and avoid list changes it", () => {
  const p = profile();
  const a = planWeek(input(p, { seed: 7 }));
  const b = planWeek(input(p, { seed: 7 }));
  assert.deepEqual(a.picks, b.picks);
  const c = planWeek(input(p, { seed: 8, avoid: new Set(a.picks.map((x) => x.recipeId)) }));
  const overlap = c.picks.filter((x) => a.picks.some((y) => y.recipeId === x.recipeId)).length;
  assert.ok(overlap < a.picks.length, "regenerated week should differ");
});

test("swap suggests a different recipe that isn't already planned", () => {
  const p = profile();
  const base = input(p);
  const week = planWeek(base).picks;
  const target = week[2]!;
  const swap = suggestSwap({ ...base, fixed: week.map((x) => ({ date: x.date, recipeId: x.recipeId })) }, target.date, target.recipeId);
  assert.ok(swap);
  assert.notEqual(swap.recipeId, target.recipeId);
  assert.ok(!week.some((x) => x.recipeId === swap.recipeId));
  assert.equal(swap.date, target.date);
});

test("basket lists each item once, with the meals that need it", () => {
  const p = profile();
  const ranked = candidates(p);
  const chili = ranked.find((r) => r.recipe.slug === "turkey-black-bean-chili")!;
  const ques = ranked.find((r) => r.recipe.slug === "black-bean-cheddar-quesadillas")!;
  const basket = weekBasket([chili, ques]);
  const names = basket.toBuy.map((b) => b.item.toLowerCase());
  assert.equal(names.length, new Set(names).size);
  const shared = basket.toBuy.filter((b) => b.neededFor.length === 2);
  assert.ok(shared.length >= 1, "chili and quesadillas share at least one purchase");
  assert.equal(basket.toBuy[0]!.neededFor.length, 2, "shared items are listed first");
});
