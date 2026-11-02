import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RecipeRating, RecommendationEvent } from "@kitchen-pantry/shared-types";
import { testKitchenRecipes } from "../catalog/test-kitchen";
import { rankRecipes, type RankingContext } from "../recipes";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import {
  applyVariety,
  buildMenu,
  collapseVersions,
  createDuplicateIndex,
  dishKeyFor,
  facetsOf,
  libraryOf,
  MENU_TEMPLATES,
  normalizeUnit,
  parseQuantity,
  parseRecipeRequest,
  prepareRecipe,
  searchLibrary,
  slugify,
  stableUuid,
  varietyHistory,
  type LibraryRecipeInput,
  type LibrarySourceInput,
} from "./index";

const SOURCE: LibrarySourceInput = { name: "Kitchen Pantry Test Kitchen", kind: "original", license: "owned" };

const padThai = (over: Partial<LibraryRecipeInput> = {}): LibraryRecipeInput => ({
  externalId: "pad-thai-1",
  title: "Pad Thai",
  description: "Rice noodles tossed with tamarind, fish sauce and palm sugar.",
  cuisine: "thai",
  authenticity: "traditional",
  skillLevel: 3,
  prepMinutes: 25,
  cookMinutes: 10,
  servings: 4,
  equipment: ["stove"],
  ingredients: [
    { quantity: 8, unit: "ounces", item: "dried flat rice noodles" },
    { quantity: "3", unit: "Tbsp", item: "tamarind concentrate" },
    { quantity: "2 1/2", unit: "tablespoons", item: "fish sauce" },
    { quantity: 12, unit: "oz", item: "shrimp", preparation: "peeled and deveined" },
    { quantity: 2, unit: null, item: "eggs" },
    { quantity: "½", unit: "cup", item: "roasted peanuts", preparation: "chopped" },
  ],
  steps: [
    { body: "Soak the noodles in warm water until pliable, about 20 minutes; drain.", minutes: 20 },
    { body: "Stir-fry the shrimp in a hot wok until pink and opaque, then push aside and scramble the eggs.", safeF: 145 },
    { body: "Add the noodles and sauce and toss until glossy; finish with peanuts." },
  ],
  ...over,
});

