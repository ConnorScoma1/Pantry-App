import { fetchStripeSubscription, stripeEventToUpdate, verifyStripeSignature } from "@kitchen-pantry/integrations";
import { NextResponse } from "next/server";
import { applySubscriptionUpdate, stripeConfig } from "@/lib/billing/server";

/**
 * Stripe → subscription access. Only signed requests are accepted (the
 * endpoint's signing secret), each event is applied once, and only
 * customer.subscription.* events change anything. Events can arrive late or
 * out of order, so the subscription is re-read from Stripe and that current
 * state is stored. A failure answers 500 so Stripe retries.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { webhookSecret } = stripeConfig();
  if (!webhookSecret) return NextResponse.json({ ok: false }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ ok: false }, { status: 413 });
  if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), webhookSecret))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // Store Stripe's current state, not the event's snapshot.
  const e = event as { type?: string; data?: { object?: { id?: string } } };
  const { secretKey } = stripeConfig();
  if (secretKey && e.type?.startsWith("customer.subscription.") && e.type !== "customer.subscription.deleted" && e.data?.object?.id) {
    const current = await fetchStripeSubscription({ secretKey, subscriptionId: e.data.object.id });
    if (!current.ok && current.status !== 404) return NextResponse.json({ ok: false }, { status: 500 });
    if (current.ok) event = { ...(event as object), created: Math.floor(Date.now() / 1000), data: { object: current.subscription } };
  }
  const result = stripeEventToUpdate(event);
  if (result.kind !== "update") return NextResponse.json({ ok: true, ignored: result.kind === "ignore" ? result.reason : "not handled" });
  const stored = await applySubscriptionUpdate(result.update);
  return NextResponse.json({ ok: stored }, { status: stored ? 200 : 500 });
}
