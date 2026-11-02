import { strict as assert } from "node:assert";
import { test } from "node:test";
import { accessSummary, loadAccess, OPEN_ACCESS, parseAccess, trialDaysLeft } from "./index";

test("billing: unreadable or missing status means billing is off, never a lock-out", async () => {
  assert.deepEqual(parseAccess(null), OPEN_ACCESS);
  assert.deepEqual(parseAccess({ enforced: true, access: false }), OPEN_ACCESS, "malformed → open");
  const missing = { from: () => null, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "x" } }) };
  assert.deepEqual(await loadAccess(missing as never), OPEN_ACCESS);
});

test("billing: plain-words summaries", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const trial = parseAccess({ enforced: true, access: true, reason: "trial", trialEndsAt: "2026-11-08T12:00:00Z", trialDays: 14, subscription: null });
  assert.equal(trialDaysLeft(trial, now), 6);
  assert.match(accessSummary(trial, now), /^Free trial: 6 days left/);
  const sub = parseAccess({ enforced: true, access: true, reason: "subscribed", trialEndsAt: null, trialDays: 14, subscription: { source: "app_store", status: "active", expiresAt: "2027-11-02T00:00:00Z", willRenew: true, active: true } });
  assert.match(accessSummary(sub, now), /^Subscribed through the App Store\. Renews/);
  const ended = parseAccess({ enforced: true, access: false, reason: "expired", trialEndsAt: "2026-10-01T00:00:00Z", trialDays: 14, subscription: null });
  assert.equal(accessSummary(ended, now), "Your free trial has ended.");
});
