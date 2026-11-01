import { NextResponse } from "next/server";
import { findStores, priceItems, pricingStatus, verifyStore } from "@/lib/pricing/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * Store prices for the phone app (the Kroger secret stays on the server).
 * Requires `Authorization: Bearer <supabase access token>`.
 *   GET                 → { enabled, provider }
 *   GET ?zip=53132      → { ok, data: stores }
 *   GET ?store=01400376 → { ok, data: store }  (check before saving)
 *   POST { storeId, items:[{id,name,quantity}] } → { ok, data: basket }
 */
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });

export async function GET(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return unauthorized();
  const url = new URL(request.url);
  const zip = url.searchParams.get("zip");
  const store = url.searchParams.get("store");
  if (zip !== null) return NextResponse.json(await findStores(zip, s.userId));
  if (store !== null) return NextResponse.json(await verifyStore(store));
  return NextResponse.json(pricingStatus());
}

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return unauthorized();
  if (Number(request.headers.get("content-length") ?? 0) > 40_000) {
    return NextResponse.json({ ok: false, message: "Request too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }
  const result = await priceItems(body, s.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
