import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createLocalHouseholdLifeRepository, createSupabaseHouseholdLifeRepository, type KeyValueStorage, type SupabaseLike } from "./index";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}

test("who's eating (preview): your answers, guests and portion are remembered", async () => {
  const repo = createLocalHouseholdLifeRepository(memoryStorage());
  await repo.setEating("2026-11-03", false);
  await repo.setGuests("2026-11-03", 2);
  await repo.setGuests("2026-11-04", 3);
  await repo.setGuests("2026-11-04", 0);
  assert.ok(!(await repo.setGuests("2026-11-05", 50)).ok);
  const p = await repo.setPortion(1.6);
  assert.ok(p.ok && p.data === 1.5);
  const a = await repo.attendance("2026-11-02", "2026-11-08");
  assert.ok(a.ok);
  assert.deepEqual(a.data.answers, [{ day: "2026-11-03", userId: "you", eating: false }]);
  assert.deepEqual(a.data.guests, [{ day: "2026-11-03", guests: 2 }]);
  assert.equal(a.data.members[0]!.portion, 1.5);
  await repo.setEating("2026-11-03", null);
  const b = await repo.attendance("2026-11-02", "2026-11-08");
  assert.ok(b.ok && b.data.answers.length === 0);
});

test("household (supabase): bad input never reaches the database; unknown activity is dropped", async () => {
  const calls: string[] = [];
  const db = {
    from() { throw new Error("no table access"); },
    rpc(fn: string) {
      calls.push(fn);
      return Promise.resolve({ data: [{ kind: "rated", actorName: "Sam", isYou: false, at: "2026-11-01T10:00:00Z", subject: "Fried Rice", detail: "4" }, { kind: "hacked", at: "x" }], error: null });
    },
  } as unknown as SupabaseLike;
  const repo = createSupabaseHouseholdLifeRepository(db);
  assert.ok(!(await repo.setGuests("2026-11-03", -1)).ok);
  assert.ok(!(await repo.setPortion(9)).ok);
  assert.ok(!(await repo.setEating("tomorrow", true)).ok);
  assert.deepEqual(calls, []);
  const feed = await repo.activity(500);
  assert.ok(feed.ok && feed.data.length === 1 && feed.data[0]!.subject === "Fried Rice");
});
