import "server-only";
import { applyUpdateArgs } from "./apply";
import type { SubscriptionUpdate } from "@kitchen-pantry/integrations";
import { serviceSupabase } from "@/lib/supabase/service";

/**
 * Subscription settings (all server-only; nothing here is bought or charged
 * by us — Stripe Checkout and the app stores take payment on their pages).
 *
 *   STRIPE_SECRET_KEY        sk_live_… / sk_test_…   website checkout
 *   STRIPE_PRICE_ID          price_…                 the $24.99/year price
 *   STRIPE_WEBHOOK_SECRET    whsec_…                 /api/billing/stripe/webhook
 *   REVENUECAT_WEBHOOK_AUTH  any long random string   the Authorization value set in RevenueCat
 *   REVENUECAT_ENTITLEMENT   optional entitlement id (e.g. "premium")
 *   REVENUECAT_SANDBOX=off   ignore sandbox purchases (by default they count, so
 *                            App Review and TestFlight purchases unlock the app;
 *                            only your own sandbox testers can make them)
 *
 * Whether access is enforced is a database setting (billing_settings), not
 * an environment variable, so the website, phone and server always agree.
 */
export function stripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const priceId = process.env.STRIPE_PRICE_ID ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  return {
    checkout: /^sk_(live|test)_/.test(secretKey) && /^price_/.test(priceId) ? { secretKey, priceId } : null,
    webhookSecret: webhookSecret.startsWith("whsec_") ? webhookSecret : null,
    secretKey: /^sk_(live|test)_/.test(secretKey) ? secretKey : null,
  };
}

export function revenueCatConfig() {
  const auth = process.env.REVENUECAT_WEBHOOK_AUTH ?? "";
  return {
    webhookAuth: auth.length >= 24 ? auth : null,
    entitlement: (process.env.REVENUECAT_ENTITLEMENT ?? "").trim() || null,
    allowSandbox: process.env.REVENUECAT_SANDBOX !== "off",
  };
}

/**
 * The person's renewing website subscription ids (service role: the id
 * column isn't readable by the app). Used only to cancel them before an
 * account is deleted, after checking who is signed in.
 */
export async function stripeSubscriptionIds(userDb: { auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> } }): Promise<string[]> {
  const svc = serviceSupabase();
  const { data: u } = await userDb.auth.getUser();
  if (!svc || !u.user) return [];
  const { data } = await svc.from("subscriptions").select("external_id, status, will_renew").eq("user_id", u.user.id).eq("source", "stripe");
  return ((data as Array<{ external_id: string; status: string; will_renew: boolean }> | null) ?? [])
    .filter((s) => s.will_renew || s.status === "past_due")
    .map((s) => s.external_id);
}

/** A store purchase moved to another account (RevenueCat TRANSFER). */
export async function applyStoreTransfer(eventId: string, fromUsers: string[], toUser: string): Promise<boolean> {
  const svc = serviceSupabase();
  if (!svc) return false;
  const { error } = await svc.rpc("transfer_store_subscriptions", { event_id: eventId, from_users: fromUsers, to_user: toUser });
  if (error) {
    console.error("[billing] transfer failed", { code: error.code });
    return false;
  }
  return true;
}

/** Mark a website subscription as not renewing (after Stripe confirmed it), before deleting an account. */
export async function markRenewalStopped(subscriptionId: string): Promise<boolean> {
  const svc = serviceSupabase();
  if (!svc) return false;
  const { error } = await svc.from("subscriptions").update({ will_renew: false, status: "canceled" }).eq("source", "stripe").eq("external_id", subscriptionId);
  return !error;
}

/** Apply a verified webhook's update. Returns false if it couldn't be stored (so the provider retries). */
export async function applySubscriptionUpdate(update: SubscriptionUpdate): Promise<boolean> {
  const svc = serviceSupabase();
  if (!svc) return false;
  const { error } = await svc.rpc("apply_subscription_event", applyUpdateArgs(update));
  if (error) {
    console.error("[billing] apply_subscription_event failed", { code: error.code });
    return false;
  }
  return true;
}
