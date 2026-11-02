/**
 * Subscriptions: Stripe (website) and RevenueCat (App Store / Google Play).
 *
 * Plain fetch + Web Crypto, no SDKs. Everything here is pure or takes a
 * fetch function, so it's unit-tested without either service. Nothing is
 * bought or charged here: Stripe Checkout and the app stores take payment on
 * their own pages; we only read their webhooks and update access.
 */

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** What a webhook turns into: one call to apply_subscription_event. */
export interface SubscriptionUpdate {
  eventId: string;
  eventSource: "stripe" | "revenuecat";
  userId: string;
  source: "stripe" | "app_store" | "play_store" | "revenuecat";
  externalId: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "expired" | "incomplete";
  productId: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  customerId: string | null;
  eventAt: string;
}

export type WebhookResult =
  | { kind: "update"; update: SubscriptionUpdate }
  /** A store purchase moved to another account (RevenueCat TRANSFER). */
  | { kind: "transfer"; eventId: string; fromUsers: string[]; toUser: string }
  | { kind: "ignore"; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (secondsOrMs: number, ms = false) => new Date(ms ? secondsOrMs : secondsOrMs * 1000).toISOString();

// ---------------------------------------------------------------------------
// Constant-time helpers (Web Crypto)
// ---------------------------------------------------------------------------
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------
export const STRIPE_API = "https://api.stripe.com/v1";

/**
 * Verify a Stripe webhook: `Stripe-Signature: t=…,v1=…` is HMAC-SHA256 of
 * "t.rawBody" with the endpoint's signing secret, and t must be recent
 * (5 minutes) so an old request can't be replayed.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || signatures.length === 0 || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return signatures.some((s) => timingSafeEqualStr(s, expected));
}

interface StripeSubscription {
  id?: string;
  customer?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  ended_at?: number | null;
  metadata?: Record<string, string>;
  current_period_start?: number;
  items?: { data?: Array<{ current_period_end?: number; current_period_start?: number; price?: { id?: string } }> };
}

/** A Stripe event → a subscription update (only customer.subscription.* events matter). */
export function stripeEventToUpdate(event: unknown, now = new Date()): WebhookResult {
  const e = event as { id?: string; type?: string; created?: number; data?: { object?: StripeSubscription } };
  if (!e?.id || !e.type) return { kind: "ignore", reason: "not an event" };
  if (!/^customer\.subscription\.(created|updated|deleted|resumed|paused)$/.test(e.type)) return { kind: "ignore", reason: `not handled: ${e.type}` };
  const s = e.data?.object;
  const userId = s?.metadata?.user_id ?? "";
  if (!s?.id || !UUID.test(userId)) return { kind: "ignore", reason: "no user on the subscription" };
  const item = s.items?.data?.[0];
  // Newer API versions keep the period end on the item.
  const periodEnd = item?.current_period_end ?? s.current_period_end ?? null;
  const st = e.type === "customer.subscription.deleted" ? "canceled" : (s.status ?? "incomplete");
  let status: SubscriptionUpdate["status"];
  let expiresAt: string | null;
  switch (st) {
    case "active":
    case "trialing":
      status = st;
      expiresAt = periodEnd ? iso(periodEnd) : null;
      break;
    case "past_due": {
      // The renewal payment failed and Stripe is retrying. The period has already rolled
      // over to the unpaid year, so allow a 14-day grace from its start, not the whole year.
      status = "past_due";
      const start = item?.current_period_start ?? s.current_period_start ?? Math.floor(now.getTime() / 1000);
      const grace = start + 14 * 86_400;
      expiresAt = iso(periodEnd ? Math.min(periodEnd, grace) : grace);
      break;
    }
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      status = st === "canceled" ? "canceled" : "expired";
      expiresAt = s.ended_at ? iso(s.ended_at) : now.toISOString();
      break;
    default: // incomplete, paused
      status = "incomplete";
      expiresAt = null;
  }
  return {
    kind: "update",
    update: {
      eventId: `stripe:${e.id}`,
      eventSource: "stripe",
      userId,
      source: "stripe",
      externalId: s.id,
      status,
      productId: item?.price?.id ?? null,
      expiresAt,
      willRenew: (status === "active" || status === "trialing") && !s.cancel_at_period_end,
      customerId: typeof s.customer === "string" && /^cus_[A-Za-z0-9]{1,100}$/.test(s.customer) ? s.customer : null,
      eventAt: iso(e.created ?? Math.floor(now.getTime() / 1000)),
    },
  };
}

function form(params: Record<string, string | number | null | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function stripePost(secretKey: string, path: string, params: Record<string, string | number | null | undefined>, fetchImpl: FetchLike): Promise<{ ok: true; data: { url?: string } } | { ok: false; status: number }> {
  const res = await fetchImpl(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: form(params),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json()) as { url?: string } };
}

/**
 * Stripe Checkout for the yearly plan. If the person is still in their free
 * trial (and it has 2+ days left — Stripe's minimum), billing starts when the
 * trial ends, so subscribing early never costs them trial days.
 */
export async function createStripeCheckout(options: {
  secretKey: string;
  priceId: string;
  userId: string;
  email: string | null;
  customerId: string | null;
  trialEndsAt: string | null;
  successUrl: string;
  cancelUrl: string;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const now = options.now ?? new Date();
  const trialEnd = options.trialEndsAt ? Math.floor(Date.parse(options.trialEndsAt) / 1000) : 0;
  const keepTrial = trialEnd - Math.floor(now.getTime() / 1000) > 2 * 86_400;
  const r = await stripePost(
    options.secretKey,
    "/checkout/sessions",
    {
      mode: "subscription",
      "line_items[0][price]": options.priceId,
      "line_items[0][quantity]": 1,
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      client_reference_id: options.userId,
      customer: options.customerId,
      customer_email: options.customerId ? null : options.email,
      "metadata[user_id]": options.userId,
      "subscription_data[metadata][user_id]": options.userId,
      "subscription_data[trial_end]": keepTrial ? trialEnd : null,
      allow_promotion_codes: "true",
    },
    options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike),
  );
  if (!r.ok || !r.data.url?.startsWith("https://")) return { ok: false, message: "Checkout isn't available right now. Please try again." };
  return { ok: true, url: r.data.url };
}

/**
 * The subscription as Stripe has it now. Webhooks can arrive late or out of
 * order, so the webhook re-reads the subscription and stores that.
 */
export async function fetchStripeSubscription(options: { secretKey: string; subscriptionId: string; fetchImpl?: FetchLike }): Promise<{ ok: true; subscription: unknown } | { ok: false; status: number }> {
  if (!/^sub_[A-Za-z0-9]{1,100}$/.test(options.subscriptionId)) return { ok: false, status: 400 };
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const res = await doFetch(`${STRIPE_API}/subscriptions/${options.subscriptionId}`, {
    method: "GET",
    headers: { authorization: `Bearer ${options.secretKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, subscription: await res.json() };
}

/** Turn renewal off (cancel at the end of the paid period). Reversible in the customer portal. */
export async function stopStripeRenewal(options: { secretKey: string; subscriptionId: string; fetchImpl?: FetchLike }): Promise<boolean> {
  if (!/^sub_[A-Za-z0-9]{1,100}$/.test(options.subscriptionId)) return false;
  const r = await stripePost(options.secretKey, `/subscriptions/${options.subscriptionId}`, { cancel_at_period_end: "true" }, options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  return r.ok;
}

/** Stripe's customer portal: change card, see invoices, cancel. */
export async function createStripePortal(options: { secretKey: string; customerId: string; returnUrl: string; fetchImpl?: FetchLike }): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const r = await stripePost(options.secretKey, "/billing_portal/sessions", { customer: options.customerId, return_url: options.returnUrl }, options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  if (!r.ok || !r.data.url?.startsWith("https://")) return { ok: false, message: "Billing settings aren't available right now. Please try again." };
  return { ok: true, url: r.data.url };
}

// ---------------------------------------------------------------------------
// RevenueCat (App Store / Google Play)
// ---------------------------------------------------------------------------

/** RevenueCat sends the Authorization header value you set in its dashboard. */
export function verifyRevenueCatAuth(header: string | null, expected: string): boolean {
  if (!header || !expected) return false;
  const value = header.trim();
  return timingSafeEqualStr(value, expected) || timingSafeEqualStr(value, `Bearer ${expected}`);
}

interface RevenueCatEvent {
  id?: string;
  transferred_from?: string[];
  transferred_to?: string[];
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  environment?: string;
  store?: string;
  original_transaction_id?: string;
  transaction_id?: string;
}

const RC_ACTIVE = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT", "NON_RENEWING_PURCHASE", "REFUND_REVERSED"]);

/**
 * A RevenueCat webhook → a subscription update. The app logs people in to
 * RevenueCat with their account id, so app_user_id (or an alias) is our
 * user. Sandbox purchases count only when allowed (testing).
 */
export function revenueCatEventToUpdate(body: unknown, options: { allowSandbox: boolean; entitlement?: string | null; now?: Date }): WebhookResult {
  const e = (body as { event?: RevenueCatEvent } | null)?.event;
  const now = options.now ?? new Date();
  if (!e?.id || !e.type) return { kind: "ignore", reason: "not an event" };
  if (e.type === "TEST") return { kind: "ignore", reason: "test event" };
  if (e.type === "TRANSFER") {
    const toUser = (e.transferred_to ?? []).find((id) => UUID.test(id));
    const fromUsers = (e.transferred_from ?? []).filter((id) => UUID.test(id));
    if (!toUser || fromUsers.length === 0) return { kind: "ignore", reason: "transfer without our users" };
    return { kind: "transfer", eventId: `revenuecat:${e.id}`, fromUsers, toUser };
  }
  if (e.environment === "SANDBOX" && !options.allowSandbox) return { kind: "ignore", reason: "sandbox" };
  if (options.entitlement && e.entitlement_ids && !e.entitlement_ids.includes(options.entitlement)) return { kind: "ignore", reason: "other entitlement" };
  const userId = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].find((id): id is string => typeof id === "string" && UUID.test(id));
  if (!userId) return { kind: "ignore", reason: "no app user" };
  const expires = typeof e.expiration_at_ms === "number" ? iso(e.expiration_at_ms, true) : null;
  let status: SubscriptionUpdate["status"];
  let expiresAt = expires;
  let willRenew = false;
  if (RC_ACTIVE.has(e.type)) {
    status = "active";
    willRenew = e.type !== "NON_RENEWING_PURCHASE";
  } else if (e.type === "CANCELLATION") {
    status = "canceled"; // auto-renew is off; access lasts until expiration
  } else if (e.type === "BILLING_ISSUE") {
    status = "past_due";
    willRenew = true;
  } else if (e.type === "EXPIRATION") {
    status = "expired";
    expiresAt = expires && Date.parse(expires) < now.getTime() ? expires : now.toISOString();
  } else {
    return { kind: "ignore", reason: `not handled: ${e.type}` };
  }
  const source = e.store === "APP_STORE" || e.store === "MAC_APP_STORE" ? "app_store" : e.store === "PLAY_STORE" ? "play_store" : "revenuecat";
  return {
    kind: "update",
    update: {
      eventId: `revenuecat:${e.id}`,
      eventSource: "revenuecat",
      userId,
      source,
      externalId: (e.original_transaction_id ?? `${userId}:${e.product_id ?? "subscription"}`).slice(0, 200),
      status,
      productId: e.product_id ?? null,
      expiresAt,
      willRenew,
      customerId: null,
      eventAt: iso(e.event_timestamp_ms ?? now.getTime(), true),
    },
  };
}

/** Cancel a website subscription immediately (used when someone deletes their account). */
export async function cancelStripeSubscription(options: { secretKey: string; subscriptionId: string; fetchImpl?: FetchLike }): Promise<boolean> {
  if (!/^sub_[A-Za-z0-9]{1,100}$/.test(options.subscriptionId)) return false;
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const res = await doFetch(`${STRIPE_API}/subscriptions/${options.subscriptionId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${options.secretKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  // 404: already gone.
  return res.ok || res.status === 404;
}
