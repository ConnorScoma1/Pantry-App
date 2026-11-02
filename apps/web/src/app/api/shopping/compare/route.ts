import { NextResponse } from "next/server";
import { readJson } from "@/lib/read-json";
import { compareShopping, shoppingStatus } from "@/lib/shopping/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * One Store vs. Best Deals for the phone app (Kroger and Mapbox keys stay on
 * the server). Requires `Authorization: Bearer <supabase access token>`.
 *   GET  → { livePrices, routing, advisor }
 *   POST { mode, items, storeIds, start, settings, baselineStoreKey } → { ok, data: comparison }
 */
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });

export async function GET(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return unauthorized();
  return NextResponse.json(shoppingStatus());
}

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return unauthorized();
  const read = await readJson(request, 40_000);
  if (!read.ok) return read.response;
  const result = await compareShopping(read.body, s.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
