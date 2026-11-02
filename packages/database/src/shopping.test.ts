import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "@kitchen-pantry/shopping-optimizer";
import { createLocalShoppingRepository, createSupabaseShoppingRepository, DEFAULT_SAVED_SHOPPING } from "./shopping";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

describe("shopping repository (preview)", () => {
  it("starts from sensible defaults and saves settings", async () => {
    const repo = createLocalShoppingRepository(memory());
    assert.deepEqual((await repo.getSettings()).ok && (await repo.getSettings()), { ok: true, data: DEFAULT_SAVED_SHOPPING });
    const saved = await repo.saveSettings({ settings: { ...DEFAULT_SETTINGS, maxStops: 3, fuelCentsPerGallon: 329 }, startAddress: "53132", compareStoreIds: ["01400376"] });
    assert.ok(saved.ok);
    const back = await repo.getSettings();
    assert.ok(back.ok && back.data.settings.maxStops === 3 && back.data.startAddress === "53132");
    assert.equal((await repo.saveSettings({ settings: { ...DEFAULT_SETTINGS, maxStops: 9 }, startAddress: null, compareStoreIds: [] })).ok, false);
  });
  it("saves a practice trip and refuses an item at two stores", async () => {
    const repo = createLocalShoppingRepository(memory());
    const t = await repo.saveTrip({ strategy: "best_deals", isSample: true, stops: [{ storeKey: "sample:store-a", name: "Sample Supermarket A", address: null, itemIds: [ID1] }, { storeKey: "sample:store-b", name: "Sample Discount B", address: null, itemIds: [ID2] }] });
    assert.ok(t.ok);
    const a = await repo.activeTrip();
    assert.ok(a.ok && a.data && a.data.assignment[ID2] === "sample:store-b");
    const dup = await repo.saveTrip({ strategy: "best_deals", isSample: true, stops: [{ storeKey: "sample:store-a", name: "A", address: null, itemIds: [ID1] }, { storeKey: "sample:store-b", name: "B", address: null, itemIds: [ID1] }] });
    assert.equal(dup.ok, false);
    await repo.endTrip(a.ok && a.data ? a.data.id : "", "done");
    const gone = await repo.activeTrip();
    assert.ok(gone.ok && gone.data === null);
  });
});

describe("shopping repository (Supabase)", () => {
  it("never sends a practice trip to the database", async () => {
    let called = false;
    const db = { from: () => ({}), rpc: async () => ((called = true), { data: null, error: null }) };
    const repo = createSupabaseShoppingRepository(db);
    const r = await repo.saveTrip({ strategy: "one_store", isSample: true, stops: [{ storeKey: "sample:store-a", name: "Sample", address: null, itemIds: [ID1] }] });
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });
});
