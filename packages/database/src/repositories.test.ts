import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defaultOnboardingProfile, emptyPantryItemInput } from "@kitchen-pantry/validation";
import type { DbResponse, KeyValueStorage, SupabaseLike } from "./client";
import {
  createLocalRecipeRepository,
  createSupabaseRecipeRepository,
  latestRatingByRecipe,
  createLocalKitchenRepository,
  createLocalProfileStore,
  createSupabaseKitchenRepository,
  createSupabaseProfileStore,
  randomUuid,
  createLocalMealPlanRepository,
  createSupabaseMealPlanRepository,
  CONFIRMED_PLAN,
  type PantryRow,
} from "./index";

// ---------------------------------------------------------------------------
// A tiny fake Supabase client: records every chained call and resolves with
// whatever response the test queued for that table / RPC.
// ---------------------------------------------------------------------------
interface Call {
  target: string;
  ops: Array<[string, unknown[]]>;
}

function fakeDb(responses: Record<string, DbResponse[]>) {
  const calls: Call[] = [];
  const next = (key: string): DbResponse => responses[key]?.shift() ?? { data: null, error: null };
  const db: SupabaseLike = {
    from(table: string) {
      const call: Call = { target: table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "in", "lt", "order", "limit", "single", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (r: DbResponse) => unknown) => Promise.resolve(next(table)).then(resolve);
      return builder;
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ target: `rpc:${fn}`, ops: [["args", [args]]] });
      return Promise.resolve(next(`rpc:${fn}`));
    },
  };
  return { db, calls };
}

const ID = "6f1d3c2a-8b4e-4c1a-9d2e-123456789abc";

function row(partial: Partial<PantryRow> = {}): PantryRow {
  return {
    id: ID,
    ingredient_id: null,
    name: "Chicken thighs",
    category: "protein",
    quantity: "1.5000",
    unit: "lb",
    storage_location: "fridge",
    purchased_on: null,
    use_by: "2026-11-04",
    opened_on: null,
    estimated_remaining_pct: null,
    price_paid_cents: 599,
    is_staple: false,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...partial,
  };
}

const chicken = () => ({
  ...emptyPantryItemInput(),
  name: "Chicken thighs",
  category: "protein" as const,
  quantity: 1.5,
  unit: "lb",
  useBy: "2026-11-04",
  pricePaidCents: 599,
});

test("supabase add: validated, normalised, no household_id, numeric strings parsed", async () => {
  const { db, calls } = fakeDb({ pantry_items: [{ data: row(), error: null }] });
  const result = await createSupabaseKitchenRepository(db).add(chicken());
  assert.ok(result.ok);
  assert.equal(result.data.quantity, 1.5);
  const insert = calls[0]!.ops.find(([op]) => op === "insert")![1][0] as Record<string, unknown>;
  assert.equal(insert.normalized_unit, "g");
  assert.equal(insert.normalized_quantity, 680.3886);
  assert.equal(insert.source, "manual");
  assert.ok(!("household_id" in insert), "household comes from the database default");
});

test("supabase add rejects invalid input without touching the database", async () => {
  const { db, calls } = fakeDb({});
  const result = await createSupabaseKitchenRepository(db).add({ ...chicken(), name: " " });
  assert.ok(!result.ok);
  assert.ok(result.fieldErrors?.name);
  assert.equal(calls.length, 0);
});

test("supabase update of a missing/foreign item reports it gone", async () => {
  const { db } = fakeDb({ pantry_items: [{ data: null, error: null }] });
  const result = await createSupabaseKitchenRepository(db).update(ID, chicken());
  assert.deepEqual(result, { ok: false, message: "That item no longer exists." });
  assert.ok(!(await createSupabaseKitchenRepository(db).update("not-a-uuid", chicken())).ok);
});

test("supabase remove: passes reason, treats 'not found' as already done", async () => {
  const { db, calls } = fakeDb({ "rpc:pantry_remove_item": [{ data: null, error: { code: "P0002" } }] });
  const result = await createSupabaseKitchenRepository(db).remove(ID, "consumed");
  assert.ok(result.ok);
  assert.deepEqual(calls[0]!.ops[0]![1][0], { item_id: ID, reason: "consumed" });
  assert.ok(!(await createSupabaseKitchenRepository(db).remove(ID, "stolen")).ok);
});

