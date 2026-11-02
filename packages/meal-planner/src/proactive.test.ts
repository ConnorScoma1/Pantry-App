import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PantryItem } from "@kitchen-pantry/shared-types";
import { rankRecipes, testKitchenRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import type { Special } from "@kitchen-pantry/grocery-pricing";
import {
  assembleWeeklyDraft,
  draftWeek,
  localParts,
  planWeek as rulesPlan,
  weeklyDraftDays,
  weeklyDraftMessage,
  weeklyPlanInput,
  weeklySchedule,
  type WeeklyDraftContext,
} from "./index";

const WEEK = "2026-11-09";
const TODAY = "2026-11-07";
const profile = (() => {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.household.dinnersPerWeek = 5;
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven"];
  p.desserts.frequency = "never";
  return p;
})();
const thighs: PantryItem = {
  id: "p1", ingredientId: null, name: "Chicken thighs", category: "protein", quantity: 2, unit: "lb", storageLocation: "fridge",
  purchasedOn: null, useBy: "2026-11-09", openedOn: null, estimatedRemainingPct: null, pricePaidCents: null, isStaple: false, createdAt: "", updatedAt: "",
};
const ctx: RankingContext = { profile, pantry: [thighs], today: TODAY, favorites: new Set(), ratings: new Map(), myRatings: new Map() };
const ranked = rankRecipes(testKitchenRecipes, ctx);
const candidates = ranked.recipes;
const desserts = rankRecipes(testKitchenRecipes, ctx, { course: "dessert" }).recipes;

test("weekly drafts: the drafting time is read in the household's own time zone", () => {
  const sat = new Date("2026-11-07T15:30:00Z"); // 9:30 AM in Chicago, Sunday 2:30 AM in Sydney
  assert.deepEqual(localParts(sat, "America/Chicago"), { date: "2026-11-07", isoDay: 6, hour: 9 });
  const chicago = weeklySchedule({ runDay: 6, runHour: 9, timeZone: "America/Chicago" }, sat);
  assert.deepEqual(chicago, { weekStart: WEEK, due: true, runDate: "2026-11-07", label: "Saturday at 9 AM" });
  assert.equal(weeklySchedule({ runDay: 6, runHour: 10, timeZone: "America/Chicago" }, sat).due, false, "not until 10");
  const sydney = weeklySchedule({ runDay: 6, runHour: 9, timeZone: "Australia/Sydney" }, sat);
  assert.equal(sydney.due, true, "already Sunday there");
  assert.equal(sydney.weekStart, WEEK);
  assert.equal(weeklySchedule({ runDay: 7, runHour: 0, timeZone: "Not/AZone" }, sat).label, "Sunday at midnight", "unknown zones fall back to UTC");
});

test("weekly drafts: plans the household's usual dinner nights, or nothing if dinner isn't planned", () => {
  const days = weeklyDraftDays(profile, WEEK);
  assert.equal(days.length, 5);
  assert.ok(days.every((d) => d >= WEEK && d <= "2026-11-15"));
  const noDinner = { household: { ...profile.household, mealsIncluded: ["lunch" as const] } };
  assert.deepEqual(weeklyDraftDays(noDinner, WEEK), []);
});

test("weekly drafts: unsafe or repeated picks are dropped, open nights are filled, and the draft is never confirmed", () => {
  const input = weeklyPlanInput({ weekStart: WEEK, profile, candidates, mode: "use_what_i_have" });
  const hiddenId = ranked.hidden[0]?.recipe.id ?? "not-a-recipe";
  const first = candidates[0]!.recipe.id;
  const draft = assembleWeeklyDraft({
    input,
    weekStart: WEEK,
    profile,
    result: {
      source: "ai",
      summary: "Claude's week",
      picks: [
        { date: input.days[0]!, recipeId: first, servings: 2, note: "AI pick" },
        { date: input.days[1]!, recipeId: first, servings: 2, note: "repeat" },
        { date: input.days[2]!, recipeId: hiddenId, servings: 2, note: "not allowed" },
        { date: "2026-12-01", recipeId: candidates[1]!.recipe.id, servings: 2, note: "wrong week" },
      ],
    },
    dessertCandidates: desserts,
  })!;
  assert.ok(draft);
  assert.equal(draft.dinners, 5);
  const ids = draft.plan.meals.map((m) => m.recipeId);
  assert.equal(new Set(ids).size, 5, "no repeats");
  assert.ok(!ids.includes(hiddenId));
  assert.ok(draft.plan.meals.every((m) => m.date >= WEEK && m.date <= "2026-11-15" && m.mealType === "dinner"));
  assert.equal(draft.plan.confirmedAt, null);
  assert.equal(draft.plan.generatedBy, "ai", "Claude's pick stays and is credited");
  assert.equal(draft.details.source, "ai");
});

test("weekly drafts: says what it uses up, and that nothing was bought", () => {
  const input = weeklyPlanInput({ weekStart: WEEK, profile, candidates, mode: "use_what_i_have" });
  const draft = assembleWeeklyDraft({ input, weekStart: WEEK, profile, result: { picks: [], summary: "", source: "rules" }, dessertCandidates: desserts })!;
  assert.equal(draft.details.source, "rules");
  assert.ok(draft.details.useSoon.includes("chicken thighs"), draft.details.useSoon.join(","));
  assert.match(draft.message, /^5 dinners for the week of Nov 9\. Uses up your chicken thighs/);
  assert.match(draft.message, /Nothing was bought/);
  assert.equal(draft.plan.meals.filter((m) => m.mealType === "dessert").length, 0, "no desserts when the household said never");
});

test("weekly drafts: desserts only as often as the household asked", () => {
  const weekly = { ...profile, desserts: { ...profile.desserts, frequency: "weekly" as const } };
  const input = weeklyPlanInput({ weekStart: WEEK, profile: weekly, candidates, mode: "balanced" });
  const draft = assembleWeeklyDraft({ input, weekStart: WEEK, profile: weekly, result: { picks: [], summary: "", source: "rules" }, dessertCandidates: desserts })!;
  const sweet = draft.plan.meals.filter((m) => m.mealType === "dessert");
  assert.ok(sweet.length <= 1);
  if (desserts.length > 0) assert.equal(sweet.length, 1);
});

test("weekly drafts: nothing to plan when the household has no dinner nights", () => {
  const none = { ...profile, household: { ...profile.household, dinnersPerWeek: 0 } };
  const input = weeklyPlanInput({ weekStart: WEEK, profile: none, candidates, mode: "balanced" });
  assert.equal(assembleWeeklyDraft({ input, weekStart: WEEK, profile: none, result: { picks: [], summary: "", source: "rules" }, dessertCandidates: [] }), null);
});

test("weekly drafts: the notice stays short and honest", () => {
  assert.equal(
    weeklyDraftMessage(WEEK, 1, { useSoon: [], specialsUsed: 3, storeName: "Kroger Oak Creek", unfilled: 2 }),
    "1 dinner for the week of Nov 9. 3 things on sale at Kroger Oak Creek. 2 nights left open. Nothing was bought — review and confirm when you're ready.",
  );
  assert.ok(!weeklyDraftMessage(WEEK, 4, { useSoon: [], specialsUsed: 2, storeName: null, unfilled: 0 }).includes("on sale"), "no store, no sale claim");
  const long = weeklyDraftMessage(WEEK, 5, { useSoon: ["x".repeat(200), "y".repeat(200)], specialsUsed: 0, storeName: null, unfilled: 0 });
  assert.ok(long.length <= 300);
});

const context = (over: Partial<WeeklyDraftContext> = {}): WeeklyDraftContext => ({
  weekStart: WEEK, today: TODAY, mode: "balanced", profile, pantry: [thighs], favorites: [], ratings: [], events: [], summaries: [],
  recipes: testKitchenRecipes, store: null, ...over,
});
const rules = { plan: async (input: Parameters<typeof rulesPlan>[0]) => ({ ...rulesPlan(input), source: "rules" as const }) };
const saleThighs: Special = {
  id: "kroger:1", provider: "kroger", retailer: "kroger", storeId: "01400376", productId: "1", name: "Kroger Boneless Skinless Chicken Thighs", brand: "Kroger",
  sizeLabel: null, department: "meat_seafood", matchedTerm: "boneless chicken thighs", regularCents: 899, saleCents: 599, percentOff: 33, soldByWeight: false,
  unitPrice: null, promoType: "sale", requiresMembership: null, requiresCoupon: null, endsOn: null, sourceUrl: null, availability: "in_stock", observedAt: "2026-11-07T15:00:00Z",
};

test("draft week: a dismissed recipe never comes back, and recently cooked ones are steered away from", async () => {
  const first = await draftWeek(context(), rules);
  assert.ok("draft" in first);
  const picked = first.draft.plan.meals[0]!.recipeId!;
  const dismissed = await draftWeek(context({ events: [{ recipeId: picked, event: "dismissed", surface: "recipes", createdAt: "2026-11-01T00:00:00Z" }] }), rules);
  assert.ok("draft" in dismissed && !dismissed.draft.plan.meals.some((m) => m.recipeId === picked));
  const asked: Array<ReadonlySet<string> | undefined> = [];
  await draftWeek(context({ events: [{ recipeId: picked, event: "cooked", surface: "detail", createdAt: "2026-11-05T19:00:00Z" }] }), {
    plan: async (input) => {
      asked.push(input.avoid);
      return { ...rulesPlan(input), source: "rules" };
    },
  });
  assert.ok(asked[0]?.has(picked));
});

test("draft week: Cook the Specials uses real sale prices, or says plainly why it planned like Balanced", async () => {
  const noPrices = await draftWeek(context({ mode: "cook_the_specials" }), rules);
  assert.ok("draft" in noPrices && /aren't connected/.test(noPrices.draft.details.notes[0]!));
  const noStore = await draftWeek(context({ mode: "cook_the_specials" }), { ...rules, specials: async () => ({ ok: true, specials: [], checkedAt: "" }) });
  assert.ok("draft" in noStore && /No store is chosen/.test(noStore.draft.details.notes[0]!));
  let terms = 0;
  const onSale = await draftWeek(context({ mode: "cook_the_specials", pantry: [], store: { storeId: "01400376", name: "Kroger Oak Creek" } }), {
    ...rules,
    specials: async (_store, t) => {
      terms = t.length;
      return { ok: true, specials: [saleThighs], checkedAt: "2026-11-07T15:00:00Z" };
    },
  });
  assert.ok(terms > 0);
  assert.ok("draft" in onSale);
  assert.equal(onSale.draft.details.storeName, "Kroger Oak Creek");
  assert.ok(onSale.draft.details.specialsUsed >= 1, "the chicken thighs on sale were used");
  assert.match(onSale.draft.message, /on sale at Kroger Oak Creek/);
  const down = await draftWeek(context({ mode: "cook_the_specials", store: { storeId: "1", name: "Kroger" } }), { ...rules, specials: async () => ({ ok: false, message: "Kroger isn't responding right now." }) });
  assert.ok("draft" in down && /Kroger isn't responding right now\. This week was planned like Balanced\./.test(down.draft.details.notes[0]!));
});

test("draft week: skips with a reason instead of drafting nothing", async () => {
  const noDinner = await draftWeek(context({ profile: { ...profile, household: { ...profile.household, mealsIncluded: ["lunch"] } } }), rules);
  assert.ok("skip" in noDinner && /Dinner isn't one of the meals/.test(noDinner.skip));
  const noRecipes = await draftWeek(context({ recipes: [] }), rules);
  assert.ok("skip" in noRecipes);
});
