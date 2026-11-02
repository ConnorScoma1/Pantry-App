import { NextResponse } from "next/server";
import { answerCookingQuestion } from "@/lib/cooking/help";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { readJson } from "@/lib/read-json";

/**
 * The cooking assistant for the phone app (Claude runs here so the key stays
 * on the server). Requires `Authorization: Bearer <supabase access token>`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 4_000);
  if (!read.ok) return read.response;
  const body = read.body;
  const result = await answerCookingQuestion(body, { db: s.db });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