test("supabase errors become friendly messages", async () => {
  const { db } = fakeDb({ pantry_items: [{ data: null, error: { code: "42501", message: "rls" } }] });
  const original = console.error;
  console.error = () => {};
  const result = await createSupabaseKitchenRepository(db).list();
  console.error = original;
  assert.ok(!result.ok);
  assert.doesNotMatch(result.message, /rls|42501/);
});

test("supabase staples link to catalogue ingredient ids", async () => {
  const { db, calls } = fakeDb({
    ingredients: [{ data: [{ id: "ing-1", canonical_name: "kosher salt" }], error: null }],
    pantry_items: [{ data: [row({ name: "Kosher salt", is_staple: true, quantity: null, unit: null })], error: null }],
  });
  const result = await createSupabaseKitchenRepository(db).addStaples(["Kosher salt", "Not a staple"]);
  assert.ok(result.ok);
  const inserted = calls[1]!.ops.find(([op]) => op === "insert")![1][0] as Array<Record<string, unknown>>;
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]!.ingredient_id, "ing-1");
  assert.equal(inserted[0]!.name, "Kosher salt");
});

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

test("local kitchen: add, update, remove, staples, search round-trip", async () => {
  const storage = memoryStorage();
  let n = 0;
  const repo = createLocalKitchenRepository(storage, { newId: () => `id-${++n}` });
  const added = await repo.add(chicken());
  assert.ok(added.ok);
  const updated = await repo.update("id-1", { ...chicken(), quantity: 1 });
  assert.ok(updated.ok && updated.data.quantity === 1 && updated.data.createdAt === added.data.createdAt);
  const staples = await repo.addStaples(["Kosher salt", "Olive oil"]);
  assert.ok(staples.ok && staples.data.length === 2);
  assert.equal(((await repo.list()) as { data: unknown[] }).data.length, 3);
  assert.ok((await repo.remove("id-1", "consumed")).ok);
  assert.equal(((await repo.list()) as { data: unknown[] }).data.length, 2);
  const search = await repo.searchIngredients("mayo");
  assert.ok(search.ok && search.data[0]?.name === "Mayonnaise");
});

test("local kitchen survives corrupt storage", async () => {
  const storage = memoryStorage();
  storage.data.set("kp-preview-pantry-v1", "{not json");
  const result = await createLocalKitchenRepository(storage).list();
  assert.deepEqual(result, { ok: true, data: [] });
});

test("profile stores validate before saving", async () => {
  const profile = defaultOnboardingProfile();
  profile.household.postalCode = "53132";
  profile.goals.ranked = ["save_money"];

  const storage = memoryStorage();
  const local = createLocalProfileStore(storage);
  assert.ok(!(await local.save(defaultOnboardingProfile())).ok); // no ZIP / goals
  assert.ok((await local.save(profile)).ok);
  assert.ok((await local.setSkillLevel(5)).ok);
  const loaded = await local.load();
  assert.ok(loaded.ok && loaded.data?.skillLevel === 5);
  await local.clear();
  assert.deepEqual(await local.load(), { ok: true, data: null });

  const stored = { ...profile, householdDiet: { allergies: ["peanut"], restrictions: [], dislikes: [], neverRecommend: [], memberCount: 2 } };
  const { db, calls } = fakeDb({
    "rpc:get_onboarding_profile": [
      { data: stored, error: null },
      { data: profile, error: null },
    ],
  });
  const remote = createSupabaseProfileStore(db);
  const saved = await remote.save(profile);
  assert.ok(saved.ok);
  assert.equal(calls[0]!.target, "rpc:save_onboarding_profile");
  assert.deepEqual(saved.data.householdDiet?.allergies, ["peanut"], "save reads back the household's combined list");
  const remoteLoaded = await remote.load();
  assert.ok(remoteLoaded.ok && remoteLoaded.data?.household.postalCode === "53132");
});