test("library ids: stable ids and slugs", () => {
  assert.equal(stableUuid("a"), stableUuid("a"));
  assert.notEqual(stableUuid("a"), stableUuid("b"));
  assert.match(stableUuid("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(slugify("Crème Brûlée & Friends!"), "creme-brulee-and-friends");
});

test("library units: standard spellings and readable amounts", () => {
  assert.equal(normalizeUnit("Tablespoons"), "tbsp");
  assert.equal(normalizeUnit("T"), "tbsp");
  assert.equal(normalizeUnit("t"), "tsp");
  assert.equal(normalizeUnit("lbs."), "lb");
  assert.equal(normalizeUnit(""), null);
  assert.equal(normalizeUnit("handfuls"), undefined);
  assert.equal(parseQuantity("1 1/2"), 1.5);
  assert.equal(parseQuantity("1½"), 1.5);
  assert.equal(parseQuantity("3/4"), 0.75);
  assert.equal(parseQuantity("a bit"), undefined);
  assert.equal(parseQuantity(null), null);
});

test("library import: a good record is normalised, tagged and capped at 'not yet reviewed'", () => {
  const r = prepareRecipe(padThai({ status: "tested" }), SOURCE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const { recipe, warnings } = r;
  assert.equal(recipe.library.status, "pending_review", "feeds can't mark recipes tested");
  assert.ok(warnings.some((w) => w.field === "status"));
  assert.deepEqual(recipe.ingredients.map((i) => i.unit), ["oz", "tbsp", "tbsp", "oz", null, "cup"]);
  assert.equal(recipe.ingredients[2]!.quantity, 2.5);
  assert.equal(recipe.steps[1]!.safeInternalTempC, 62.8);
  assert.deepEqual(recipe.facets.allergens, ["egg", "fish", "peanut", "shellfish"]);
  assert.ok(recipe.facets.proteins.includes("shellfish"));
  assert.ok(!recipe.facets.dietTags.includes("vegetarian"));
  assert.ok(recipe.facets.dietTags.includes("gluten_free"));
  assert.ok(recipe.library.methods.includes("stir_fry"));
  assert.ok(recipe.library.categories.includes("dinner"));
  assert.equal(recipe.library.dishKey, "pad-thai");
  assert.equal(recipe.library.authenticity, "traditional");
  // Same source record → same id (re-imports update instead of duplicating).
  const again = prepareRecipe(padThai(), SOURCE);
  assert.ok(again.ok && again.recipe.id === recipe.id && again.recipe.slug === recipe.slug);
  const reviewed = prepareRecipe(padThai({ status: "reviewed" }), SOURCE);
  assert.ok(reviewed.ok && reviewed.recipe.library.status === "pending_review" && reviewed.recipe.review === null);
});

test("library import: implausible amounts, unknown units and markup are rejected", () => {
  const bad = prepareRecipe(
    padThai({
      ingredients: [
        { quantity: 100, unit: "cup", item: "salt" },
        { quantity: 2, unit: "handfuls", item: "bean sprouts" },
        { quantity: "lots", unit: "tsp", item: "sugar" },
        { quantity: null, unit: "cup", item: "stock" },
      ],
      steps: [{ body: "See https://example.com for the method." }, { body: "ok" }],
    }),
    SOURCE,
  );
  assert.equal(bad.ok, false);
  const fields = !bad.ok ? bad.errors.map((e) => e.field) : [];
  for (const f of ["ingredients[0].quantity", "ingredients[1].unit", "ingredients[2].quantity", "ingredients[3].quantity", "steps[0]", "steps[1]"]) assert.ok(fields.includes(f), f);
});

test("library import: USDA safe temperatures are enforced; raw dishes need a safety note", () => {
  const chicken = (safeF?: number): LibraryRecipeInput => ({
    externalId: `c-${safeF}`,
    title: "Roast Chicken",
    cuisine: "french",
    skillLevel: 2,
    prepMinutes: 15,
    cookMinutes: 70,
    servings: 4,
    ingredients: [
      { quantity: 4, unit: "lb", item: "whole chicken" },
      { quantity: 2, unit: "tbsp", item: "butter" },
    ],
    steps: [{ body: "Heat the oven to 425°F and season the chicken all over.", tempF: 425 }, { body: "Roast until the thigh reaches a safe temperature.", minutes: 70, safeF }],
  });
  assert.ok(prepareRecipe(chicken(165), SOURCE).ok);
  const low = prepareRecipe(chicken(150), SOURCE);
  assert.ok(!low.ok && low.errors.some((e) => /165°F/.test(e.message)));
  const missing = prepareRecipe(chicken(undefined), SOURCE);
  assert.ok(!missing.ok);
  const tooLow = prepareRecipe(chicken(130), SOURCE);
  assert.ok(!tooLow.ok && tooLow.errors.some((e) => /below the USDA minimum/.test(e.message)));

  const ceviche: LibraryRecipeInput = {
    externalId: "ceviche",
    title: "Peruvian Ceviche",
    cuisine: "peruvian",
    skillLevel: 2,
    prepMinutes: 25,
    cookMinutes: 0,
    servings: 4,
    course: "starter",
    ingredients: [
      { quantity: 1, unit: "lb", item: "sea bass fillet", preparation: "very fresh, diced" },
      { quantity: 0.75, unit: "cup", item: "lime juice" },
      { quantity: 1, unit: null, item: "red onion", preparation: "thinly sliced" },
    ],
    steps: [{ body: "Cure the diced fish in the lime juice with salt for 10 minutes.", minutes: 10 }, { body: "Fold in the onion and serve right away, cold." }],
  };
  const noNote = prepareRecipe(ceviche, SOURCE);
  assert.ok(!noNote.ok && noNote.errors.some((e) => e.field === "safetyNote"));
  const withNote = prepareRecipe({ ...ceviche, safetyNote: "Use very fresh fish bought for eating raw; lime doesn't kill parasites. Not for pregnant people, young children or anyone with a weak immune system." }, SOURCE);
  assert.ok(withNote.ok, JSON.stringify(!withNote.ok && withNote.errors));
  assert.ok(withNote.ok && withNote.recipe.library.methods.includes("raw"));
});

test("library import: ideas, licences, photos and nutrition", () => {
  const idea = prepareRecipe({ externalId: "idea-1", title: "Pad See Ew", cuisine: "thai", skillLevel: 2, status: "idea" }, SOURCE);
  assert.ok(idea.ok && idea.recipe.library.status === "idea");
  assert.ok(!prepareRecipe(padThai(), { ...SOURCE, license: "cc-by-sa-4.0" as const }).ok, "CC BY-SA needs attribution");
  assert.ok(!prepareRecipe(padThai(), { ...SOURCE, license: "whatever" as never }).ok);
  const pic = prepareRecipe(padThai({ image: { url: "http://x.example/a.jpg" }, nutrition: { calories: 500 } }), SOURCE);
  assert.ok(pic.ok && pic.recipe.image === null && pic.recipe.nutrition === null);
  assert.ok(pic.ok && pic.warnings.some((w) => w.field === "image") && pic.warnings.some((w) => w.field === "nutrition"));
  const declared = prepareRecipe(padThai({ declaredAllergens: ["sesame"] }), SOURCE);
  assert.ok(declared.ok && declared.recipe.facets.allergens.includes("sesame") && declared.recipe.facets.allergens.includes("peanut"));
});

test("library dedupe: same dish is caught, versions are allowed, renamed copies are flagged", () => {
  const base = prepareRecipe(padThai(), SOURCE);
  assert.ok(base.ok);
  const index = createDuplicateIndex([base.recipe]);
  const copy = prepareRecipe(padThai({ externalId: "other", title: "Easy Pad Thai" }), SOURCE);
  assert.ok(copy.ok);
  assert.equal(index.check(copy.recipe)[0]?.kind, "near_duplicate");
  const budget = prepareRecipe(padThai({ externalId: "budget", title: "Pad Thai", variant: "budget" }), SOURCE);
  assert.ok(budget.ok);
  assert.deepEqual(index.check(budget.recipe).map((m) => m.kind), ["version"]);
  const renamed = prepareRecipe(padThai({ externalId: "renamed", title: "Bangkok Street Noodles with Shrimp" }), SOURCE);
  assert.ok(renamed.ok);
  assert.equal(index.check(renamed.recipe)[0]?.kind, "renamed_duplicate");
  assert.equal(index.check(base.recipe)[0]?.kind, "same_record");
  assert.equal(dishKeyFor("Classic Easy Pad Thai (Budget)"), "pad-thai");
  const collapsed = collapseVersions([base.recipe, budget.recipe], (r) => r);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]!.otherVersions.length, 1);
});

test("library search: filters agree with the facts on each recipe", () => {
  const all = testKitchenRecipes;
  const thai = searchLibrary(all, { cuisines: ["thai"], limit: 50 });
  assert.ok(thai.total >= 1 && thai.recipes.every((r) => r.cuisine === "thai"));
  const noPeanut = searchLibrary(all, { excludeAllergens: ["peanut", "milk"], limit: 100 });
  assert.ok(noPeanut.recipes.every((r) => !facetsOf(r).allergens.includes("peanut") && !facetsOf(r).allergens.includes("milk")));
  const veg = searchLibrary(all, { diet: ["vegetarian"], limit: 100 });
  assert.ok(veg.total > 0 && veg.recipes.every((r) => facetsOf(r).dietTags.includes("vegetarian")));
  const quick = searchLibrary(all, { maxMinutes: 30, limit: 100 });
  assert.ok(quick.recipes.every((r) => r.totalMinutes <= 30));
  const text = searchLibrary(all, { text: "chicken" });
  assert.ok(text.total > 0 && /chicken/i.test(text.recipes[0]!.title));
  const noOven = searchLibrary(all, { equipment: ["stove"], limit: 100 });
  assert.ok(noOven.recipes.every((r) => r.requiredEquipment.every((e) => e === "stove")));
  // Rotation is stable for a seed and pages don't overlap.
  const a = searchLibrary(all, { seed: "h1:2026-11-01", limit: 5 });
  const b = searchLibrary(all, { seed: "h1:2026-11-01", limit: 5, offset: 5 });
  assert.deepEqual(a.recipes.map((r) => r.id), searchLibrary(all, { seed: "h1:2026-11-01", limit: 5 }).recipes.map((r) => r.id));
  assert.ok(a.recipes.every((r) => !b.recipes.some((x) => x.id === r.id)));
  assert.equal(libraryOf(all[0]!).status, "pending_review");
});

test("library natural-language requests", () => {
  const thai = parseRecipeRequest("Make me an authentic Thai dinner for four under $50.");
  assert.deepEqual(thai.query.cuisines, ["thai"]);
  assert.deepEqual(thai.query.authenticity, ["traditional", "regional"]);
  assert.equal(thai.servings, 4);
  assert.equal(thai.budgetCents, 5000);
  assert.equal(thai.wantsMenu, true);
  assert.equal(thai.menuTemplate, "thai-dinner");
  assert.deepEqual(thai.understood, ["Thai", "Traditional", "For 4", "Under $50"]);

  const wellington = parseRecipeRequest("I want a restaurant-quality beef Wellington.");
  assert.equal(wellington.query.text, "beef wellington");
  assert.equal(wellington.query.minSkill, 3);
  assert.equal(wellington.wantsMenu, false);

  const thighs = parseRecipeRequest("Give me five cheap dinners using chicken thighs.");
  assert.equal(thighs.count, 5);
  assert.deepEqual(thighs.query.ingredients, ["chicken thighs"]);
  assert.ok(thighs.understood.includes("Budget"));
  assert.equal(thighs.query.categories, undefined, "'cheap' ranks by price; it isn't a hard filter");

  const tower = parseRecipeRequest("Build a seafood tower for six people.");
  assert.equal(tower.servings, 6);
  assert.equal(tower.menuTemplate, "luxury-seafood");
  assert.ok(tower.query.categories?.includes("seafood_raw_bar"));

  const different = parseRecipeRequest("I want something completely different from what we ate last week.");
  assert.equal(different.variety, "adventurous");
  assert.equal(different.avoidRecent, true);
  assert.equal(different.query.text, undefined);

  assert.equal(parseRecipeRequest("tacos for a party").servings, null);
  assert.deepEqual(parseRecipeRequest("air fryer dinners").query.needsEquipment, ["air_fryer"]);
  assert.deepEqual(parseRecipeRequest("szechuan noodles").query.cuisines, ["sichuan"]);
});

const ctx = (): RankingContext => ({
  profile: (() => {
    const p = defaultOnboardingProfile();
    return { ...p, household: { ...p.household, postalCode: "53132" }, goals: { ranked: ["reduce_waste" as const] }, skillLevel: 3 as const, equipment: ["stove" as const, "oven" as const] };
  })(),
  pantry: [],
  today: "2026-11-01",
  favorites: new Set(),
  ratings: new Map(),
  myRatings: new Map(),
  seasonal: null,
  taste: null,
});

test("library variety: recently cooked dishes sink, new cuisines rise, top results rotate", () => {
  const ranked = rankRecipes(testKitchenRecipes, ctx(), { includeAboveSkill: true }).recipes;
  const top = ranked[0]!.recipe;
  const events: RecommendationEvent[] = [{ recipeId: top.id, event: "cooked", surface: "detail", createdAt: "2026-10-28T18:00:00Z" }];
  const h = varietyHistory(testKitchenRecipes, events, new Map(), "2026-11-01");
  const varied = applyVariety(ranked, h, "balanced", "2026-11-01");
  assert.notEqual(varied[0]!.recipe.id, top.id, "cooked four days ago");
  const familiarRatings = new Map<string, RecipeRating>([[top.id, { recipeId: top.id, overall: 5, flavor: null, difficulty: null, wouldCookAgain: true, actualMinutes: null, familyApproval: null, notes: null, createdAt: "2026-09-01T00:00:00Z" }]]);
  const fav = applyVariety(ranked, varietyHistory(testKitchenRecipes, [], familiarRatings, "2026-11-01"), "familiar", "2026-11-01");
  assert.equal(fav[0]!.recipe.id, top.id);
  assert.ok(fav[0]!.reasons.includes("One of your favourites"));
  // Adjacent picks don't repeat a cuisine where they can avoid it.
  const first4 = applyVariety(ranked, h, "adventurous", "2026-11-01").slice(0, 4).map((r) => r.recipe.cuisine);
  assert.ok(new Set(first4).size >= 3, first4.join(","));
});

test("library menus: courses filled from the household's library, honestly", () => {
  const extra = [
    prepareRecipe({ externalId: "prime", title: "Prime Rib Roast", cuisine: "american", skillLevel: 3, prepMinutes: 20, cookMinutes: 180, servings: 8, equipment: ["oven"], ingredients: [{ quantity: 6, unit: "lb", item: "bone-in beef rib roast" }, { quantity: 2, unit: "tbsp", item: "kosher salt" }], steps: [{ body: "Season the roast all over and rest at room temperature for an hour.", minutes: 60 }, { body: "Roast at 250°F until the center reaches 145°F, then rest and sear in a very hot oven.", tempF: 250, safeF: 145, minutes: 180 }] }, SOURCE),
    prepareRecipe({ externalId: "spinach", title: "Creamed Spinach", cuisine: "american", course: "side", skillLevel: 1, prepMinutes: 10, cookMinutes: 10, servings: 4, ingredients: [{ quantity: 1, unit: "lb", item: "spinach" }, { quantity: 0.5, unit: "cup", item: "heavy cream" }], steps: [{ body: "Wilt the spinach in a pan and squeeze it dry." }, { body: "Simmer with the cream until thick; season." }] }, SOURCE),
    prepareRecipe({ externalId: "yorkshire", title: "Yorkshire Pudding", cuisine: "british", course: "side", skillLevel: 2, status: "idea" }, SOURCE),
  ].map((r) => (r.ok ? r.recipe : assert.fail(JSON.stringify(r.errors))));
  const pool = rankRecipes([...testKitchenRecipes, ...extra], ctx(), { course: "any", includeAboveSkill: true, includeIdeas: true }).recipes;
  const steak = MENU_TEMPLATES.find((t) => t.code === "steakhouse")!;
  const menu = buildMenu(steak, pool, { guests: 6, skill: 3, prices: new Map([[extra[0]!.id, 1200]]), budgetCents: 20000 });
  const main = menu.courses.find((c) => c.course === "main")!;
  assert.equal(main.recipe?.id, extra[0]!.id);
  assert.equal(main.factor, 6 / 8);
  const york = menu.courses.find((c) => c.label === "Yorkshire pudding")!;
  assert.equal(york.idea, true);
  assert.match(york.note ?? "", /idea/);
  const spinach = menu.courses.find((c) => c.label === "Creamed spinach")!;
  assert.equal(spinach.recipe?.id, extra[1]!.id);
  assert.equal(menu.courses.find((c) => c.label === "Horseradish cream")!.recipe, null);
  assert.equal(menu.cost.cents, 1200 * 6);
  assert.equal(menu.cost.unpriced, 1, "creamed spinach has no verified price");
  assert.equal(menu.cost.overBudget, null, "we can't say until every course has a real price");
  assert.ok(menu.shopping.some((s) => /rib roast/.test(s.item) && s.quantity === 4.5));
  assert.equal(menu.schedule[0]!.recipeTitle, "Prime Rib Roast");
  assert.ok(menu.warnings.some((w) => /don't have a recipe/.test(w)));
});

test("library collection: every record passes the import pipeline with no duplicates", async () => {
  const { libraryCollection, libraryCollectionReport, catalogRecipes } = await import("../catalog/library");
  assert.deepEqual(libraryCollectionReport.rejected, []);
  assert.deepEqual(libraryCollectionReport.duplicates, []);
  const complete = libraryCollection.filter((r) => r.library.status !== "idea");
  assert.ok(complete.length >= 50, `${complete.length} complete recipes`);
  assert.ok(complete.every((r) => r.library.status === "pending_review"), "nothing claims to be tested");
  const cuisines = new Set(catalogRecipes.map((r) => r.cuisine));
  assert.ok(cuisines.size >= 60, `${cuisines.size} cuisines`);
  // Every raw-protein dish carries a safety note; every poultry dish reaches 165°F.
  for (const r of complete) {
    if (r.library.methods.includes("raw") && r.facets.proteins.some((p) => p === "fish" || p === "shellfish")) assert.ok(r.library.safetyNote, r.title);
    if (r.facets.proteins.includes("chicken")) assert.ok(r.steps.some((st) => (st.safeInternalTempC ?? 0) >= 73.8), r.title);
  }
  // Ideas never come back from normal ranking.
  const ranked = rankRecipes(catalogRecipes, ctx(), { course: "any", includeAboveSkill: true }).recipes;
  assert.ok(ranked.every((r) => libraryOf(r.recipe).status !== "idea"));
});

test("library adapters: ingredient lines and schema.org recipes", async () => {
  const { parseIngredientLine, fromSchemaOrg, isoMinutes, toImportPayload } = await import("./adapters");
  assert.deepEqual(parseIngredientLine("1 1/2 cups all-purpose flour, sifted"), { quantity: 1.5, unit: "cup", item: "all-purpose flour", preparation: "sifted", optional: false });
  assert.deepEqual(parseIngredientLine("2 large eggs"), { quantity: 2, unit: null, item: "large eggs", preparation: null, optional: false });
  assert.deepEqual(parseIngredientLine("½ tsp. kosher salt"), { quantity: 0.5, unit: "tsp", item: "kosher salt", preparation: null, optional: false });
  assert.deepEqual(parseIngredientLine("1 (15-ounce) can chickpeas, drained"), { quantity: 1, unit: "can", item: "chickpeas", preparation: "drained", optional: false });
  assert.deepEqual(parseIngredientLine("Salt to taste"), { quantity: null, unit: null, item: "Salt", preparation: null, optional: true });
  assert.equal(parseIngredientLine("3 tomatoes").unit, null);
  assert.equal(isoMinutes("PT1H30M"), 90);
  const input = fromSchemaOrg(
    {
      "@type": "Recipe",
      name: "Lentil Soup",
      identifier: "p-77",
      recipeYield: "6 servings",
      prepTime: "PT10M",
      cookTime: "PT40M",
      recipeIngredient: ["1 cup red lentils", "1 onion, chopped", "4 cups vegetable stock"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Soften the onion in a little oil." }, { "@type": "HowToStep", text: "Add the lentils and stock and simmer until soft." }],
    },
    { cuisine: "turkish", skillLevel: 1, equipment: ["stove"] },
  );
  assert.equal(input.servings, 6);
  assert.equal(input.cookMinutes, 40);
  const prepared = prepareRecipe(input, { name: "Example Partner", kind: "partner", license: "licensed:example" });
  assert.ok(prepared.ok, JSON.stringify(!prepared.ok && prepared.errors));
  const payload = toImportPayload(prepared.recipe);
  assert.equal(payload.license, "licensed:example");
  assert.equal((payload.ingredients as Array<{ rawText: string }>)[0]!.rawText, "1 cup red lentils");
  assert.ok((payload.dietTags as string[]).includes("vegan"));
});

test("library menus: a pinned choice is kept", async () => {
  const { catalogRecipes } = await import("../catalog/library");
  const pool = rankRecipes(catalogRecipes, ctx(), { course: "any", includeAboveSkill: true, includeIdeas: true }).recipes;
  const thai = MENU_TEMPLATES.find((t) => t.code === "thai-dinner")!;
  const first = buildMenu(thai, pool, { guests: 4, skill: 3 });
  const alt = first.courses[1]!.alternatives[0];
  if (!alt) return;
  const pinned = buildMenu(thai, pool, { guests: 4, skill: 3, pinned: new Map([[1, alt.id]]) });
  assert.equal(pinned.courses[1]!.recipe?.id, alt.id);
});

test("library natural-language: menu words don't become search words", () => {
  const tower = parseRecipeRequest("Build a seafood tower for six people");
  assert.equal(tower.query.text, undefined);
});
