import { NextResponse } from "next/server";
import { findSpecials } from "@/lib/pricing/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * Specials for the phone app. Requires `Authorization: Bearer <supabase access token>`.
 *   POST { storeId, terms:[{term,department}] } → { ok, data: { specials, checked, failed, … } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 20_000) {
    return NextResponse.json({ ok: false, message: "Request too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }
  const result = await findSpecials(body, s.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
