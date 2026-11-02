import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import {
  easter,
  holidayDate,
  holidayWhen,
  produceSearchName,
  seasonalPicks,
  MOVING_DATES,
  matchProduce,
  rankRecipes,
  regionFor,
  seasonalContext,
  seasonOn,
  signatureProduce,
  testKitchenRecipes,
  upcomingHolidays,
  type RankingContext,
} from "./index";

function profile(patch: (p: OnboardingProfile) => void = () => {}): OnboardingProfile {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.goals.ranked = ["reduce_waste"];
  p.equipment = ["stove", "oven", "stand_mixer", "blender"];
  patch(p);
  return p;
}
const ctx = (p: OnboardingProfile, today: string): RankingContext => ({
  profile: p,
  pantry: [],
  today,
  favorites: new Set(),
  ratings: new Map(),
  myRatings: new Map(),
  dismissed: new Set(),
  seasonal: seasonalContext(p, today),
});

test("seasons: region comes from country and ZIP/postcode, or the household's override", () => {
  assert.equal(regionFor("US", "53132").code, "north-cold", "Wisconsin");
  assert.equal(regionFor("US", "33101").code, "north-warm", "Florida");
  assert.equal(regionFor("US", "90210").code, "north-warm", "Southern California");
  assert.equal(regionFor("US", "94103").code, "north-temperate", "San Francisco");
  assert.equal(regionFor("US", "10001").code, "north-temperate", "New York");
  assert.equal(regionFor("AU", "2000").code, "south-temperate", "Sydney");
  assert.equal(regionFor("AU", "4000").code, "south-warm", "Brisbane");
  assert.equal(regionFor("CA", "M5V 2T6").code, "north-cold");
  assert.equal(regionFor("US", "53132", "south-temperate").hemisphere, "south");
  assert.match(regionFor("US", "53132").basis, /ZIP 53132 \(WI\)/);
});

test("seasons: change automatically with the date, by climate and hemisphere", () => {
  const cold = regionFor("US", "53132");
  const temperate = regionFor("US", "10001");
  const warm = regionFor("US", "33101");
  const sydney = regionFor("AU", "2000");
  assert.equal(seasonOn("2026-11-01", cold), "fall");
  assert.equal(seasonOn("2026-11-20", cold), "winter", "cold winters arrive mid-November");
  assert.equal(seasonOn("2026-11-20", temperate), "fall");
  assert.equal(seasonOn("2027-02-20", warm), "spring", "warm springs arrive mid-February");
  assert.equal(seasonOn("2027-02-20", temperate), "winter");
  assert.equal(seasonOn("2027-01-10", sydney), "summer", "Southern Hemisphere");
  assert.equal(seasonOn("2026-07-01", sydney), "winter");
  assert.equal(seasonOn("2026-12-31", temperate), "winter");
});

test("seasons: produce from the USDA guide, year-round staples left out", () => {
  const fall = signatureProduce("fall").map((p) => p.name);
  assert.ok(fall.includes("Winter Squash") && fall.includes("Brussels Sprouts") && fall.includes("Cranberries"));
  assert.ok(!fall.includes("Apples") && !fall.includes("Onions") && !fall.includes("Lemons"), "on the list all year");
  assert.ok(!fall.includes("Herbs"));
  const summer = signatureProduce("summer");
  assert.equal(matchProduce("zucchini", summer)?.name, "Zucchini");
  assert.equal(matchProduce("cherry tomatoes", summer)?.name, "Tomatoes");
  assert.equal(matchProduce("strawberries", summer)?.name, "Strawberries");
  assert.equal(matchProduce("butternut squash", signatureProduce("fall"))?.name, "Winter Squash");
  assert.equal(matchProduce("sweet potatoes", signatureProduce("winter"))?.name, "Sweet Potatoes & Yams");
  assert.equal(matchProduce("tomato paste", signatureProduce("winter")), null);
});

test("holidays: computed dates and opt-in only", () => {
  assert.deepEqual([2026, 2027, 2028, 2029, 2030].map(easter), ["2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21"]);
  assert.equal(holidayDate("thanksgiving", 2026)!.start, "2026-11-26");
  assert.equal(holidayDate("thanksgiving-ca", 2026)!.start, "2026-10-12");
  assert.equal(holidayDate("mothers-day", 2026, "US")!.start, "2026-05-10");
  assert.equal(holidayDate("mothers-day", 2026, "GB")!.start, "2026-03-15", "Mothering Sunday");
  assert.equal(holidayDate("fathers-day", 2026, "US")!.start, "2026-06-21");
  assert.deepEqual(upcomingHolidays([], "2026-11-20", 14), [], "nothing assumed");
  assert.deepEqual(upcomingHolidays(["thanksgiving", "christmas"], "2026-11-20", 14).map((h) => h.code), ["thanksgiving"]);
  assert.deepEqual(upcomingHolidays(["new-year"], "2026-12-28", 14).map((h) => h.start), ["2027-01-01"], "across the new year");
});

