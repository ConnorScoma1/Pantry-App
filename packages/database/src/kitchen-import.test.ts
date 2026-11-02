import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyPantryItemInput } from "@kitchen-pantry/validation";
import { createLocalKitchenRepository, createSupabaseKitchenRepository } from "./kitchen";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const item = (name: string) => ({ ...emptyPantryItemInput(), name, category: "dairy" as const, storageLocation: "fridge" as const });

describe("kitchen import", () => {
  it("adds a reviewed receipt all at once, or nothing when one line is wrong", async () => {
    const repo = createLocalKitchenRepository(memory());
    const r = await repo.addMany([item("Milk"), item("Eggs")], { source: "receipt" });
    assert.ok(r.ok && r.data.length === 2);
    const bad = await repo.addMany([item("Butter"), item("")], { source: "receipt" });
    assert.equal(bad.ok, false);
    const list = await repo.list();
    assert.ok(list.ok && list.data.length === 2);
    assert.equal((await repo.addMany([], { source: "receipt" })).ok, false);
  });

  it("records the source and barcode in Supabase, and refuses a bad barcode", async () => {
    let inserted: Record<string, unknown> | null = null;
    const chain = {
      insert(row: Record<string, unknown>) {
        inserted = row;
        return chain;
      },
      select: () => chain,
      single: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", ...inserted, created_at: "x", updated_at: "x" }, error: null }),
    };
    const db = { from: () => chain, rpc: async () => ({ data: null, error: null }) };
    const repo = createSupabaseKitchenRepository(db);
    await repo.add(item("Spaghetti"), { source: "barcode", barcode: "0036000291452" });
    assert.equal(inserted!.source, "barcode");
    assert.equal(inserted!.barcode, "0036000291452");
    assert.equal((await repo.add(item("X"), { source: "barcode", barcode: "12ab" })).ok, false);
    assert.equal((await repo.add(item("X"), { source: "receipt", barcode: "0036000291452" })).ok, false);
    await repo.add(item("Plain"));
    assert.equal(inserted!.source, "manual");
  });
});
