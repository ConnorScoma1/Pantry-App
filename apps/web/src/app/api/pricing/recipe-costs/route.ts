import { NextResponse } from "next/server";
import { priceRecipes } from "@/lib/pricing/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { readJson } from "@/lib/read-json";

/**
 * Recipe cost per serving for the phone app (Surprise Me "under $5").
 * `Authorization: Bearer <supabase access token>`.
 *   POST { storeId, recipes:[{id, servings, ingredients:[{name, quantity}]}] } → { ok, data: { costs, warning } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 60_000);
  if (!read.ok) return read.response;
  const body = read.body;
  const result = await priceRecipes(body, s.userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
