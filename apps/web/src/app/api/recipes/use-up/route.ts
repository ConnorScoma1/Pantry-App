import { NextResponse } from "next/server";
import { draftUseUpForHousehold } from "@/lib/library/drafts";
import { readJson } from "@/lib/read-json";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * A new AI dinner around kitchen ingredients, for the phone app (Claude runs
 * here so the key stays on the server). Body: { itemIds: uuid[1–5], today }.
 * Requires `Authorization: Bearer <supabase access token>`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 2_000);
  if (!read.ok) return read.response;
  const result = await draftUseUpForHousehold(read.body, { db: s.db, householdKey: s.userId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
