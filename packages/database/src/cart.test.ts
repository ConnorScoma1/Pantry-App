import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MockCartAdapter, type CartLine, type RetailerCartAdapter } from "@kitchen-pantry/grocery-pricing";
import { createLocalCartRepository, createSupabaseCartRepository, sendCartDraft, type KeyValueStorage, type SupabaseLike } from "./index";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}
const NOW = new Date("2026-11-01T18:00:00Z");
const line = (id: string, approved = true): CartLine => ({
  id, name: `Item ${id}`, department: "produce", amountText: null, quantity: null, sourceIds: [id], neededFor: [], inKitchen: null,
  options: [{ productId: `000000000000${id}`, upc: null, name: `Kroger ${id}`, brand: "Kroger", sizeLabel: "1 lb", soldByWeight: false, regularCents: 199, saleCents: null, availability: "in_stock", priceStatus: "verified", observedAt: NOW.toISOString(), suggestedCount: 1 }],
  selected: `000000000000${id}`, count: 1, include: true, state: approved ? "matched" : "substitute", reason: null, approved,
});
const input = (lines: CartLine[], id: string | null = null, expectedVersion: number | null = null) => ({ id, retailer: "mock", storeId: null, storeName: null, fulfillment: "pickup" as const, lines, expectedVersion });

test("local cart: edit with versions, approve, send once, retry returns the same result", async () => {
  const repo = createLocalCartRepository(memoryStorage(), () => NOW);
  const created = await repo.save(input([line("1")]));
  assert.ok(created.ok);
  assert.ok(!(await repo.save(input([line("1")]))).ok, "one open cart per household");
  const edited = await repo.save(input([line("1"), line("2")], created.data.id, 1));
  assert.ok(edited.ok && edited.data.version === 2);
  assert.ok(!(await repo.save(input([], created.data.id, 1))).ok, "a stale edit is refused");

  const approved = await repo.approve(created.data.id, 2);
  assert.ok(approved.ok && approved.data.transferKey);
  const key = approved.data.transferKey!;
  let calls = 0;
  const counting: RetailerCartAdapter = Object.assign(new MockCartAdapter({ now: () => NOW }), {
    transfer: async (i: Parameters<RetailerCartAdapter["transfer"]>[0]) => {
      calls++;
      return new MockCartAdapter({ now: () => NOW }).transfer(i);
    },
  });
  const sent = await sendCartDraft({ repo, adapter: counting, draftId: created.data.id, key, title: "t" });
  assert.ok(sent.ok && sent.data.draft.status === "sent");
  assert.match(sent.data.message, /Practice run: 2 items/);
  const again = await sendCartDraft({ repo, adapter: counting, draftId: created.data.id, key, title: "t" });
  assert.ok(again.ok && again.data.message.startsWith("Already sent"));
  assert.equal(calls, 1, "a retry never sends twice");
  assert.ok(!(await repo.save(input([], created.data.id, null))).ok, "a sent cart can't be edited");
  const ordered = await repo.setPurchase(created.data.id, true);
  assert.ok(ordered.ok && ordered.data.purchase === "ordered");
});

test("local cart: errors — expired sign-in can be retried, an uncertain send waits for a person", async () => {
  const repo = createLocalCartRepository(memoryStorage(), () => NOW);
  const d = await repo.save(input([line("1")]));
  assert.ok(d.ok);
  const a = await repo.approve(d.data.id, 1);
  assert.ok(a.ok);
  const expired = await sendCartDraft({ repo, adapter: new MockCartAdapter({ fail: "auth_expired" }), draftId: d.data.id, key: a.data.transferKey!, title: "t" });
  assert.ok(expired.ok && expired.data.needsAuth && expired.data.draft.status === "failed");
  const again = await repo.approve(d.data.id, expired.data.draft.version);
  assert.ok(again.ok && again.data.transferKey === a.data.transferKey, "same key: nothing reached the retailer");
  const unknown = await sendCartDraft({ repo, adapter: new MockCartAdapter({ fail: "unknown" }), draftId: d.data.id, key: again.data.transferKey!, title: "t" });
  assert.ok(unknown.ok && unknown.data.draft.status === "unknown");
  const blocked = await sendCartDraft({ repo, adapter: new MockCartAdapter(), draftId: d.data.id, key: again.data.transferKey!, title: "t" });
  assert.ok(blocked.ok && /Check your retailer cart/.test(blocked.data.message) && blocked.data.draft.status === "unknown");
  const resolved = await repo.resolve(d.data.id, false);
  assert.ok(resolved.ok && resolved.data.status === "approved" && resolved.data.transferKey !== again.data.transferKey);
});

test("supabase cart: lines are validated before the RPC; database hints become plain messages", async () => {
  const calls: string[] = [];
  const db: SupabaseLike = {
    from() { throw new Error("no direct table writes"); },
    rpc(fn: string) {
      calls.push(fn);
      if (fn === "approve_cart_draft") return Promise.resolve({ data: null, error: { code: "P0001", message: "x", hint: "stale" } });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseLike;
  const repo = createSupabaseCartRepository(db);
  const bad = await repo.save(input([{ ...line("1"), selected: "not-an-option" }]));
  assert.ok(!bad.ok && calls.length === 0, "an invalid line never reaches the database");
  const stale = await repo.approve("6f1d3c2a-8b4e-4c1a-9d2e-123456789abc", 1);
  assert.ok(!stale.ok && /Someone else changed this cart/.test(stale.message));
  assert.deepEqual(await repo.current(), { ok: true, data: null });
});

test("send: the token is fetched only once the send may run; a sign-in problem leaves nothing half-sent", async () => {
  const repo = createLocalCartRepository(memoryStorage(), () => NOW);
  const d = await repo.save(input([line("1")]));
  assert.ok(d.ok);
  const a = await repo.approve(d.data.id, 1);
  assert.ok(a.ok);
  let asked = 0;
  const r = await sendCartDraft({
    repo, adapter: new MockCartAdapter(), draftId: d.data.id, key: a.data.transferKey!, title: "t",
    getAccessToken: async () => { asked++; return { ok: false, message: "Connect your Kroger account again — nothing was added.", needsAuth: true }; },
  });
  assert.ok(r.ok && r.data.needsAuth && r.data.draft.status === "failed" && asked === 1);
  const retry = await sendCartDraft({ repo, adapter: new MockCartAdapter(), draftId: d.data.id, key: a.data.transferKey!, title: "t", getAccessToken: async () => { asked++; return { ok: true, token: "t" }; } });
  assert.ok(!retry.ok && /Approve the cart again/.test(retry.message) && asked === 1, "a failed send needs approving again; the token isn't fetched");
});
