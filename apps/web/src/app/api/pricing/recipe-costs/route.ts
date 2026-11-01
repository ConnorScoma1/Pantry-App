import { NextResponse } from "next/server";
import { priceRecipes } from "@/lib/pricing/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/**
 * Recipe cost per serving for the phone app (Surprise Me "under $5").
 * `Authorization: Bearer <supabase access token>`.
 *   POST { storeId, recipes:[{id, servings, ingredients:[{name, quantity}]}] } → { ok, data: { costs, warning } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 60_000) return NextResponse.json({ ok: false, message: "Request too large." }, { status: 413 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }
  const result = await priceRecipes(body, s.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
