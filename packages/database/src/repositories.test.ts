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
      for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "in", "order", "limit", "single", "maybeSingle"]) {
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

  const { db, calls } = fakeDb({ "rpc:get_onboarding_profile": [{ data: profile, error: null }] });
  const remote = createSupabaseProfileStore(db);
  assert.ok((await remote.save(profile)).ok);
  assert.equal(calls[0]!.target, "rpc:save_onboarding_profile");
  const remoteLoaded = await remote.load();
  assert.ok(remoteLoaded.ok && remoteLoaded.data?.household.postalCode === "53132");
});

test("randomUuid produces RFC 4122 v4 ids", () => {
  assert.match(randomUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const CHILI = "7e570000-0000-4000-8000-000000000005";

test("supabase recipes: nested rows map to sorted recipes with numeric fields", async () => {
  const { db, calls } = fakeDb({
    recipes: [
      {
        data: [
          {
            id: CHILI, slug: "chili", title: "Chili", description: null, cuisine: "american", skill_level: 2,
            prep_minutes: 15, cook_minutes: 45, total_minutes: null, servings: 6, required_equipment: ["stove"],
            tags: ["meal-prep"], tips: [], image_url: null, source_url: null,
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
  assert.match(String(calls[0]!.ops[0]![1][0]), /recipe_ingredients\(/);
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
