import { NextResponse } from "next/server";
import { draftForHousehold } from "@/lib/library/drafts";
import { readJson } from "@/lib/read-json";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * AI recipe drafts for the phone app (Claude runs here so the key stays on
 * the server). Requires `Authorization: Bearer <supabase access token>`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 2_000);
  if (!read.ok) return read.response;
  const result = await draftForHousehold(read.body, { db: s.db, householdKey: s.userId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
