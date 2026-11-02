import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rankRecipes, testKitchenRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import type { MealPlan, OnboardingProfile } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile, mealPlanInputSchema } from "@kitchen-pantry/validation";
import {
  addDessert,
  applyDessertPicks,
  applyPicks,
  buildGroceryList,
  dessertDays,
  dessertTiming,
  draftToInput,
  emptyPlan,
  planDesserts,
  planWeek,
  removeDessert,
  sharedFreshIngredients,
  toDraft,
} from "./index";

const WEEK = "2026-11-09"; // Monday
const bySlug = (s: string) => testKitchenRecipes.find((r) => r.slug === s)!;

function ctx(patch: (p: OnboardingProfile) => void = () => {}): RankingContext {
  const profile = defaultOnboardingProfile();
  profile.household.postalCode = "53132";
  profile.goals.ranked = ["reduce_waste"];
  profile.equipment = ["stove", "oven", "stand_mixer", "blender"];
  patch(profile);
  return { profile, pantry: [], today: "2026-11-08", favorites: new Set(), ratings: new Map(), myRatings: new Map(), dismissed: new Set() };
}

test("desserts: frequency decides the days, never every day", () => {
  assert.deepEqual(dessertDays(WEEK, "weekly"), ["2026-11-14"]);
  assert.deepEqual(dessertDays(WEEK, "twice_weekly"), ["2026-11-11", "2026-11-14"]);
  assert.deepEqual(dessertDays(WEEK, "weekends"), ["2026-11-14", "2026-11-15"]);
  assert.deepEqual(dessertDays(WEEK, "never"), []);
  assert.deepEqual(dessertDays(WEEK, "occasions"), []);
  assert.deepEqual(dessertDays(WEEK, "weekly", "2026-11-15"), ["2026-11-15"], "Saturday passed: Sunday");
  // Desserts land on nights with a dinner planned.
  const weekdays = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
  assert.deepEqual(dessertDays(WEEK, "weekly", undefined, weekdays), ["2026-11-13"], "Friday when there's no weekend dinner");
  assert.deepEqual(dessertDays(WEEK, "twice_weekly", undefined, weekdays), ["2026-11-11", "2026-11-13"]);
  for (const f of ["never", "weekly", "twice_weekly", "weekends", "occasions"] as const) {
    assert.ok(dessertDays(WEEK, f).length <= 2, `${f} adds at most two a week`);
  }
});

test("desserts: dinners never include desserts, and desserts use the dessert skill", () => {
  const dinners = rankRecipes(testKitchenRecipes, ctx()).recipes;
  assert.ok(dinners.length > 0 && dinners.every((r) => r.recipe.course === "main"));
  const beginner = rankRecipes(testKitchenRecipes, ctx((p) => { p.skillLevel = 5; p.desserts = { frequency: "weekly", skillLevel: 1, categories: [] }; }), { course: "dessert" }).recipes;
  assert.ok(beginner.every((r) => r.recipe.skillLevel === 1), "dessert skill 1 even though cooking skill is 5");
  const pro = rankRecipes(testKitchenRecipes, ctx((p) => { p.skillLevel = 1; p.desserts = { frequency: "weekly", skillLevel: 5, categories: [] }; }), { course: "dessert" }).recipes;
  assert.ok(pro.some((r) => r.recipe.slug === "raspberry-mousse-entremets"));
  const frozen = rankRecipes(testKitchenRecipes, ctx(), { course: "dessert", dessertCategories: ["frozen"], includeAboveSkill: true }).recipes;
  assert.deepEqual(frozen.map((r) => r.recipe.slug), ["no-churn-vanilla-ice-cream"]);
});

test("desserts: allergies apply to desserts too", () => {
  const nutFree = rankRecipes(testKitchenRecipes, ctx((p) => { p.diet.allergies = ["milk"]; }), { course: "dessert", includeAboveSkill: true }).recipes;
  assert.ok(!nutFree.some((r) => r.recipe.slug === "no-churn-vanilla-ice-cream"), "milk allergy hides cream-based ice cream");
});

test("desserts: timing notes and shared fresh ingredients", () => {
  assert.match(dessertTiming(bySlug("dark-chocolate-pots-de-creme"))!, /day before.*4 hours to chill/);
  assert.match(dessertTiming(bySlug("no-churn-vanilla-ice-cream"))!, /6 hours to freeze/);
  assert.match(dessertTiming(bySlug("lemon-shortbread-bars"))!, /Start early/);
  assert.equal(dessertTiming(bySlug("apple-oat-crisp")), null);
  const shared = sharedFreshIngredients(bySlug("no-churn-vanilla-ice-cream"), [bySlug("creamy-garlic-chicken-spinach-parmesan")]);
  assert.deepEqual(shared, ["heavy cream"]);
  assert.deepEqual(sharedFreshIngredients(bySlug("apple-oat-crisp"), [bySlug("creamy-garlic-chicken-spinach-parmesan")]), [], "butter, sugar and salt don't count");
});

