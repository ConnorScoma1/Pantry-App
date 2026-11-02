import { revenueCatEventToUpdate, verifyRevenueCatAuth } from "@kitchen-pantry/integrations";
import { NextResponse } from "next/server";
import { applyStoreTransfer, applySubscriptionUpdate, revenueCatConfig } from "@/lib/billing/server";
import { readJson } from "@/lib/read-json";

/**
 * RevenueCat (App Store / Google Play) → subscription access. RevenueCat
 * sends the Authorization value set in its dashboard; anything else is
 * refused. Each event is applied once; a storage failure answers 500 so
 * RevenueCat retries.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = revenueCatConfig();
  if (!config.webhookAuth) return NextResponse.json({ ok: false }, { status: 404 });
  if (!verifyRevenueCatAuth(request.headers.get("authorization"), config.webhookAuth)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const read = await readJson(request, 256_000);
  if (!read.ok) return read.response;
  const result = revenueCatEventToUpdate(read.body, { allowSandbox: config.allowSandbox, entitlement: config.entitlement });
  if (result.kind === "ignore") return NextResponse.json({ ok: true, ignored: result.reason });
  if (result.kind === "transfer") {
    const moved = await applyStoreTransfer(result.eventId, result.fromUsers, result.toUser);
    return NextResponse.json({ ok: moved }, { status: moved ? 200 : 500 });
  }
  const stored = await applySubscriptionUpdate(result.update);
  return NextResponse.json({ ok: stored }, { status: stored ? 200 : 500 });
}
