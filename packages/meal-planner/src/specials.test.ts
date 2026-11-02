import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Special } from "@kitchen-pantry/grocery-pricing";
import { seasonalContext } from "@kitchen-pantry/recipe-engine";
import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { specialsTerms, viewSpecials } from "./index";

function profile(patch: (p: OnboardingProfile) => void = () => {}): OnboardingProfile {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.goals.ranked = ["save_money"];
  patch(p);
  return p;
}

let n = 0;
function special(name: string, department: Special["department"], matchedTerm: string, regular: number, sale: number, unit: Special["unitPrice"] = null): Special {
  n++;
  return {
    id: `kroger:${n}`, provider: "kroger", retailer: "kroger", storeId: "01400376", productId: String(n), name, brand: null, sizeLabel: null,
    department, matchedTerm, regularCents: regular, saleCents: sale, percentOff: Math.floor(((regular - sale) / regular) * 100),
    soldByWeight: false, unitPrice: unit, promoType: "sale", requiresMembership: null, requiresCoupon: null, endsOn: null, sourceUrl: null,
    availability: "in_stock", observedAt: "2026-11-01T18:00:00Z",
  };
}

test("specials terms: the list first, then the season, then staples; checked items skipped", () => {
  const p = profile();
  const terms = specialsTerms({
    groceryItems: [
      { name: "Chicken thighs", department: "meat_seafood", checked: false },
      { name: "Milk", department: "dairy", checked: true },
      { name: "Brussels sprouts!", department: "produce", checked: false },
    ],
    seasonal: seasonalContext(p, "2026-11-01"),
  });
  assert.deepEqual(terms.slice(0, 2).map((t) => t.term), ["chicken thighs", "brussels sprouts"]);
  assert.ok(terms.some((t) => t.term === "milk"), "milk still comes in as a staple");
  assert.equal(new Set(terms.map((t) => t.term)).size, terms.length, "no duplicates (chicken thighs is also a staple)");
  assert.ok(terms.length <= 45);
  const off = specialsTerms({ groceryItems: [], seasonal: null });
  assert.ok(off.every((t) => t.term !== "cranberries"), "no season terms when seasons are off");
});

test("specials view: household items first, diet screened, filters and sorts", () => {
  const list = [
    special("Simple Truth Chicken Thighs", "meat_seafood", "chicken thighs", 899, 699, { regularCents: 300, saleCents: 233, per: "lb" }),
    special("Kroger Peanut Butter", "pantry", "peanut butter", 349, 249, { regularCents: 22, saleCents: 16, per: "oz" }),
    special("Brussels Sprouts", "produce", "brussels sprouts", 399, 299, { regularCents: 25, saleCents: 19, per: "oz" }),
    special("Kroger Large Eggs", "dairy", "eggs", 399, 199),
    special("Wild Salmon Fillet", "meat_seafood", "salmon", 1299, 999, { regularCents: 1299, saleCents: 999, per: "lb" }),
  ];
  const p = profile((x) => {
    x.diet.allergies = ["peanut"];
    x.householdDiet = { allergies: ["fish"], restrictions: [], dislikes: [], neverRecommend: [], memberCount: 2 };
  });
  const ctx = { profile: p, listNames: ["Chicken thighs"], seasonal: seasonalContext(p, "2026-11-01") };
  const v = viewSpecials(list, ctx);
  assert.deepEqual(v.shown.map((s) => s.special.name), ["Simple Truth Chicken Thighs", "Brussels Sprouts", "Kroger Large Eggs"], "list item first, then in-season produce, then biggest discount");
  assert.equal(v.hiddenForDiet, 2, "a household member's fish allergy counts too");
  assert.ok(v.shown[1]!.inSeason);

  const all = viewSpecials(list, ctx, { fitsDiet: false, sort: "discount" });
  assert.equal(all.shown[0]!.special.name, "Kroger Large Eggs");
  assert.ok(all.shown.find((s) => s.special.name.includes("Peanut"))!.conflicts[0]!.startsWith("May contain peanuts"));

  assert.deepEqual(viewSpecials(list, ctx, { department: "produce" }).shown.map((s) => s.special.name), ["Brussels Sprouts"]);
  assert.deepEqual(viewSpecials(list, ctx, { minPercentOff: 40 }).shown.map((s) => s.special.name), ["Kroger Large Eggs"]);
  assert.deepEqual(viewSpecials(list, ctx, { query: "sprout" }).shown.length, 1);
  const byUnit = viewSpecials(list, ctx, { fitsDiet: false, sort: "unit_price" }).shown.map((s) => s.special.name);
  assert.equal(byUnit.at(-1), "Kroger Large Eggs", "no unit price sorts last");

  const veg = viewSpecials(list, { profile: profile((x) => { x.diet.style = "vegetarian"; }), listNames: [] });
  assert.ok(!veg.shown.some((s) => s.special.department === "meat_seafood"));
});
