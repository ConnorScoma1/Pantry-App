import { NextResponse } from "next/server";
import { readJson } from "@/lib/read-json";
import { adviseShopping } from "@/lib/shopping/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * The AI shopping advisor for the phone app. Takes the signed comparison
 * token the compare route returned — never numbers from the phone.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 80_000);
  if (!read.ok) return read.response;
  const token = (read.body as { token?: unknown } | null)?.token;
  const result = await adviseShopping(token, s.userId, s.db);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
