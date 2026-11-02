import { createSupabaseCartRepository } from "@kitchen-pantry/database";
import { NextResponse } from "next/server";
import { disconnectKroger, finishKrogerConnect, krogerConnected, retailerOptions, sendCart, startKrogerConnect } from "@/lib/cart/server";
import { matchCartItems } from "@/lib/pricing/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { readJson } from "@/lib/read-json";

/**
 * Smart Cart for the phone app. `Authorization: Bearer <supabase access token>`.
 * POST { action, ... }:
 *   options                    → { retailers, krogerConnected }
 *   match   { retailer, storeId, needs } → { ok, data: { lines, warning } }
 *   send    { draftId, key }   → { ok, data: { draft, message, needsAuth } }
 *   connect                    → { ok, data: { url } }  (open in the browser)
 *   finish  { code, state }    → { ok }  (after kitchenpantry://cart?kroger_code=…)
 *   disconnect                 → { ok }
 * The cart itself is read and edited through Supabase directly (RLS + SQL functions).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 200_000);
  if (!read.ok) return read.response;
  const body = (read.body && typeof read.body === "object" ? read.body : {}) as Record<string, unknown>;
  switch (body.action) {
    case "options":
      return NextResponse.json({ retailers: retailerOptions(), krogerConnected: await krogerConnected(s.db) });
    case "match":
      return NextResponse.json(await matchCartItems(body, s.userId));
    case "send":
      return NextResponse.json(await sendCart(s.db, s.userId, body));
    case "connect":
      return NextResponse.json(startKrogerConnect(s.userId, "mobile"));
    case "finish":
      return NextResponse.json(await finishKrogerConnect(s.userId, String(body.code ?? ""), String(body.state ?? "")));
    case "disconnect":
      return NextResponse.json(await disconnectKroger(s.userId));
    case "current":
      return NextResponse.json(await createSupabaseCartRepository(s.db).current());
    default:
      return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 400 });
  }
}
