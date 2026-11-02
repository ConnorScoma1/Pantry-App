import { NextResponse } from "next/server";
import { findSpecials } from "@/lib/pricing/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { readJson } from "@/lib/read-json";

/**
 * Specials for the phone app. Requires `Authorization: Bearer <supabase access token>`.
 *   POST { storeId, terms:[{term,department}] } → { ok, data: { specials, checked, failed, … } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 20_000);
  if (!read.ok) return read.response;
  const body = read.body;
  const result = await findSpecials(body, s.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
