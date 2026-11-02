import { strict as assert } from "node:assert";
import { test } from "node:test";
import { emptyPantryItemInput } from "@kitchen-pantry/validation";
import { createLocalKitchenRepository, createLocalSavingsRepository, createSupabaseSavingsRepository, type KeyValueStorage, type SupabaseLike } from "./index";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}
const NOW = new Date("2026-11-04T18:00:00");

test("savings (preview): removing an item logs what was paid; shops are logged once per order and never in the future", async () => {
  const storage = memoryStorage();
  const kitchen = createLocalKitchenRepository(storage, { now: () => NOW });
  const added = await kitchen.add({ ...emptyPantryItemInput(), name: "Baby spinach", category: "produce", storageLocation: "fridge", useBy: "2026-11-06", pricePaidCents: 499 });
  assert.ok(added.ok);
  await kitchen.remove(added.data.id, "consumed");
  const repo = createLocalSavingsRepository(storage, () => NOW);
  const o = await repo.overview("2026-10-01");
  assert.ok(o.ok);
  assert.deepEqual(o.data.pantry.map((p) => [p.itemName, p.reason, p.pricePaidCents, p.useBy]), [["Baby spinach", "consumed", 499, "2026-11-06"]]);

  assert.ok(!(await repo.addSpending({ spentOn: "2026-11-30", amountCents: 1000 })).ok, "future");
  assert.ok(!(await repo.addSpending({ spentOn: "2026-11-03", amountCents: 0 })).ok, "zero");
  const cartId = "6f1d3c2a-8b4e-4c1a-9d2e-123456789abc";
  const shop = await repo.addSpending({ spentOn: "2026-11-03", amountCents: 8642, storeName: "Kroger", cartDraftId: cartId });
  assert.ok(shop.ok);
  const twice = await repo.addSpending({ spentOn: "2026-11-03", amountCents: 1, cartDraftId: cartId });
  assert.ok(!twice.ok && /already logged/.test(twice.message));
  const fixed = await repo.updateSpending(shop.data.id, { spentOn: "2026-11-02", amountCents: 8700 });
  assert.ok(fixed.ok && fixed.data.amountCents === 8700 && fixed.data.cartDraftId === cartId);
  await repo.removeSpending(shop.data.id);
  const after = await repo.overview("2026-10-01");
  assert.ok(after.ok && after.data.spending.length === 0);
});

test("savings (supabase): invalid shops never reach the database; rows are mapped and checked", async () => {
  const calls: string[] = [];
  const db = {
    from(t: string) {
      calls.push(t);
      throw new Error("no table calls in this test");
    },
    rpc(fn: string) {
      calls.push(fn);
      return Promise.resolve({
        data: {
          pantry: [{ itemName: "Milk", reason: "consumed", pricePaidCents: 349, useBy: "2026-11-04", at: "2026-11-04T12:00:00Z" }, { itemName: "x", reason: "added", at: "2026-11-04" }],
          spending: [{ id: "a", spentOn: "2026-11-03", amountCents: 5000, storeName: null, note: null, cartDraftId: null, createdAt: "" }, { id: "b", spentOn: "x", amountCents: -1 }],
          carts: [{ nonsense: true }],
        },
        error: null,
      });
    },
  } as unknown as SupabaseLike;
  const repo = createSupabaseSavingsRepository(db);
  assert.ok(!(await repo.addSpending({ spentOn: "yesterday", amountCents: 100 })).ok);
  assert.deepEqual(calls, []);
  const o = await repo.overview("2026-10-01");
  assert.ok(o.ok);
  assert.equal(o.data.pantry.length, 1);
  assert.equal(o.data.spending.length, 1);
  assert.equal(o.data.carts.length, 0, "unreadable carts are dropped, never guessed");
});