test("desserts: picks share ingredients with dinners and stay easy on weeknights", () => {
  const c = ctx((p) => { p.desserts = { frequency: "twice_weekly", skillLevel: 2, categories: [] }; });
  const candidates = rankRecipes(testKitchenRecipes, c, { course: "dessert" }).recipes;
  const picks = planDesserts({
    weekStart: WEEK,
    days: dessertDays(WEEK, "twice_weekly"),
    candidates,
    dinners: [bySlug("creamy-garlic-chicken-spinach-parmesan")],
    servings: 4,
  });
  assert.equal(picks.length, 2);
  assert.notEqual(picks[0]!.recipeId, picks[1]!.recipeId);
  const wednesday = testKitchenRecipes.find((r) => r.id === picks[0]!.recipeId)!;
  assert.ok(wednesday.prepMinutes + wednesday.cookMinutes <= 50, "weeknight dessert is quick");
  assert.ok(picks.some((p) => /heavy cream/.test(p.note ?? "")), "a pick reuses the dinner's cream");
  assert.ok(picks.every((p) => testKitchenRecipes.find((r) => r.id === p.recipeId)!.skillLevel <= 2));
});

test("desserts: hand-picked desserts survive a rebuild; auto ones are replaced; saved with their type", () => {
  const crisp = bySlug("apple-oat-crisp").id;
  const cake = bySlug("gingerbread-snack-cake").id;
  const ice = bySlug("no-churn-vanilla-ice-cream").id;
  let plan = applyPicks(emptyPlan(WEEK), [{ date: "2026-11-14", recipeId: bySlug("creamy-garlic-chicken-spinach-parmesan").id, servings: 4, note: "n" }], { source: "rules", summary: null, mode: "balanced" });
  plan = applyDessertPicks(plan, [{ date: "2026-11-14", recipeId: crisp, servings: 4, note: null }]);
  plan = addDessert(plan, "2026-11-15", { recipeId: cake, note: null }, 4);
  assert.equal(addDessert(plan, "2026-11-10", { recipeId: cake, note: null }, 4), plan, "same dessert twice is refused");
  plan = applyDessertPicks(plan, [{ date: "2026-11-14", recipeId: ice, servings: 4, note: null }]);
  assert.deepEqual(plan.desserts.map((d) => [d.date, d.recipeId]), [["2026-11-14", ice], ["2026-11-15", cake]]);
  assert.equal(plan.meals.length, 1, "the dinner on Saturday is untouched");

  const input = mealPlanInputSchema.parse(draftToInput(plan));
  assert.deepEqual(input.meals.map((m) => m.mealType), ["dinner", "dessert", "dessert"]);
  const stored: MealPlan = { id: "x", weekStart: WEEK, status: "draft", mode: "balanced", generatedBy: "rules", summary: null, confirmedAt: null, updatedAt: "", meals: input.meals.map((m, i) => ({ ...m, id: String(i), recipeId: m.recipeId, customTitle: m.customTitle })) as MealPlan["meals"] };
  const back = toDraft(stored);
  assert.equal(back.meals.length, 1);
  assert.equal(back.desserts.length, 2);
  assert.equal(removeDessert(back, "2026-11-15").desserts.length, 1);
});

test("desserts: one dessert per day, and the plan schema says so", () => {
  const bad = { weekStart: WEEK, meals: [
    { date: "2026-11-14", mealType: "dessert", recipeId: bySlug("apple-oat-crisp").id, servings: 4 },
    { date: "2026-11-14", mealType: "dessert", recipeId: bySlug("gingerbread-snack-cake").id, servings: 4 },
  ] };
  assert.ok(!mealPlanInputSchema.safeParse(bad).success);
  const ok = { weekStart: WEEK, meals: [
    { date: "2026-11-14", recipeId: bySlug("apple-oat-crisp").id, mealType: "dessert", servings: 4 },
    { date: "2026-11-14", recipeId: bySlug("creamy-garlic-chicken-spinach-parmesan").id, servings: 4 },
  ] };
  assert.ok(mealPlanInputSchema.safeParse(ok).success, "a dinner and a dessert on the same day is fine");
});

test("desserts: the shopping list merges dessert and dinner ingredients (no buying twice)", () => {
  const list = buildGroceryList({
    meals: [
      { recipe: bySlug("creamy-garlic-chicken-spinach-parmesan"), servings: 4 },
      { recipe: bySlug("no-churn-vanilla-ice-cream"), servings: 8 },
    ],
    pantry: [],
    today: "2026-11-08",
  });
  const cream = list.toBuy.filter((l) => l.key === "heavy cream");
  assert.equal(cream.length, 1);
  assert.deepEqual(cream[0]!.neededFor, ["Creamy Garlic Chicken with Spinach & Parmesan", "No-Churn Vanilla Ice Cream"]);
  assert.equal(cream[0]!.amount, "2¾ cups");
});

test("desserts: the week planner never puts a dessert at dinner", () => {
  const c = ctx();
  const all = rankRecipes(testKitchenRecipes, c, { course: "any", includeAboveSkill: true }).recipes;
  const week = planWeek({ weekStart: WEEK, days: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"], candidates: rankRecipes(testKitchenRecipes, c).recipes, mode: "balanced", goals: [], servings: 2, seed: 3 } as Parameters<typeof planWeek>[0]);
  const desserts = new Set(all.filter((r) => r.recipe.course === "dessert").map((r) => r.recipe.id));
  assert.ok(week.picks.every((p) => !desserts.has(p.recipeId)));
});
