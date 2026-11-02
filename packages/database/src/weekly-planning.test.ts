import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import { createLocalWeeklyPlanningRepository, createPlanningJobServer, createSupabaseWeeklyPlanningRepository, type KeyValueStorage, type SupabaseLike } from "./index";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}
const UUID = "6f1d3c2a-8b4e-4c1a-9d2e-123456789abc";

test("weekly drafts (preview): settings are remembered, bad ones refused, notices marked read", async () => {
  const storage = memoryStorage();
  const repo = createLocalWeeklyPlanningRepository(storage);
  const start = await repo.settings();
  assert.ok(start.ok && !start.data.enabled && start.data.runDay === 6 && start.data.runHour === 9);
  const bad = await repo.saveSettings({ enabled: true, runDay: 8, runHour: 9, timeZone: "America/Chicago", mode: "balanced" });
  assert.ok(!bad.ok);
  const zone = await repo.saveSettings({ enabled: true, runDay: 6, runHour: 9, timeZone: "Nowhere/Land", mode: "balanced" });
  assert.ok(!zone.ok && /time zone/.test(zone.message));
  const saved = await repo.saveSettings({ enabled: true, runDay: 7, runHour: 17, timeZone: "Europe/London", mode: "cook_the_specials" });
  assert.ok(saved.ok && saved.data.enabledByYou && saved.data.mode === "cook_the_specials");
  const again = await repo.settings();
  assert.ok(again.ok && again.data.runDay === 7 && again.data.timeZone === "Europe/London");

  await storage.setItem("kp-preview-notifications-v1", JSON.stringify([{ id: "n1", kind: "plan_ready", title: "Ready", body: null, link: "/plan", readAt: null, createdAt: "" }]));
  await repo.markRead(["n1"]);
  const list = await repo.notifications();
  assert.ok(list.ok && list.data[0]!.readAt !== null);
  assert.ok(!(await repo.registerPushToken({ token: "ExponentPushToken[abcdefghij]", platform: "ios" })).ok, "no phone pushes without an account");
});

test("weekly drafts (supabase): only valid settings and Expo addresses reach the database; outside links are dropped", async () => {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(`from:${table}`);
      const q = {
        select: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: [{ id: UUID, kind: "plan_ready", title: "Ready", body: "x", link: "https://evil.example", read_at: null, created_at: "" }], error: null }),
      };
      return q;
    },
    rpc(fn: string) {
      calls.push(fn);
      return Promise.resolve({ data: { enabled: true, runDay: 6, runHour: 9, timeZone: "America/Chicago", mode: "balanced", enabledByName: "Alice", enabledByYou: false }, error: null });
    },
  } as unknown as SupabaseLike;
  const repo = createSupabaseWeeklyPlanningRepository(db, async () => UUID);
  assert.ok(!(await repo.saveSettings({ enabled: true, runDay: 0, runHour: 9, timeZone: "UTC", mode: "balanced" })).ok);
  assert.ok(!(await repo.registerPushToken({ token: "https://evil.example", platform: "ios" })).ok);
  assert.deepEqual(calls, [], "nothing invalid was sent");
  const s = await repo.saveSettings({ enabled: true, runDay: 6, runHour: 9, timeZone: "America/Chicago", mode: "balanced" });
  assert.ok(s.ok && s.data.enabledByName === "Alice");
  const notes = await repo.notifications();
  assert.ok(notes.ok && notes.data[0]!.link === null, "only in-app paths are kept");
});

test("weekly drafts (server): planning inputs are mapped and validated; a skip passes straight through", async () => {
  const profile = defaultOnboardingProfile();
  profile.household.postalCode = "53132";
  profile.goals.ranked = ["reduce_waste"];
  let reply: unknown = { skip: "Next week is already confirmed, so we left it as it is." };
  const svc = { from() { throw new Error("unused"); }, rpc: () => Promise.resolve({ data: reply, error: null }) } as unknown as SupabaseLike;
  const server = createPlanningJobServer(svc);
  const skipped = await server.context(UUID);
  assert.ok(skipped.ok && "skip" in skipped.data && /confirmed/.test(skipped.data.skip));

  reply = {
    jobId: UUID, householdId: UUID, userId: UUID, weekStart: "2026-11-09", mode: "balanced", attempts: 1, profile,
    pantry: [{ id: "p1", ingredient_id: null, name: "Spinach", category: "produce", quantity: 1, unit: "bag", storage_location: "fridge", purchased_on: null,
      use_by: "2026-11-10", opened_on: null, estimated_remaining_pct: null, price_paid_cents: null, is_staple: false, created_at: "", updated_at: "" }],
    favorites: [UUID], ratings: [], events: [{ recipe_id: UUID, event: "dismissed", surface: "recipes", created_at: "2026-11-01T00:00:00Z" }],
    recipeIds: [UUID, "not-a-uuid"], summaries: [{ recipe_id: UUID, average: "4.5", rating_count: "3", would_cook_again_pct: null }],
    store: { provider: "kroger", storeId: "01400376", name: "Kroger Oak Creek", address: null, setAt: null },
  };
  const ctx = await server.context(UUID);
  assert.ok(ctx.ok && !("skip" in ctx.data));
  if (ctx.ok && !("skip" in ctx.data)) {
    assert.equal(ctx.data.pantry[0]!.useBy, "2026-11-10");
    assert.deepEqual(ctx.data.recipeIds, [UUID]);
    assert.equal(ctx.data.summaries[0]!.average, 4.5);
    assert.equal(ctx.data.store?.name, "Kroger Oak Creek");
    assert.equal(ctx.data.events[0]!.event, "dismissed");
  }

  reply = { ...(reply as object), profile: { nonsense: true } };
  const unfinished = await server.context(UUID);
  assert.ok(unfinished.ok && "skip" in unfinished.data, "an unreadable profile means no draft, never a guessed one");
});