test("holidays: lunar and lunisolar dates come from the checked table", () => {
  assert.equal(holidayDate("diwali", 2026)!.start, "2026-11-08");
  assert.equal(holidayDate("lunar-new-year", 2027)!.start, "2027-02-06");
  assert.deepEqual([holidayDate("passover", 2026)!.start, holidayDate("passover", 2026)!.end], ["2026-04-02", "2026-04-09"]);
  const fitr = holidayDate("eid-al-fitr", 2027)!;
  assert.ok(fitr.approximate, "Eid depends on the moon sighting");
  assert.equal(holidayWhen(fitr), "around Tue, Mar 9 – Wed, Mar 10");
  assert.equal(holidayDate("diwali", 2031), null, "no guessing past the table");
  // Hanukkah 2027 runs into 2028 and is still found from early January.
  assert.deepEqual(upcomingHolidays(["hanukkah"], "2028-01-01", 14).map((h) => h.start), ["2027-12-25"]);
  assert.deepEqual(upcomingHolidays(["diwali", "hanukkah", "thanksgiving"], "2026-11-01", 14).map((h) => h.code), ["diwali"]);
  for (const [code, years] of Object.entries(MOVING_DATES)) {
    for (const [y, [start, end]] of Object.entries(years!)) {
      assert.equal(start.slice(0, 4), y, `${code} ${y} starts in its year`);
      if (end) assert.ok(end >= start, `${code} ${y}`);
    }
  }
});

test("seasons nudge recipes but never hide any", () => {
  const today = "2026-10-20"; // fall in Wisconsin
  const on = rankRecipes(testKitchenRecipes, ctx(profile(), today), { course: "any", includeAboveSkill: true });
  const off = rankRecipes(testKitchenRecipes, ctx(profile((p) => { p.seasonal = { ...p.seasonal, enabled: false }; }), today), { course: "any", includeAboveSkill: true });
  assert.equal(on.recipes.length, off.recipes.length, "same recipes either way");
  const crispOn = on.recipes.find((r) => r.recipe.slug === "apple-oat-crisp")!;
  const crispOff = off.recipes.find((r) => r.recipe.slug === "apple-oat-crisp")!;
  assert.ok(crispOn.score > crispOff.score, "a fall dessert gets a fall nudge");
  assert.ok(crispOn.reasons.some((r) => /fall favourite/.test(r)));
  const spinach = on.recipes.find((r) => r.recipe.slug === "creamy-garlic-chicken-spinach-parmesan")!;
  assert.deepEqual(spinach.inSeason, ["Spinach"]);
  assert.ok(spinach.reasons.some((r) => /In season now: spinach/.test(r)));
  const shortcakeOn = on.recipes.find((r) => r.recipe.slug === "strawberry-buttermilk-shortcakes")!;
  const shortcakeOff = off.recipes.find((r) => r.recipe.slug === "strawberry-buttermilk-shortcakes")!;
  assert.equal(shortcakeOn.score, shortcakeOff.score, "out-of-season recipes aren't penalised");
});

test("seasons: desserts and meals can be switched separately; holidays only when picked", () => {
  const today = "2026-11-20";
  const noDesserts = rankRecipes(testKitchenRecipes, ctx(profile((p) => { p.seasonal = { ...p.seasonal, desserts: false }; }), today), { course: "dessert", includeAboveSkill: true });
  assert.ok(noDesserts.recipes.every((r) => (r.inSeason ?? []).length === 0));
  const withThanksgiving = rankRecipes(
    testKitchenRecipes,
    ctx(profile((p) => { p.seasonal = { ...p.seasonal, holidayOptIns: ["thanksgiving"] }; }), today),
    { course: "dessert", includeAboveSkill: true },
  );
  const crisp = withThanksgiving.recipes.find((r) => r.recipe.slug === "apple-oat-crisp")!;
  assert.ok(crisp.reasons.some((r) => /For Thanksgiving \(US\) \(Thu, Nov 26\)/.test(r)));
  const notPicked = rankRecipes(testKitchenRecipes, ctx(profile(), today), { course: "dessert", includeAboveSkill: true });
  assert.ok(!notPicked.recipes.find((r) => r.recipe.slug === "apple-oat-crisp")!.reasons.some((r) => /Thanksgiving/.test(r)));
});

test("in season this week: seasonal dinners, one dessert, and opted-in holiday ideas", () => {
  const today = "2026-11-20";
  const p = profile((x) => { x.seasonal = { ...x.seasonal, holidayOptIns: ["thanksgiving"] }; });
  const c = ctx(p, today);
  const picks = seasonalPicks(rankRecipes(testKitchenRecipes, c, { course: "any" }).recipes, c.seasonal!);
  assert.ok(picks.meals.length > 0 && picks.meals.every((r) => r.recipe.course === "main"));
  assert.equal(picks.dessert?.recipe.slug, "gingerbread-snack-cake", "late November in Wisconsin is winter");
  assert.deepEqual(picks.holidays.map((h) => [h.code, h.when]), [["thanksgiving", "Thu, Nov 26"]]);
  assert.ok(picks.holidays[0]!.recipes.some((r) => r.recipe.slug === "apple-oat-crisp"));
  const noDesserts = ctx(profile((x) => { x.seasonal = { ...x.seasonal, desserts: false }; }), today);
  assert.equal(seasonalPicks(rankRecipes(testKitchenRecipes, noDesserts, { course: "any" }).recipes, noDesserts.seasonal!).dessert, null);
  assert.equal(produceSearchName("Sweet Potatoes & Yams"), "sweet potatoes");
});
