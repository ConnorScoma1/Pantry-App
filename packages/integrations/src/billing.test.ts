import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { cancelStripeSubscription, createStripeCheckout, fetchStripeSubscription, stopStripeRenewal, revenueCatEventToUpdate, stripeEventToUpdate, verifyRevenueCatAuth, verifyStripeSignature, type FetchLike } from "./index";

const USER = "5a000000-0000-4000-8000-0000000000a1";

test("stripe: webhook signatures are checked, and old ones refused", async () => {
  const body = JSON.stringify({ id: "evt_1" });
  const t = 1_800_000_000;
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  assert.ok(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 10));
  assert.ok(!(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_other", t + 10)), "wrong secret");
  assert.ok(!(await verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, "whsec_test", t + 10)), "changed body");
  assert.ok(!(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 600)), "replayed later");
  assert.ok(!(await verifyStripeSignature(body, null, "whsec_test", t)));
});

test("stripe: subscription events become access updates", () => {
  const ev = (type: string, sub: object) => ({ id: "evt_9", type, created: 1_800_000_000, data: { object: { id: "sub_1", customer: "cus_A1", metadata: { user_id: USER }, ...sub } } });
  const active = stripeEventToUpdate(ev("customer.subscription.created", { status: "active", items: { data: [{ current_period_end: 1_830_000_000, price: { id: "price_y" } }] } }));
  assert.equal(active.kind, "update");
  if (active.kind === "update") {
    assert.equal(active.update.status, "active");
    assert.equal(active.update.expiresAt, new Date(1_830_000_000_000).toISOString());
    assert.equal(active.update.willRenew, true);
    assert.equal(active.update.customerId, "cus_A1");
  }
  const cancelling = stripeEventToUpdate(ev("customer.subscription.updated", { status: "active", cancel_at_period_end: true, current_period_end: 1_830_000_000 }));
  assert.ok(cancelling.kind === "update" && !cancelling.update.willRenew && cancelling.update.expiresAt !== null, "cancelled at period end keeps access until then");
  const deleted = stripeEventToUpdate(ev("customer.subscription.deleted", { status: "canceled", ended_at: 1_800_000_100 }));
  assert.ok(deleted.kind === "update" && deleted.update.status === "canceled" && deleted.update.expiresAt === new Date(1_800_000_100_000).toISOString());
  const incomplete = stripeEventToUpdate(ev("customer.subscription.created", { status: "incomplete" }));
  assert.ok(incomplete.kind === "update" && incomplete.update.expiresAt === null, "unpaid checkout gives no access");
  assert.equal(stripeEventToUpdate({ ...ev("customer.subscription.created", { status: "active" }), data: { object: { id: "sub_1", metadata: {} } } }).kind, "ignore", "no user id");
  assert.equal(stripeEventToUpdate({ id: "evt_2", type: "invoice.paid", data: {} }).kind, "ignore");
});

test("stripe: checkout keeps the rest of the free trial", async () => {
  let body = "";
  const fetchImpl: FetchLike = async (_url, init) => {
    body = init.body ?? "";
    return { ok: true, status: 200, json: async () => ({ url: "https://checkout.stripe.com/c/pay/x" }) };
  };
  const now = new Date("2026-11-02T00:00:00Z");
  const r = await createStripeCheckout({ secretKey: "sk_test", priceId: "price_y", userId: USER, email: "a@b.co", customerId: null, trialEndsAt: "2026-11-10T00:00:00Z", successUrl: "https://x/ok", cancelUrl: "https://x/no", fetchImpl, now });
  assert.ok(r.ok);
  const p = new URLSearchParams(body);
  assert.equal(p.get("subscription_data[trial_end]"), String(Date.parse("2026-11-10T00:00:00Z") / 1000));
  assert.equal(p.get("subscription_data[metadata][user_id]"), USER);
  assert.equal(p.get("customer_email"), "a@b.co");
  await createStripeCheckout({ secretKey: "sk_test", priceId: "price_y", userId: USER, email: null, customerId: "cus_A1", trialEndsAt: "2026-11-02T20:00:00Z", successUrl: "https://x/ok", cancelUrl: "https://x/no", fetchImpl, now });
  assert.equal(new URLSearchParams(body).get("subscription_data[trial_end]"), null, "less than 2 days left: bill now");
  assert.equal(new URLSearchParams(body).get("customer"), "cus_A1");
});