test("seasonal settings: on by default, saved personally, region validated", async () => {
  const profile = defaultOnboardingProfile();
  profile.household.postalCode = "53132";
  profile.goals.ranked = ["save_money"];
  assert.equal(profile.seasonal.enabled, true);
  assert.deepEqual(profile.seasonal.holidayOptIns, [], "no holidays assumed");
  assert.equal(profile.seasonal.deals, false, "deals are opt-in");

  const local = createLocalProfileStore(memoryStorage());
  assert.ok(!(await local.setSeasonal({ ...profile.seasonal, enabled: false })).ok, "needs a profile first");
  assert.ok((await local.save(profile)).ok);
  const next = { ...profile.seasonal, holidayOptIns: ["diwali"], region: "south-temperate" };
  assert.ok((await local.setSeasonal(next)).ok);
  const loaded = await local.load();
  assert.ok(loaded.ok && loaded.data?.seasonal.region === "south-temperate" && loaded.data.seasonal.holidayOptIns[0] === "diwali");
  assert.ok(!(await local.setSeasonal({ ...next, region: "mars" })).ok);
  assert.ok(!(await local.setSeasonal({ ...next, holidayOptIns: ["festivus"] })).ok);

  const { db, calls } = fakeDb({ "rpc:save_seasonal_preferences": [{ data: null, error: null }] });
  assert.ok((await createSupabaseProfileStore(db).setSeasonal(next)).ok);
  assert.equal(calls[0]!.target, "rpc:save_seasonal_preferences");
});

