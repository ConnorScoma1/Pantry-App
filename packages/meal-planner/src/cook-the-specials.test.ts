import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Special } from "@kitchen-pantry/grocery-pricing";
import { rankRecipes, testKitchenRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { chooseDinnerDays, cookTheSpecialsTerms, isMinorSaleItem, planWeek, saleMatches } from "./index";

const WEEK = "2026-11-09";
const profile = (() => {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven"];
  p.goals.ranked = ["save_money"];
  return p;
})();
const ctx: RankingContext = { profile, pantry: [], today: WEEK, favorites: new Set(), ratings: new Map(), myRatings: new Map() };
const candidates = rankRecipes(testKitchenRecipes, ctx).recipes;

let n = 0;
const special = (name: string, matchedTerm: string, regular: number, sale: number): Special => ({
  id: `kroger:${++n}`, provider: "kroger", retailer: "kroger", storeId: "01400376", productId: String(n), name, brand: "Kroger", sizeLabel: null,
  department: "meat_seafood", matchedTerm, regularCents: regular, saleCents: sale, percentOff: Math.floor(((regular - sale) / regular) * 100),
  soldByWeight: false, unitPrice: null, promoType: "sale", requiresMembership: null, requiresCoupon: null, endsOn: null, sourceUrl: null,
  availability: "in_stock", observedAt: "2026-11-08T18:00:00Z",
});
const specials = [special("Kroger Boneless Skinless Chicken Thighs", "boneless chicken thighs", 899, 599), special("Kroger Dill Pickles", "dill", 349, 199)];

test("cook the specials: asks the store about what candidate recipes need to buy, most-needed first", () => {
  const terms = cookTheSpecialsTerms(candidates);
  assert.ok(terms.length > 5 && terms.length <= 45);
  assert.ok(terms.some((t) => t.term === "boneless chicken thighs" && t.department === "meat_seafood"));
  assert.ok(!terms.some((t) => /^(olive oil|kosher salt|black pepper)$/.test(t.term)), "shelf-stable staples aren't worth checking");
  assert.equal(new Set(terms.map((t) => t.term)).size, terms.length);
});

test("cook the specials: sale items match by key words, never another form; basics count for little", () => {
  assert.ok(isMinorSaleItem("yellow onion") && isMinorSaleItem("lime") && !isMinorSaleItem("boneless chicken thighs"));
  const salmon = candidates.find((c) => c.recipe.slug === "salmon-lemon-dill-yogurt-green-beans")!;
  assert.deepEqual(saleMatches(salmon, specials), [], "dill pickles aren't fresh dill");
  const chicken = candidates.find((c) => c.recipe.slug === "honey-garlic-chicken-broccoli")!;
  assert.deepEqual(saleMatches(chicken, specials).map((m) => m.item), ["boneless chicken thighs"]);
});

test("cook the specials: the week leans on what's on sale, and says where the prices came from", () => {
  const days = chooseDinnerDays(WEEK, 3);
  const plan = planWeek({ days, candidates, mode: "cook_the_specials", goals: profile.goals.ranked, servings: 2, specials, specialsSource: { storeName: "Pick 'n Save Oak Creek", checkedAt: "2026-11-08T18:00:00Z" } });
  const ids = plan.picks.map((p) => candidates.find((c) => c.recipe.id === p.recipeId)!);
  assert.ok(ids.some((r) => saleMatches(r, specials).length > 0), "at least one dinner uses the sale chicken");
  assert.ok(plan.picks.some((p) => p.note === "On sale: boneless chicken thighs (33% off)"));
  assert.match(plan.summary, /on sale at Pick 'n Save Oak Creek \(boneless chicken thighs\) — sale prices can change/);
  const none = planWeek({ days, candidates, mode: "cook_the_specials", goals: profile.goals.ranked, servings: 2 });
  assert.match(none.summary, /no sale prices were available/);
  assert.equal(none.picks.length, 3, "still a full, sensible week without sale data");
});
