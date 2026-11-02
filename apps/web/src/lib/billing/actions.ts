"use server";

import { createStripeCheckout, createStripePortal } from "@kitchen-pantry/integrations";
import { loadAccess } from "@kitchen-pantry/database";
import { redirect } from "next/navigation";
import { stripeConfig } from "@/lib/billing/server";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured, siteUrl } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillingActionResult = { ok: false; message: string };

async function signedIn() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

async function stripeCustomer(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<string | null> {
  const { data } = await supabase.from("subscriptions").select("stripe_customer_id").eq("source", "stripe").not("stripe_customer_id", "is", null).order("updated_at", { ascending: false }).limit(1);
  const id = (data as Array<{ stripe_customer_id: string | null }> | null)?.[0]?.stripe_customer_id;
  return id ?? null;
}

/** Website subscribe button → Stripe Checkout (Stripe takes payment on its own page). */
export async function startCheckoutAction(): Promise<BillingActionResult> {
  const s = await signedIn();
  if (!s) return { ok: false, message: "Please sign in again." };
  const { checkout } = stripeConfig();
  if (!checkout) return { ok: false, message: "Subscriptions aren't set up on this website yet." };
  const access = await loadAccess(asSupabaseLike(s.supabase));
  if (access.reason === "subscribed" || access.subscription?.active) return { ok: false, message: "You're already subscribed." };
  if (access.reason === "household") return { ok: false, message: "Your household's subscription already covers you." };
  const r = await createStripeCheckout({
    ...checkout,
    userId: s.user.id,
    email: s.user.email ?? null,
    customerId: await stripeCustomer(s.supabase),
    trialEndsAt: access.reason === "trial" ? access.trialEndsAt : null,
    successUrl: `${siteUrl}/profile?subscribed=1#subscription`,
    cancelUrl: `${siteUrl}/profile#subscription`,
  });
  if (!r.ok) return { ok: false, message: r.message };
  redirect(r.url);
}

/** Manage / cancel a website subscription in Stripe's customer portal. */
export async function openBillingPortalAction(): Promise<BillingActionResult> {
  const s = await signedIn();
  if (!s) return { ok: false, message: "Please sign in again." };
  const { secretKey } = stripeConfig();
  const customerId = await stripeCustomer(s.supabase);
  if (!secretKey || !customerId) return { ok: false, message: "There's no website subscription to manage." };
  const r = await createStripePortal({ secretKey, customerId, returnUrl: `${siteUrl}/profile#subscription` });
  if (!r.ok) return { ok: false, message: r.message };
  redirect(r.url);
}