test("randomUuid produces RFC 4122 v4 ids", () => {
  assert.match(randomUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const CHILI = "7e570000-0000-4000-8000-000000000005";

test("supabase recipes: nested rows map to sorted recipes with numeric fields", async () => {
  const { db, calls } = fakeDb({
    "rpc:search_recipes": [{ data: [{ recipe_id: CHILI, rank: 0, total: 1 }], error: null }],
    recipes: [
      {
        data: [
          {
            id: CHILI, slug: "chili", title: "Chili", description: null, cuisine: "american", skill_level: 2,
            prep_minutes: 15, cook_minutes: 45, total_minutes: null, servings: 6, required_equipment: ["stove"],
            tags: ["meal-prep"], tips: [], image_url: null, image_alt: null, image_credit: null, image_credit_url: null, image_source_url: null, image_license: null, image_is_representative: null, source_url: null,
            recipe_sources: { kind: "original", name: "Kitchen Pantry Test Kitchen", website: null },
            recipe_ingredients: [
              { position: 2, component: null, item: "black beans", original_quantity: "2.0000", original_unit: "can", preparation: null, is_optional: false },
              { position: 1, component: null, item: "ground turkey", original_quantity: "1.2500", original_unit: "lb", preparation: null, is_optional: false },
            ],
            recipe_instructions: [{ position: 1, component: null, body: "Brown the turkey well.", timer_seconds: 420, temperature_c: null, safe_internal_temp_c: "73.9" }],
          },
        ],
        error: null,
      },
    ],
  });
  const result = await createSupabaseRecipeRepository(db).list();
  assert.ok(result.ok);
  const r = result.data[0]!;
  assert.equal(r.totalMinutes, 60);
  assert.deepEqual(r.ingredients.map((i) => i.item), ["ground turkey", "black beans"]);
  assert.equal(r.ingredients[0]!.quantity, 1.25);
  assert.equal(r.steps[0]!.safeInternalTempC, 73.9);
  assert.equal(r.source.kind, "original");
  const pool = calls[0]!.ops[0]![1][0] as { query: Record<string, unknown> };
  assert.equal(pool.query.sort, "rotate");
  assert.match(String(pool.query.seed), /^pool:\d{4}-W\d{2}$/, "the working set rotates weekly");
  const select = calls.find((c) => c.target === "recipes")!;
  assert.match(String(select.ops[0]![1][0]), /recipe_ingredients\(/);
  assert.deepEqual(select.ops.find(([op]) => op === "in")![1], ["id", [CHILI]]);
});

test("supabase favourites upsert/delete and rating insert", async () => {
  const { db, calls } = fakeDb({
    recipe_ratings: [{ data: { recipe_id: CHILI, overall: 5, flavor: null, difficulty: null, would_cook_again: true, actual_minutes: 50, family_approval: null, notes: null, created_at: "2026-11-01T18:00:00Z" }, error: null }],
  });
  const repo = createSupabaseRecipeRepository(db);
  assert.ok((await repo.setFavorite(CHILI, true)).ok);
  assert.equal(calls[0]!.ops[0]![0], "upsert");
  assert.ok((await repo.setFavorite(CHILI, false)).ok);
  assert.equal(calls[1]!.ops[0]![0], "delete");
  const rated = await repo.rate({ recipeId: CHILI, overall: 5, flavor: null, difficulty: null, wouldCookAgain: true, actualMinutes: 50, familyApproval: null, notes: "" });
  assert.ok(rated.ok && rated.data.overall === 5);
  const insert = calls[2]!.ops.find(([op]) => op === "insert")![1][0] as Record<string, unknown>;
  assert.equal(insert.notes, null);
  assert.ok(!("household_id" in insert) && !("user_id" in insert), "both come from database defaults");
  assert.ok(!(await repo.rate({ recipeId: CHILI, overall: 7 })).ok);
});

test("local recipes: catalogue, favourites, ratings; no fake community ratings", async () => {
  const storage = memoryStorage();
  const repo = createLocalRecipeRepository(storage);
  const list = await repo.list();
  assert.ok(list.ok && list.data.length >= 15);
  await repo.setFavorite(CHILI, true);
  assert.deepEqual((await repo.favorites() as { data: string[] }).data, [CHILI]);
  await repo.rate({ recipeId: CHILI, overall: 4, flavor: 5, difficulty: 2, wouldCookAgain: true, actualMinutes: null, familyApproval: null, notes: null });
  const mine = await repo.myRatings();
  assert.ok(mine.ok && mine.data.length === 1);
  assert.deepEqual(await repo.summaries([CHILI]), { ok: true, data: [] });
  assert.equal(latestRatingByRecipe(mine.data).get(CHILI)?.overall, 4);
});

test("recommendation events: supabase insert relies on defaults; bad input rejected", async () => {
  const { db, calls } = fakeDb({
    recommendation_events: [{ data: { recipe_id: CHILI, event: "dismissed", surface: "recipes", created_at: "2026-11-01T18:00:00Z" }, error: null }],
  });
  const repo = createSupabaseRecipeRepository(db);
  const logged = await repo.logEvent({ recipeId: CHILI, event: "dismissed", surface: "recipes" });
  assert.ok(logged.ok && logged.data.event === "dismissed");
  const insert = calls[0]!.ops.find(([op]) => op === "insert")![1][0] as Record<string, unknown>;
  assert.deepEqual(insert, { recipe_id: CHILI, event: "dismissed", surface: "recipes" });
  assert.ok(!(await repo.logEvent({ recipeId: CHILI, event: "liked", surface: "recipes" })).ok);
  assert.ok(!(await repo.logEvent({ recipeId: "nope", event: "opened", surface: "detail" })).ok);
  assert.equal(calls.length, 1, "invalid events never reach the database");
});

test("recommendation events: local history is newest-first and capped", async () => {
  let t = Date.parse("2026-11-01T12:00:00Z");
  const repo = createLocalRecipeRepository(memoryStorage(), { now: () => new Date((t += 1000)) });
  await repo.logEvent({ recipeId: CHILI, event: "opened", surface: "recipes" });
  await repo.logEvent({ recipeId: CHILI, event: "dismissed", surface: "detail" });
  const events = await repo.events();
  assert.ok(events.ok);
  assert.deepEqual(events.data.map((e) => e.event), ["dismissed", "opened"]);
  for (let i = 0; i < 520; i++) await repo.logEvent({ recipeId: CHILI, event: "opened", surface: "home" });
  const capped = await repo.events();
  assert.ok(capped.ok && capped.data.length === 500);
});

const PLAN_INPUT = {
  weekStart: "2026-11-09",
  mode: "budget_first",
  generatedBy: "ai",
  summary: "A thrifty week.",
  confirmedAt: null,
  meals: [
    { date: "2026-11-11", recipeId: CHILI, customTitle: null, servings: 4, locked: false, note: "Chili night" },
    { date: "2026-11-09", recipeId: null, customTitle: "Leftovers", servings: 2, locked: true, note: null },
  ],
};

test("meal plans: validation rejects bad weeks before touching the database", async () => {
  const { db, calls } = fakeDb({});
  const repo = createSupabaseMealPlanRepository(db);
  const bad = [
    { ...PLAN_INPUT, weekStart: "2026-11-10" },
    { ...PLAN_INPUT, meals: [{ ...PLAN_INPUT.meals[0], date: "2026-11-20" }] },
    { ...PLAN_INPUT, meals: [PLAN_INPUT.meals[0], { ...PLAN_INPUT.meals[0], date: "2026-11-12" }] },
    { ...PLAN_INPUT, meals: [PLAN_INPUT.meals[0], { ...PLAN_INPUT.meals[1], date: "2026-11-11" }] },
    { ...PLAN_INPUT, meals: [{ ...PLAN_INPUT.meals[0], recipeId: null, customTitle: null }] },
    { ...PLAN_INPUT, meals: [{ ...PLAN_INPUT.meals[0], servings: 0 }] },
  ];
  for (const b of bad) assert.equal((await repo.save(b)).ok, false, JSON.stringify(b.meals));
  assert.equal(calls.length, 0);
});

test("meal plans: supabase save calls the RPC, then returns the fresh week", async () => {
  const { db, calls } = fakeDb({
    "rpc:save_meal_plan": [{ data: "plan-1", error: null }],
    meal_plans: [
      {
        data: {
          id: "plan-1", week_start: "2026-11-09", status: "draft", planning_mode: "budget_first", generated_by: "ai",
          summary: "A thrifty week.", confirmed_at: null, updated_at: "2026-11-01T12:00:00Z",
          planned_meals: [
            { id: "m2", planned_date: "2026-11-11", recipe_id: CHILI, custom_title: null, servings: 4, is_locked: false, note: "Chili night", position: 0 },
            { id: "m1", planned_date: "2026-11-09", recipe_id: null, custom_title: "Leftovers", servings: 2, is_locked: true, note: null, position: 1 },
          ],
        },
        error: null,
      },
    ],
  });
  const saved = await createSupabaseMealPlanRepository(db).save(PLAN_INPUT);
  assert.ok(saved.ok);
  assert.deepEqual(saved.data.meals.map((m) => m.date), ["2026-11-09", "2026-11-11"], "sorted by day");
  assert.equal(saved.data.meals[0]!.customTitle, "Leftovers");
  const rpc = calls[0]!.ops[0]![1][0] as { plan: { meals: unknown[] }; overwrite_confirmed: boolean };
  assert.equal(rpc.overwrite_confirmed, false);
  assert.equal(rpc.plan.meals.length, 2);
});

test("meal plans: a confirmed week reports a clear, typed error", async () => {
  const { db } = fakeDb({
    "rpc:save_meal_plan": [{ data: null, error: { code: "P0001", message: "This week is confirmed. Confirm the overwrite to change it.", hint: "confirmed_plan" } as never }],
  });
  const res = await createSupabaseMealPlanRepository(db).save(PLAN_INPUT);
  assert.ok(!res.ok);
  assert.equal((res as { code?: string }).code, CONFIRMED_PLAN);
});

test("meal plans: local repository saves, guards confirmed weeks, and lists earlier weeks", async () => {
  const repo = createLocalMealPlanRepository(memoryStorage(), { now: () => new Date("2026-11-01T12:00:00Z") });
  assert.deepEqual(await repo.getWeek("2026-11-09"), { ok: true, data: null });
  const first = await repo.save(PLAN_INPUT);
  assert.ok(first.ok && first.data.status === "draft" && first.data.meals[0]!.date === "2026-11-09");
  const confirmed = await repo.save({ ...PLAN_INPUT, confirmedAt: "2026-11-08T18:00:00Z" });
  assert.ok(confirmed.ok && confirmed.data.status === "active" && confirmed.data.id === first.data.id);
  const blocked = await repo.save({ ...PLAN_INPUT, meals: [] });
  assert.ok(!blocked.ok && (blocked as { code?: string }).code === CONFIRMED_PLAN);
  const forced = await repo.save({ ...PLAN_INPUT, meals: [] }, { overwriteConfirmed: true });
  assert.ok(forced.ok && forced.data.meals.length === 0);
  await repo.save({ ...PLAN_INPUT, weekStart: "2026-11-02", meals: [] });
  await repo.save({ ...PLAN_INPUT, weekStart: "2026-10-26", meals: [] });
  const prev = await repo.previous("2026-11-09");
  assert.ok(prev.ok);
  assert.deepEqual(prev.data.map((p) => p.weekStart), ["2026-11-02", "2026-10-26"]);
});
