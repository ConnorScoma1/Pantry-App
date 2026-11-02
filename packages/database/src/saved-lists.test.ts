import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createLocalGroceryRepository, createLocalSavedListRepository, createSupabaseSavedListRepository, itemsToSave, PREVIEW_LIST_ID, type KeyValueStorage, type SupabaseLike } from "./index";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}

test("saved lists (preview): save the list, add it back without duplicates, rename and delete", async () => {
  const storage = memoryStorage();
  const grocery = createLocalGroceryRepository(storage);
  const saved = createLocalSavedListRepository(storage);
  for (const name of ["Milk", "Bananas", "milk ", "Eggs"]) await grocery.add(PREVIEW_LIST_ID, { name, department: name === "Bananas" ? "produce" : "dairy" });
  const items = await grocery.items(PREVIEW_LIST_ID);
  assert.ok(items.ok);
  const toSave = itemsToSave(items.data);
  assert.equal(toSave.length, 3, "each name once");
  assert.ok(!(await saved.save({ name: " ", items: toSave })).ok, "needs a name");
  assert.ok(!(await saved.save({ name: "Empty", items: [] })).ok, "needs items");
  const s = await saved.save({ name: "Weekly basics", items: toSave });
  assert.ok(s.ok);
  const again = await saved.save({ name: "weekly basics", items: toSave });
  assert.ok(again.ok && again.data.id === s.data.id, "same name replaces");

  // Clear the list, keep only "Milk" (not bought): adding brings back the rest once.
  const all = await grocery.items(PREVIEW_LIST_ID);
  for (const i of all.ok ? all.data : []) if (i.name !== "Milk") await grocery.remove(i.id);
  const added = await saved.addToList(s.data.id, PREVIEW_LIST_ID);
  assert.ok(added.ok && added.data.added === 2, "milk was already there; bananas and eggs added");
  const twice = await saved.addToList(s.data.id, PREVIEW_LIST_ID);
  assert.ok(twice.ok && twice.data.added === 0);

  assert.ok((await saved.save({ name: "Costco run", items: toSave })).ok);
  assert.ok(!(await saved.rename(s.data.id, "costco RUN")).ok, "names stay unique");
  assert.ok((await saved.rename(s.data.id, "Basics")).ok);
  assert.ok((await saved.remove(s.data.id)).ok);
  const left = await saved.list();
  assert.ok(left.ok && left.data.map((l) => l.name).join() === "Costco run");
});

test("saved lists (supabase): only checked input reaches the database, odd stored items are dropped", async () => {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const db = {
    rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), { data: fn === "add_saved_list" ? 2 : "6f1d3c2a-8b4e-4c1a-9d2e-123456789abc", error: null }),
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => ({ data: [{ id: "6f1d3c2a-8b4e-4c1a-9d2e-123456789abc", name: "Basics", updated_at: "", items: [{ name: "Milk", department: "dairy" }, { name: 5 }, { name: "Gum", department: "candy" }] }], error: null }) }) }),
    }),
  } as unknown as SupabaseLike;
  const repo = createSupabaseSavedListRepository(db);
  assert.ok(!(await repo.save({ name: "x", items: [{ name: "Milk", department: "weapons", amount: null, note: null }] })).ok);
  assert.ok((await repo.save({ name: "Basics", items: [{ name: " Milk ", department: "dairy", amount: null, note: null }] })).ok);
  assert.deepEqual(calls[0], { fn: "save_grocery_list", args: { list_name: "Basics", items: [{ name: "Milk", department: "dairy", amount: null, note: null }] } });
  const list = await repo.list();
  assert.ok(list.ok && list.data[0]!.items.length === 1 && list.data[0]!.items[0]!.amount === null);
  assert.ok(!(await repo.addToList("not-an-id", "x")).ok);
  const added = await repo.addToList("6f1d3c2a-8b4e-4c1a-9d2e-123456789abc", "list");
  assert.ok(added.ok && added.data.added === 2);
});
