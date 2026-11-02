import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DbResponse, KeyValueStorage, SupabaseLike } from "./client";
import { createLocalMenuRepository, createLocalRecipeRepository, createSupabaseMenuRepository, createSupabaseRecipeRepository, isoWeek, recipeRowToRecipe, type RecipeRow } from "./index";

function fakeDb(responses: Record<string, DbResponse[]>) {
  const calls: Array<{ target: string; ops: Array<[string, unknown[]]> }> = [];
  const next = (key: string): DbResponse => responses[key]?.shift() ?? { data: null, error: null };
  const db: SupabaseLike = {
    from(table: string) {
      const call = { target: table, ops: [] as Array<[string, unknown[]]> };
      calls.push(call);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "eq", "in", "order", "limit", "single"]) {
        b[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return b;
        };
      }
      b.then = (resolve: (r: DbResponse) => unknown) => Promise.resolve(next(table)).then(resolve);
      return b;
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ target: `rpc:${fn}`, ops: [["args", [args]]] });
      return Promise.resolve(next(`rpc:${fn}`));
    },
  };
  return { db, calls };
}

function memory(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const baseRow = (id: string, title: string, extra: Partial<RecipeRow> = {}): RecipeRow => ({
  id, slug: title.toLowerCase().replace(/\W+/g, "-"), title, description: null, cuisine: "thai", skill_level: 2, prep_minutes: 10, cook_minutes: 10,
  total_minutes: 20, servings: 4, required_equipment: [], tags: [], tips: [], image_url: null, image_alt: null, image_credit: null, image_credit_url: null,
  image_source_url: null, image_license: null, image_is_representative: null, source_url: null, recipe_sources: { kind: "partner", name: "P", website: null },
  recipe_ingredients: [], recipe_instructions: [], ...extra,
});

test("isoWeek", () => {
  assert.equal(isoWeek(new Date("2026-11-01T12:00:00Z")), "2026-W44");
  assert.equal(isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
});

test("library rows: status, versions, licence and attribution come through", () => {
  const r = recipeRowToRecipe(baseRow(A, "Pad Thai", { status: "reviewed", course: "side", categories: ["dinner"], dish_key: "pad-thai", variant: "budget", authenticity: "traditional", region: "Bangkok", text_license: "cc-by-sa-4.0", attribution: "Wikibooks contributors", safety_note: null }));
  assert.equal(r.library?.status, "reviewed");
  assert.equal(r.library?.variant, "budget");
  assert.equal(r.course, "side");
  assert.equal(r.source.attribution, "Wikibooks contributors");
  assert.equal(recipeRowToRecipe(baseRow(B, "Old")).library, undefined, "older rows: worked out by the app");
});

test("supabase search: validated query, rows in ranked order, total", async () => {
  const { db, calls } = fakeDb({
    "rpc:search_recipes": [{ data: [{ recipe_id: B, rank: 2, total: 7 }, { recipe_id: A, rank: 1, total: 7 }], error: null }],
    recipes: [{ data: [baseRow(A, "Alpha"), baseRow(B, "Beta")], error: null }],
  });
  const repo = createSupabaseRecipeRepository(db);
  const res = await repo.search({ text: "noodles", cuisines: ["thai"], excludeAllergens: ["peanut"], limit: 2 });
  assert.ok(res.ok);
  assert.deepEqual(res.data.recipes.map((r) => r.title), ["Beta", "Alpha"]);
  assert.equal(res.data.total, 7);
  assert.deepEqual((calls[0]!.ops[0]![1][0] as { query: unknown }).query, { text: "noodles", cuisines: ["thai"], excludeAllergens: ["peanut"], limit: 2 });
  assert.equal((await repo.search({ cuisines: ["atlantis"] })).ok, false);
  assert.equal((await repo.search({ limit: 5000 })).ok, false);
  assert.equal((await repo.search({ sneaky: true })).ok, false, "unknown keys are refused");
  assert.equal((await repo.bySlug("../etc")).ok && (await repo.bySlug("../etc")).ok, true);
});

test("local library: search, ideas on request, facets and slugs", async () => {
  const repo = createLocalRecipeRepository(memory());
  const list = await repo.list();
  assert.ok(list.ok && list.data.length >= 70 && list.data.every((r) => r.library?.status !== "idea"));
  const thai = await repo.search({ cuisines: ["thai"], limit: 50 });
  assert.ok(thai.ok && thai.data.total >= 4 && thai.data.recipes.every((r) => r.cuisine === "thai"));
  const ideas = await repo.search({ statuses: ["idea"], cuisines: ["mexican"], limit: 50 });
  assert.ok(ideas.ok && ideas.data.recipes.some((r) => r.title === "Mole Poblano"));
  const facets = await repo.facets();
  assert.ok(facets.ok && facets.data.ideas >= 150 && facets.data.complete >= 200 && (facets.data.cuisines.thai ?? 0) >= 4);
  const slug = list.ok ? list.data[0]!.slug : "";
  const found = await repo.bySlug(slug);
  assert.ok(found.ok && found.data?.slug === slug);
});

test("menus: saved through save_menu, listed in course order; local preview too", async () => {
  const { db, calls } = fakeDb({
    "rpc:save_menu": [{ data: A, error: null }],
    menus: [{ data: [{ id: A, template_code: "steakhouse", title: "Steakhouse", guests: 6, budget_cents: null, serve_on: null, notes: null, created_at: "2026-11-01T00:00:00Z", menu_courses: [{ position: 2, course: "side", label: "Spinach", recipe_id: null }, { position: 1, course: "main", label: "Prime rib", recipe_id: B }] }], error: null }],
  });
  const repo = createSupabaseMenuRepository(db);
  const menu = { templateCode: "steakhouse", title: "Steakhouse", guests: 6, courses: [{ course: "main", label: "Prime rib", recipeId: B }] };
  assert.deepEqual(await repo.save(menu), { ok: true, data: { id: A } });
  assert.equal(calls[0]!.target, "rpc:save_menu");
  assert.equal((await repo.save({ ...menu, guests: 0 })).ok, false);
  const list = await repo.list();
  assert.ok(list.ok && list.data[0]!.courses.map((c) => c.label).join() === "Prime rib,Spinach");
  const local = createLocalMenuRepository(memory(), { newId: () => B });
  assert.ok((await local.save(menu)).ok);
  const saved = await local.list();
  assert.ok(saved.ok && saved.data.length === 1 && saved.data[0]!.id === B);
  await local.remove(B);
  assert.deepEqual(await local.list(), { ok: true, data: [] });
});
