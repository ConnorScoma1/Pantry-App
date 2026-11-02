import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DbResponse, KeyValueStorage, SupabaseLike } from "./client";
import {
  applyGroceryChange,
  createLocalGroceryRepository,
  createPreviewHouseholdRepository,
  createSupabaseGroceryRepository,
  createSupabaseHouseholdRepository,
  groupGroceryItems,
  inviteEmailHref,
  inviteLink,
  inviteStatus,
  parseInviteToken,
  personName,
  rowToGroceryItem,
  subscribeToGroceryList,
  toPlanLines,
  type GroceryItemRow,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from "./index";

// ---------------------------------------------------------------------------
// Fakes
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
      for (const op of ["select", "insert", "update", "delete", "eq", "order", "limit", "single", "maybeSingle"]) {
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
function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}

const TOKEN = "a".repeat(32) + "0123456789abcdef0123456789abcdef";
const LIST = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

function itemRow(partial: Partial<GroceryItemRow> = {}): GroceryItemRow {
  return {
    id: ITEM,
    grocery_list_id: LIST,
    name: "Lemons",
    department: "produce",
    amount_text: "2",
    note: null,
    source: "manual",
    item_key: null,
    needed_for: [],
    is_checked: false,
    added_by: ALEX,
    checked_by: null,
    checked_at: null,
    position: 0,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------
test("invites: tokens are parsed from raw codes or links, anything else is rejected", () => {
  assert.equal(parseInviteToken(TOKEN), TOKEN);
  assert.equal(parseInviteToken(`  https://pantry.example/invite/${TOKEN.toUpperCase()}?utm=x  `), TOKEN);
  assert.equal(parseInviteToken(`kitchenpantry://invite/${TOKEN}`), TOKEN);
  assert.equal(parseInviteToken(TOKEN.slice(1)), null, "too short");
  assert.equal(parseInviteToken(`https://evil.example/?next=/invite/${TOKEN}x`), null);
  assert.equal(parseInviteToken("' or 1=1 --"), null);
  assert.equal(parseInviteToken(42), null);
  assert.equal(inviteLink("https://pantry.example/", TOKEN), `https://pantry.example/invite/${TOKEN}`);
});

test("invites: email link is a mailto with the real expiry, nothing sent by the app", () => {
  const href = inviteEmailHref({
    to: "sam@example.com",
    link: `https://pantry.example/invite/${TOKEN}`,
    householdName: "The Parks",
    inviterName: "Alex",
    expiresAt: "2026-11-08T12:00:00Z",
    now: new Date("2026-11-01T12:00:00Z"),
  });
  assert.ok(href.startsWith("mailto:sam%40example.com?"));
  const body = decodeURIComponent(href.split("body=")[1]!);
  assert.match(body, /expires in 7 days/);
  assert.match(body, new RegExp(TOKEN));
  assert.ok(!href.includes("+"), "spaces are %20, not +");
});

test("invites: status reflects accepted, revoked and expired", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  const base = { accepted_at: null, revoked_at: null, expires_at: "2026-11-08T00:00:00Z" };
  assert.equal(inviteStatus(base, now), "pending");
  assert.equal(inviteStatus({ ...base, expires_at: "2026-11-04T00:00:00Z" }, now), "expired");
  assert.equal(inviteStatus({ ...base, revoked_at: "2026-11-02T00:00:00Z" }, now), "revoked");
  assert.equal(inviteStatus({ ...base, accepted_at: "2026-11-02T00:00:00Z" }, now), "accepted");
});

test("households: create invite validates email and returns the one-time token", async () => {
  const { db, calls } = fakeDb({
    "rpc:create_household_invite": [{ data: [{ invite_id: ITEM, token: TOKEN, expires_at: "2026-11-08T00:00:00Z" }], error: null }],
  });
  const repo = createSupabaseHouseholdRepository(db);
  const bad = await repo.createInvite({ email: "not-an-email" });
  assert.ok(!bad.ok);
  assert.equal(calls.length, 0, "invalid input never reaches the database");
  const res = await repo.createInvite({ email: " Sam@Example.com " });
  assert.ok(res.ok && res.data.token === TOKEN);
  assert.deepEqual(calls[0]!.ops[0]![1][0], { invite_email: "sam@example.com", valid_days: 7 });
});

test("households: an empty email makes a link-only invite", async () => {
  const { db, calls } = fakeDb({
    "rpc:create_household_invite": [{ data: [{ invite_id: ITEM, token: TOKEN, expires_at: "2026-11-08T00:00:00Z" }], error: null }],
  });
  const res = await createSupabaseHouseholdRepository(db).createInvite({ email: "" });
  assert.ok(res.ok);
  assert.deepEqual(calls[0]!.ops[0]![1][0], { invite_email: null, valid_days: 7 });
});

test("households: permission and invite errors from the database are shown as written", async () => {
  const { db } = fakeDb({
    "rpc:create_household_invite": [{ data: null, error: { code: "42501", message: "Only the household owner can invite people." } }],
    "rpc:accept_household_invite": [
      { data: null, error: { code: "P0001", message: "This invite has expired. Ask for a new one." } },
      { data: null, error: { code: "XX000", message: "internal: relation does not exist" } },
    ],
  });
  const repo = createSupabaseHouseholdRepository(db);
  const denied = await repo.createInvite({});
  assert.deepEqual(denied, { ok: false, message: "Only the household owner can invite people." });
  const expired = await repo.acceptInvite(`https://x.example/invite/${TOKEN}`);
  assert.deepEqual(expired, { ok: false, message: "This invite has expired. Ask for a new one." });
  const original = console.error;
  console.error = () => {};
  const internal = await repo.acceptInvite(TOKEN);
  console.error = original;
  assert.ok(!internal.ok && !internal.message.includes("relation"), "internal details are not shown");
});

test("households: a malformed invite never calls the database", async () => {
  const { db, calls } = fakeDb({});
  const repo = createSupabaseHouseholdRepository(db);
  const details = await repo.inviteDetails("hello");
  assert.ok(details.ok && details.data.status === "invalid");
  assert.ok(!(await repo.acceptInvite("hello")).ok);
  assert.ok(!(await repo.removeMember("not-a-uuid")).ok);
  assert.ok(!(await repo.transferOwnership(null)).ok);
  assert.ok(!(await repo.setDisplayName("   ")).ok);
  assert.ok(!(await repo.setDisplayName("x".repeat(41))).ok);
  assert.equal(calls.length, 0);
});

test("households: members and households map from the database functions", async () => {
  const { db } = fakeDb({
    "rpc:household_member_list": [
      {
        data: [
          { user_id: ALEX, display_name: "Alex", role: "owner", joined_at: "2026-10-01T00:00:00Z", is_you: true },
          { user_id: SAM, display_name: "Sam", role: "member", joined_at: "2026-11-01T00:00:00Z", is_you: false },
        ],
        error: null,
      },
    ],
    "rpc:my_households": [{ data: [{ household_id: LIST, name: "The Parks", role: "owner", is_active: true, member_count: 2 }], error: null }],
  });
  const repo = createSupabaseHouseholdRepository(db);
  const members = await repo.members();
  assert.ok(members.ok);
  assert.deepEqual(members.data.map((m) => [m.displayName, m.role, m.isYou]), [["Alex", "owner", true], ["Sam", "member", false]]);
  const hh = await repo.households();
  assert.ok(hh.ok && hh.data[0]!.memberCount === 2 && hh.data[0]!.isActive);
});

test("households: preview mode explains that sharing needs accounts", async () => {
  const repo = createPreviewHouseholdRepository();
  const members = await repo.members();
  assert.ok(members.ok && members.data.length === 1);
  const invite = await repo.createInvite({});
  assert.ok(!invite.ok && /needs accounts/.test(invite.message));
});

// ---------------------------------------------------------------------------
// Grocery list
// ---------------------------------------------------------------------------
test("grocery: rows map to items; unknown departments fall back to other", () => {
  const item = rowToGroceryItem(itemRow({ department: "garden", needed_for: null }));
  assert.equal(item.department, "other");
  assert.deepEqual(item.neededFor, []);
  assert.equal(item.addedBy, ALEX);
});

test("grocery: adding never sends added_by or checked_by (the database sets them)", async () => {
  const { db, calls } = fakeDb({ grocery_list_items: [{ data: itemRow(), error: null }] });
  const repo = createSupabaseGroceryRepository(db);
  const res = await repo.add(LIST, { name: "  Lemons ", department: "produce", amount: "2" });
  assert.ok(res.ok && res.data.name === "Lemons");
  const insert = calls[0]!.ops.find(([op]) => op === "insert")![1][0] as Record<string, unknown>;
  assert.equal(insert.name, "Lemons");
  assert.ok(!("added_by" in insert) && !("checked_by" in insert));
  assert.ok(!(await repo.add(LIST, { name: "" })).ok, "empty name rejected");
});

test("grocery: checking only sends is_checked", async () => {
  const { db, calls } = fakeDb({ grocery_list_items: [{ data: itemRow({ is_checked: true, checked_by: SAM }), error: null }] });
  const res = await createSupabaseGroceryRepository(db).setChecked(ITEM, true);
  assert.ok(res.ok && res.data.checkedBy === SAM);
  assert.deepEqual(calls[0]!.ops.find(([op]) => op === "update")![1][0], { is_checked: true });
});

test("grocery: plan lines are validated and sent to the database function", async () => {
  const { db, calls } = fakeDb({ "rpc:replace_plan_grocery_items": [{ data: 3, error: null }] });
  const repo = createSupabaseGroceryRepository(db);
  const lines = toPlanLines([{ key: "lemon", name: "Lemon", department: "produce", amount: "2", note: null, neededFor: ["Lemon chicken"] }]);
  const res = await repo.replacePlanItems(LIST, lines, null);
  assert.ok(res.ok && res.data.added === 3);
  assert.equal((calls[0]!.ops[0]![1][0] as { items: unknown[] }).items.length, 1);
  const bad = await repo.replacePlanItems(LIST, [{ key: "", name: "x" }], null);
  assert.ok(!bad.ok);
});

test("grocery: local list keeps typed and bought lines when the plan is re-added", async () => {
  let n = 0;
  const repo = createLocalGroceryRepository(memoryStorage(), { newId: () => `id-${++n}`, now: () => new Date("2026-11-01T12:00:00Z") });
  const list = await repo.currentList();
  assert.ok(list.ok);
  await repo.add(list.data.id, { name: "Paper towels" });
  const plan = toPlanLines([
    { key: "lemon", name: "Lemon", department: "produce", amount: "2", note: null, neededFor: ["A"] },
    { key: "rice", name: "Rice", department: "pantry", amount: "2 cups", note: null, neededFor: ["B"] },
  ]);
  await repo.replacePlanItems(list.data.id, plan, null);
  let items = await repo.items(list.data.id);
  assert.ok(items.ok && items.data.length === 3);
  const lemon = items.data.find((i) => i.key === "lemon")!;
  await repo.setChecked(lemon.id, true);
  const again = await repo.replacePlanItems(list.data.id, plan, null);
  assert.ok(again.ok && again.data.added === 1, "lemon already bought, rice re-added");
  items = await repo.items(list.data.id);
  assert.ok(items.ok);
  assert.deepEqual(items.data.map((i) => `${i.name}:${i.checked}`).sort(), ["Lemon:true", "Paper towels:false", "Rice:false"]);
  await repo.clearChecked(list.data.id);
  items = await repo.items(list.data.id);
  assert.ok(items.ok && items.data.length === 2);
});

test("grocery: groups follow aisle order with unchecked items first", () => {
  const items = [
    rowToGroceryItem(itemRow({ id: "a", name: "Rice", department: "pantry" })),
    rowToGroceryItem(itemRow({ id: "b", name: "Basil", department: "produce", is_checked: true })),
    rowToGroceryItem(itemRow({ id: "c", name: "Apples", department: "produce" })),
  ];
  const groups = groupGroceryItems(items);
  assert.deepEqual(groups.map((g) => g.department), ["produce", "pantry"]);
  assert.deepEqual(groups[0]!.items.map((i) => i.name), ["Apples", "Basil"]);
  assert.equal(groups[0]!.remaining, 1);
});

test("grocery: names for who added or checked", () => {
  const names = new Map([[SAM, "Sam"]]);
  assert.equal(personName(SAM, names, ALEX), "Sam");
  assert.equal(personName(ALEX, names, ALEX), "you");
  assert.equal(personName("gone", names, ALEX), "a former member");
  assert.equal(personName(null, names, ALEX), null);
});

// ---------------------------------------------------------------------------
// Real-time sync
// ---------------------------------------------------------------------------
test("realtime: inserts, updates and deletes from other members apply in order", () => {
  let items = [rowToGroceryItem(itemRow())];
  items = applyGroceryChange(items, { eventType: "INSERT", new: itemRow({ id: "x", name: "Apples", added_by: SAM, updated_at: "2026-11-01T10:01:00Z" }) }, LIST);
  assert.deepEqual(items.map((i) => i.name), ["Apples", "Lemons"]);
  items = applyGroceryChange(items, { eventType: "UPDATE", new: itemRow({ is_checked: true, checked_by: SAM, updated_at: "2026-11-01T10:02:00Z" }) }, LIST);
  assert.equal(items.find((i) => i.id === ITEM)!.checkedBy, SAM);
  items = applyGroceryChange(items, { eventType: "DELETE", old: { id: "x" } }, LIST);
  assert.deepEqual(items.map((i) => i.name), ["Lemons"]);
});

test("realtime: our own echo and late, older events are ignored", () => {
  const current = [rowToGroceryItem(itemRow({ is_checked: true, updated_at: "2026-11-01T10:05:00Z" }))];
  const echo = applyGroceryChange(current, { eventType: "UPDATE", new: itemRow({ is_checked: true, updated_at: "2026-11-01T10:05:00Z" }) }, LIST);
  assert.equal(echo, current, "same version: unchanged reference");
  const stale = applyGroceryChange(current, { eventType: "UPDATE", new: itemRow({ is_checked: false, updated_at: "2026-11-01T10:04:00Z" }) }, LIST);
  assert.equal(stale[0]!.checked, true);
  const dupInsert = applyGroceryChange(current, { eventType: "INSERT", new: itemRow({ updated_at: "2026-11-01T10:05:00Z" }) }, LIST);
  assert.equal(dupInsert.length, 1);
});

test("realtime: events for other lists and malformed payloads are ignored", () => {
  const current = [rowToGroceryItem(itemRow())];
  const other = applyGroceryChange(current, { eventType: "INSERT", new: itemRow({ id: "y", grocery_list_id: "other-list" }) }, LIST);
  assert.equal(other.length, 1);
  const junk = applyGroceryChange(current, { eventType: "INSERT", new: { name: "x" } }, LIST);
  assert.equal(junk, current);
  const unknownDelete = applyGroceryChange(current, { eventType: "DELETE", old: { id: "nope" } }, LIST);
  assert.equal(unknownDelete, current);
});

test("realtime: subscribes with a list filter, forwards changes and status, and cleans up once", () => {
  let handler: ((p: { eventType: string; new: unknown; old: unknown }) => void) | null = null;
  let statusCb: ((s: string) => void) | null = null;
  const seen: { name?: string; filter?: unknown; removed: number } = { removed: 0 };
  const channel: RealtimeChannelLike = {
    on(_type, filter, cb) {
      seen.filter = filter;
      handler = cb;
      return channel;
    },
    subscribe(cb) {
      statusCb = cb ?? null;
      return channel;
    },
  };
  const client: RealtimeClientLike = {
    channel(name) {
      seen.name = name;
      return channel;
    },
    removeChannel() {
      seen.removed += 1;
    },
  };
  const changes: string[] = [];
  const statuses: string[] = [];
  const sub = subscribeToGroceryList(client, LIST, { onChange: (c) => changes.push(c.eventType), onStatus: (s) => statuses.push(s) });
  assert.equal(seen.name, `grocery-list:${LIST}`);
  assert.deepEqual(seen.filter, { event: "*", schema: "public", table: "grocery_list_items", filter: `grocery_list_id=eq.${LIST}` });
  statusCb!("SUBSCRIBED");
  handler!({ eventType: "INSERT", new: itemRow(), old: {} });
  handler!({ eventType: "DELETE", new: {}, old: { id: ITEM } });
  handler!({ eventType: "TRUNCATE", new: {}, old: {} });
  statusCb!("CHANNEL_ERROR");
  assert.deepEqual(changes, ["INSERT", "DELETE"]);
  assert.deepEqual(statuses, ["SUBSCRIBED", "CHANNEL_ERROR"]);
  sub.unsubscribe();
  sub.unsubscribe();
  assert.equal(seen.removed, 1);
});

test("joining before onboarding: the household's shared answers prefill, personal ones don't", async () => {
  const { joinDraftProfile } = await import("./index");
  const { defaultOnboardingProfile } = await import("@kitchen-pantry/validation");
  const defaults = defaultOnboardingProfile();
  const draft = joinDraftProfile(
    {
      household: { ...defaults.household, postalCode: "53132", adults: 3 },
      budget: { ...defaults.budget, amountCents: 15000 },
      goals: { ranked: [] },
      diet: { ...defaults.diet, style: "vegetarian", allergies: ["milk"] },
      skillLevel: 2,
      equipment: ["stove", "oven", "grill"],
      store: { usualRetailer: "kroger", storeLocationId: null },
      householdDiet: { allergies: ["peanut"], restrictions: [], dislikes: [], neverRecommend: [], memberCount: 2 },
    },
    defaults,
  );
  assert.ok(draft);
  assert.equal(draft.profile.household.adults, 3);
  assert.equal(draft.profile.budget.amountCents, 15000);
  assert.equal(draft.profile.diet.style, "vegetarian");
  assert.deepEqual(draft.profile.diet.allergies, [], "allergies are personal and start empty");
  assert.deepEqual(draft.profile.householdDiet?.allergies, ["peanut"]);
  assert.equal(joinDraftProfile({ householdDiet: { allergies: [], restrictions: [], dislikes: [], neverRecommend: [], memberCount: 1 } }, defaults), null, "a one-person household isn't a join");
  assert.equal(joinDraftProfile(null, defaults), null);
});

test("stores: the household's pricing store is validated and saved on the household", async () => {
  const { createSupabaseStoreRepository, createLocalStoreRepository } = await import("./index");
  const HH = "55555555-5555-4555-8555-555555555555";
  const { db, calls } = fakeDb({
    "rpc:current_household_id": [{ data: HH, error: null }, { data: HH, error: null }],
    households: [
      { data: { id: HH, pricing_provider: "kroger", pricing_store_id: "01400376", pricing_store_name: "Kroger Main St", pricing_store_address: "1 Main St", pricing_store_set_at: "2026-11-01T00:00:00Z" }, error: null },
    ],
  });
  const repo = createSupabaseStoreRepository(db);
  const bad = await repo.set({ provider: "kroger", storeId: "../../etc", name: "x", address: null });
  assert.ok(!bad.ok);
  const saved = await repo.set({ provider: "kroger", storeId: "01400376", name: "Kroger Main St", address: "1 Main St" });
  assert.ok(saved.ok && saved.data?.storeId === "01400376");
  const update = calls.find((c) => c.target === "households")!.ops.find(([op]) => op === "update")![1][0] as Record<string, unknown>;
  assert.equal(update.pricing_store_id, "01400376");
  assert.ok(!("price" in update), "no prices are written");

  const local = createLocalStoreRepository(memoryStorage(), () => new Date("2026-11-01T12:00:00Z"));
  assert.deepEqual(await local.get(), { ok: true, data: null });
  await local.set({ provider: "kroger", storeId: "01400376", name: "Kroger", address: null });
  const got = await local.get();
  assert.ok(got.ok && got.data?.name === "Kroger" && got.data.setAt === "2026-11-01T12:00:00.000Z");
});

test("grocery: plan lines keep one comparable amount for store package math", () => {
  const lines = toPlanLines([
    { key: "spinach", name: "baby spinach", department: "produce", amount: "3½ cups", note: null, neededFor: [], quantities: [{ value: 828.06, unit: "ml" }] },
    { key: "garlic", name: "garlic", department: "produce", amount: "3 cloves + 1 tbsp", note: null, neededFor: [], quantities: [{ value: 3, unit: "clove" }, { value: 14.8, unit: "ml" }] },
  ]);
  assert.deepEqual(lines[0]!.quantity, { value: 828.06, unit: "ml" });
  assert.equal(lines[1]!.quantity, null, "mixed units aren't combined");
  const item = rowToGroceryItem(itemRow({ required_quantity: "828.0600", required_unit: "ml" }));
  assert.deepEqual(item.quantity, { value: 828.06, unit: "ml" });
});
