import { createSupabaseShoppingRepository } from "@kitchen-pantry/database";
import { NextResponse } from "next/server";
import { readJson } from "@/lib/read-json";
import { saveTripVerified } from "@/lib/shopping/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * Save the trip a member chose (phone app). Store names and addresses are
 * read again from Kroger here, so the shared list never shows a client's text.
 * Requires `Authorization: Bearer <supabase access token>`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 40_000);
  if (!read.ok) return read.response;
  const result = await saveTripVerified(read.body, createSupabaseShoppingRepository(s.db));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
