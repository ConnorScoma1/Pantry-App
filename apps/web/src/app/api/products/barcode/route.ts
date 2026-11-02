import { NextResponse } from "next/server";
import { lookupBarcode } from "@/lib/kitchen/import-server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * Barcode lookup for the phone app (Open Food Facts, through the server so
 * lookups are cached and rationed). Requires `Authorization: Bearer <token>`.
 *   GET ?code=0036000291452[&format=upc_e] → { ok, data: { product | null, available } }
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await lookupBarcode(params.get("code"), s.userId, params.get("format"));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
