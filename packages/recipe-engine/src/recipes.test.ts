import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OnboardingProfile, PantryItem, RatingSummary, RecipeRating } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile, recipeSchema } from "@kitchen-pantry/validation";
import {
  formatAmount,
  formatIngredientLine,
  formatMinutes,
  formatTemperature,
  groupByComponent,
  pantryCoverage,
  pantryItemMatches,
  rankRecipe,
  rankRecipes,
  screenAllergens,
  ingredientLines,
  testKitchenRecipes,
  type RankingContext,
} from "./index";

const byslug = (s: string) => testKitchenRecipes.find((r) => r.slug === s)!;

function pantryItem(name: string, useBy: string | null = null): PantryItem {
  return {
    id: name,
    ingredientId: null,
    name,
    category: "other",
    quantity: null,
    unit: null,
    storageLocation: "fridge",
    purchasedOn: null,
    useBy,
    openedOn: null,
    estimatedRemainingPct: null,
    pricePaidCents: null,
    isStaple: false,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
}

function profile(patch: (p: OnboardingProfile) => void = () => {}): OnboardingProfile {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.goals.ranked = ["reduce_waste"];
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven"];
  patch(p);
  return p;
}

function ctx(p: OnboardingProfile, pantry: PantryItem[] = [], extra: Partial<RankingContext> = {}): RankingContext {
  return { profile: p, pantry, today: "2026-11-09", favorites: new Set(), ratings: new Map(), myRatings: new Map(), ...extra };
}

test("every catalogue recipe passes the recipe schema", () => {
  for (const r of testKitchenRecipes) {
    const result = recipeSchema.safeParse(r);
    assert.ok(result.success, `${r.slug}: ${JSON.stringify(result.error?.issues.slice(0, 2))}`);
  }
});

test("catalogue ids and slugs are unique and skill levels 1–5 are all covered", () => {
  assert.equal(new Set(testKitchenRecipes.map((r) => r.id)).size, testKitchenRecipes.length);
  assert.equal(new Set(testKitchenRecipes.map((r) => r.slug)).size, testKitchenRecipes.length);
  assert.deepEqual([...new Set(testKitchenRecipes.map((r) => r.skillLevel))].sort(), [1, 2, 3, 4, 5]);
});

test("every recipe cooking poultry, meat or seafood states a safe internal temperature", () => {
  const risky = /chicken|turkey|beef|pork|salmon|scallop|shrimp/i;
  for (const r of testKitchenRecipes) {
    if (r.ingredients.some((i) => risky.test(i.item) && !/broth|stock/i.test(i.item))) {
      assert.ok(r.steps.some((s) => s.safeInternalTempC !== null), `${r.slug} needs a safe internal temperature`);
    }
  }
});

test("allergen screen catches the expected recipes", () => {
  const peanuts = byslug("peanut-noodles-chicken-crunchy-vegetables");
  assert.ok(screenAllergens(ingredientLines(peanuts), ["peanut"]).conflicts.length > 0);
  const scallops = byslug("seared-scallops-beurre-blanc-pea-puree");
  assert.ok(screenAllergens(ingredientLines(scallops), ["shellfish"]).conflicts.length > 0);
  assert.ok(screenAllergens(ingredientLines(scallops), ["milk"]).conflicts.length > 0);
});

test("amounts and lines format like a recipe card", () => {
  assert.equal(formatAmount(1.5), "1½");
  assert.equal(formatAmount(0.33), "⅓");
  assert.equal(formatAmount(0.25), "¼");
  assert.equal(formatAmount(2), "2");
  assert.equal(formatAmount(2.4), "2⅜");
  assert.equal(formatAmount(0.6), "⅝");
  assert.equal(formatAmount(0.94), "1");
  assert.equal(formatAmount(1.875), "1⅞");
  assert.equal(formatAmount(453.6), "454");
  assert.equal(formatAmount(0.02), "⅛");
  const chicken = byslug("honey-garlic-chicken-broccoli").ingredients[0]!;
  assert.equal(formatIngredientLine(chicken), "1½ lb boneless chicken thighs, cut into 1-inch pieces");
  assert.equal(formatIngredientLine(chicken, 2), "3 lb boneless chicken thighs, cut into 1-inch pieces");
  const garlic = byslug("honey-garlic-chicken-broccoli").ingredients[2]!;
  assert.equal(formatIngredientLine(garlic), "4 cloves garlic, minced");
});

test("temperatures round-trip to clean Fahrenheit values", () => {
  for (const r of testKitchenRecipes) {
    for (const s of r.steps) {
      if (s.temperatureC !== null) assert.equal(Number(formatTemperature(s.temperatureC).replace("°F", "")) % 5, 0);
      if (s.safeInternalTempC !== null) assert.ok(["145°F", "160°F", "165°F"].includes(formatTemperature(s.safeInternalTempC)));
    }
  }
  assert.equal(formatMinutes(195), "3 hr 15 min");
  assert.equal(formatMinutes(25), "25 min");
});

test("pantry matching uses whole words and catalogue aliases", () => {
  assert.ok(pantryItemMatches("boneless chicken thighs", pantryItem("Chicken thighs")));
  assert.ok(pantryItemMatches("garlic", pantryItem("Garlic")));
  assert.ok(!pantryItemMatches("garlic", pantryItem("Garlic powder")));
  assert.ok(pantryItemMatches("chicken stock", pantryItem("Chicken broth"))); // alias
  assert.ok(pantryItemMatches("large eggs", pantryItem("Eggs")));
  assert.ok(pantryItemMatches("diced tomatoes", pantryItem("Tomato")));
  assert.ok(!pantryItemMatches("unsalted butter", pantryItem("Peanut butter")));
});

test("coverage ignores past-date items and flags items to use soon", () => {
  const recipe = byslug("creamy-garlic-chicken-spinach-parmesan");
  const cov = pantryCoverage(
    recipe,
    [pantryItem("Chicken thighs", "2026-11-10"), pantryItem("Heavy cream", "2026-11-01"), pantryItem("Garlic"), pantryItem("Kosher salt")],
    "2026-11-09",
  );
  assert.deepEqual(cov.usesSoon.map((p) => p.name), ["Chicken thighs"]);
  assert.ok(cov.missing.some((i) => i.item === "heavy cream"), "past-date cream doesn't count");
  assert.equal(cov.owned.length, 3);
});

test("allergies, diet and missing equipment hide recipes; skill is opt-in", () => {
  const p = profile((x) => {
    x.diet.allergies = ["peanut"];
    x.diet.style = "vegetarian";
    x.equipment = ["stove", "oven"];
    x.skillLevel = 2;
  });
  const { recipes, hidden } = rankRecipes(testKitchenRecipes, ctx(p));
  const visible = recipes.map((r) => r.recipe.slug);
  assert.ok(!visible.includes("peanut-noodles-chicken-crunchy-vegetables"));
  assert.ok(!visible.includes("honey-garlic-chicken-broccoli"), "vegetarian hides chicken");
  assert.ok(visible.includes("creamy-tomato-spinach-penne"));
  assert.ok(!visible.includes("mushroom-thyme-risotto"), "level 3 hidden for level 2 by default");
  assert.ok(hidden.some((h) => h.recipe.slug === "peanut-noodles-chicken-crunchy-vegetables"));
  // Air fryer recipe allowed via the oven alternative, with a caution.
  const tacos = recipes.find((r) => r.recipe.slug === "air-fryer-crispy-chickpea-tacos");
  assert.ok(tacos && tacos.cautions.some((c) => c.includes("oven")));
  const withStretch = rankRecipes(testKitchenRecipes, ctx(p), { includeAboveSkill: true }).recipes;
  assert.ok(withStretch.some((r) => r.recipe.slug === "mushroom-thyme-risotto"));
});

test("use-soon ingredients and preferences lift recipes, with reasons", () => {
  const p = profile((x) => (x.diet.cuisines = ["italian"]));
  const ranked = rankRecipes(
    testKitchenRecipes,
    ctx(p, [pantryItem("Baby spinach", "2026-11-10"), pantryItem("Heavy cream", "2026-11-11"), pantryItem("Parmesan")]),
  ).recipes;
  assert.ok(["creamy-garlic-chicken-spinach-parmesan", "creamy-tomato-spinach-penne"].includes(ranked[0]!.recipe.slug));
  assert.match(ranked[0]!.reasons[0]!, /Uses up your/);
  assert.ok(ranked[0]!.reasons.some((r) => r.includes("Italian")));
});

test("ratings: never invented, real low personal ratings push a recipe down", () => {
  const p = profile();
  const recipe = byslug("turkey-black-bean-chili");
  const base = rankRecipe(recipe, ctx(p));
  assert.equal(base.rating, null);
  assert.equal(base.label, "editorial");
  const mine: RecipeRating = { recipeId: recipe.id, overall: 2, flavor: null, difficulty: null, wouldCookAgain: false, actualMinutes: null, familyApproval: null, notes: null, createdAt: "" };
  const after = rankRecipe(recipe, ctx(p, [], { myRatings: new Map([[recipe.id, mine]]) }));
  assert.ok(after.score < base.score);
  const community: RatingSummary = { recipeId: recipe.id, average: 4.6, count: 40, wouldCookAgainPct: 90 };
  const rated = rankRecipe(recipe, ctx(p, [], { ratings: new Map([[recipe.id, community]]) }));
  assert.equal(rated.label, "community_rated");
  assert.ok(rated.reasons.some((r) => r.includes("40 households")));
});

test("dislikes are soft: shown with a caution, ranked lower", () => {
  const p = profile((x) => (x.diet.dislikes = ["Mushrooms"]));
  const risotto = rankRecipe(byslug("mushroom-thyme-risotto"), ctx(p));
  assert.ok(risotto.allowed);
  assert.ok(risotto.cautions.some((c) => c.includes("mushroom")));
});

test("groupByComponent keeps order", () => {
  const steps = byslug("chicken-supreme-pommes-puree-tarragon-jus").steps;
  const groups = groupByComponent(steps).map((g) => g.component);
  assert.deepEqual(groups, ["Mise en place", "Pommes purée", "Glazed carrots", "Chicken", "Tarragon jus", "Plating"]);
});

test("supabase/seed_recipes.sql is in sync with the catalogue (run the seed script)", async () => {
  const { readFileSync } = await import("node:fs");
  const { buildRecipeSeedSql } = await import("./catalog/seed-sql");
  const path = new URL("../../../supabase/seed_recipes.sql", import.meta.url);
  assert.equal(readFileSync(path, "utf8"), buildRecipeSeedSql());
});