test("revenuecat: header check and events", () => {
  assert.ok(verifyRevenueCatAuth("s3cret-value", "s3cret-value"));
  assert.ok(verifyRevenueCatAuth("Bearer s3cret-value", "s3cret-value"));
  assert.ok(!verifyRevenueCatAuth("nope", "s3cret-value"));
  assert.ok(!verifyRevenueCatAuth(null, "s3cret-value"));
  const now = new Date("2026-11-02T00:00:00Z");
  const ev = (type: string, extra: object = {}) => ({ event: { id: "rc1", type, app_user_id: "$RCAnonymousID:abc", aliases: [USER], product_id: "kp_year", expiration_at_ms: Date.parse("2027-11-02T00:00:00Z"), event_timestamp_ms: now.getTime(), environment: "PRODUCTION", store: "APP_STORE", original_transaction_id: "1000", ...extra } });
  const buy = revenueCatEventToUpdate(ev("INITIAL_PURCHASE"), { allowSandbox: false, now });
  assert.ok(buy.kind === "update" && buy.update.userId === USER && buy.update.source === "app_store" && buy.update.status === "active" && buy.update.willRenew);
  const cancel = revenueCatEventToUpdate(ev("CANCELLATION"), { allowSandbox: false, now });
  assert.ok(cancel.kind === "update" && cancel.update.status === "canceled" && cancel.update.expiresAt === "2027-11-02T00:00:00.000Z", "access lasts to the end");
  const expired = revenueCatEventToUpdate(ev("EXPIRATION"), { allowSandbox: false, now });
  assert.ok(expired.kind === "update" && expired.update.status === "expired" && Date.parse(expired.update.expiresAt!) <= now.getTime(), "expiration ends access now");
  assert.equal(revenueCatEventToUpdate(ev("INITIAL_PURCHASE", { environment: "SANDBOX" }), { allowSandbox: false, now }).kind, "ignore");
  assert.equal(revenueCatEventToUpdate(ev("INITIAL_PURCHASE", { environment: "SANDBOX" }), { allowSandbox: true, now }).kind, "update");
  assert.equal(revenueCatEventToUpdate(ev("INITIAL_PURCHASE", { aliases: [], app_user_id: "someone" }), { allowSandbox: false, now }).kind, "ignore");
  assert.equal(revenueCatEventToUpdate(ev("TEST"), { allowSandbox: true, now }).kind, "ignore");
  assert.equal(revenueCatEventToUpdate(ev("INITIAL_PURCHASE", { entitlement_ids: ["other"] }), { allowSandbox: false, entitlement: "premium", now }).kind, "ignore");
  const play = revenueCatEventToUpdate(ev("RENEWAL", { store: "PLAY_STORE" }), { allowSandbox: false, now });
  assert.ok(play.kind === "update" && play.update.source === "play_store");
});

test("stripe: cancelling on account deletion", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    return { ok: url.endsWith("sub_ok"), status: url.endsWith("sub_gone") ? 404 : url.endsWith("sub_ok") ? 200 : 500, json: async () => ({}) };
  };
  assert.ok(await cancelStripeSubscription({ secretKey: "sk_test", subscriptionId: "sub_ok", fetchImpl }));
  assert.ok(await cancelStripeSubscription({ secretKey: "sk_test", subscriptionId: "sub_gone", fetchImpl }), "already cancelled counts");
  assert.ok(!(await cancelStripeSubscription({ secretKey: "sk_test", subscriptionId: "sub_err", fetchImpl })));
  assert.ok(!(await cancelStripeSubscription({ secretKey: "sk_test", subscriptionId: "../customers", fetchImpl })), "ids are checked");
  assert.equal(calls[0], "DELETE https://api.stripe.com/v1/subscriptions/sub_ok");
});

test("stripe: a failed renewal gets 14 days' grace, not the unpaid year", () => {
  const start = 1_800_000_000;
  const r = stripeEventToUpdate({ id: "evt_p", type: "customer.subscription.updated", created: start + 100, data: { object: { id: "sub_1", metadata: { user_id: USER }, status: "past_due", items: { data: [{ current_period_start: start, current_period_end: start + 365 * 86_400 }] } } } });
  assert.ok(r.kind === "update" && r.update.expiresAt === new Date((start + 14 * 86_400) * 1000).toISOString());
});

test("stripe: re-reading the subscription and turning renewal off", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return { ok: true, status: 200, json: async () => ({ id: "sub_1", status: "active" }) };
  };
  const got = await fetchStripeSubscription({ secretKey: "sk_test", subscriptionId: "sub_1", fetchImpl });
  assert.ok(got.ok && (got.subscription as { status: string }).status === "active");
  assert.ok(await stopStripeRenewal({ secretKey: "sk_test", subscriptionId: "sub_1", fetchImpl }));
  assert.equal(calls[1]!.method, "POST");
  assert.equal(calls[1]!.body, "cancel_at_period_end=true");
  assert.ok(!(await fetchStripeSubscription({ secretKey: "sk_test", subscriptionId: "bad/../x", fetchImpl })).ok);
});

test("revenuecat: transfers move the purchase to the new account", () => {
  const OTHER = "5b000000-0000-4000-8000-0000000000b2";
  const r = revenueCatEventToUpdate({ event: { id: "t1", type: "TRANSFER", transferred_from: ["$RCAnonymousID:x", USER], transferred_to: [OTHER], environment: "PRODUCTION" } }, { allowSandbox: false });
  assert.deepEqual(r, { kind: "transfer", eventId: "revenuecat:t1", fromUsers: [USER], toUser: OTHER });
  assert.equal(revenueCatEventToUpdate({ event: { id: "t2", type: "TRANSFER", transferred_from: ["anon"], transferred_to: [OTHER] } }, { allowSandbox: false }).kind, "ignore");
});