test("use-soon reminders: preferences default sensibly, saved with a time zone, server run read back safely", async () => {
  const { runUseSoonReminders, DEFAULT_NOTIFICATION_PREFERENCES } = await import("./index");
  assert.deepEqual(DEFAULT_NOTIFICATION_PREFERENCES, { planReadyInApp: true, planReadyPush: false, useSoonInApp: true, useSoonPush: false, timeZone: null });

  const storage = memoryStorage();
  const repo = createLocalWeeklyPlanningRepository(storage);
  // Saved before reminders existed: the new choices fill in with their defaults.
  await storage.setItem("kp-preview-notification-prefs-v1", JSON.stringify({ planReadyInApp: false, planReadyPush: false }));
  const old = await repo.preferences();
  assert.ok(old.ok && old.data.useSoonInApp && !old.data.useSoonPush);
  const saved = await repo.savePreferences({ planReadyInApp: true, planReadyPush: false, useSoonInApp: false, useSoonPush: false, timeZone: "America/Denver" });
  assert.ok(saved.ok && saved.data.timeZone === "America/Denver" && !saved.data.useSoonInApp);
  assert.ok(!(await repo.savePreferences({ planReadyInApp: true, planReadyPush: false, useSoonInApp: true, useSoonPush: false, timeZone: "Nowhere/Land" })).ok);

  const upserts: Array<Record<string, unknown>> = [];
  const stored = { plan_ready_in_app: true, plan_ready_push: true, use_soon_in_app: true, use_soon_push: false, time_zone: null as string | null };
  const db = {
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        upserts.push({ ...row });
        if ("time_zone" in row && row.time_zone === "Asia/Calcutta") return { data: null, error: { code: "23514", message: "Unknown time zone" } };
        for (const [k, v] of Object.entries(row)) if (k in stored) (stored as Record<string, unknown>)[k] = v;
        return { data: null, error: null };
      },
      select: () => ({ maybeSingle: async () => ({ data: { ...stored }, error: null }) }),
    }),
  } as unknown as SupabaseLike;
  const supa = createSupabaseWeeklyPlanningRepository(db, async () => UUID);
  // Only the changed switch is sent, so another screen's choice isn't overwritten.
  const one = await supa.savePreferences({ useSoonPush: true, timeZone: "Europe/Paris" });
  assert.deepEqual(Object.keys(upserts[0]!).sort(), ["time_zone", "updated_at", "use_soon_push", "user_id"]);
  assert.ok(one.ok && one.data.planReadyPush && one.data.useSoonPush && one.data.timeZone === "Europe/Paris", "returns the full current settings");
  assert.ok(!(await supa.savePreferences({})).ok, "an empty change is refused");
  assert.ok(!(await supa.savePreferences({ useSoonPush: true, isAdmin: true })).ok, "unknown fields are refused");
  // A zone the database doesn't know: the switch is still saved.
  const zone = await supa.savePreferences({ useSoonInApp: false, timeZone: "Asia/Calcutta" });
  assert.ok(zone.ok && !zone.data.useSoonInApp && zone.data.timeZone === "Europe/Paris");

  let args: unknown = null;
  const svc = {
    rpc: async (_name: string, a: unknown) => {
      args = a;
      return {
        data: { people: 2, notices: 1, push: [{ userId: UUID, title: "Use soon: Spinach", body: "Spinach (today)." }, { userId: "not-a-user", title: "x", body: "y" }, { userId: UUID, title: 5 }] },
        error: null,
      };
    },
  } as unknown as SupabaseLike;
  const run = await runUseSoonReminders(svc, 99999);
  assert.deepEqual(args, { max_people: 5000 });
  assert.ok(run.ok && run.data.people === 2 && run.data.push.length === 1 && run.data.push[0]!.title === "Use soon: Spinach");
});
