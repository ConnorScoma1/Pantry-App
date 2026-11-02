import { NextResponse } from "next/server";
import { aiPlanningStatus, generateMealPlan } from "@/lib/meal-plan/generate";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { readJson } from "@/lib/read-json";

/**
 * Meal planning for the phone app (Claude runs here so the API key stays on
 * the server). Requires `Authorization: Bearer <supabase access token>`.
 *   GET  → { enabled, remaining }
 *   POST → body = planning request → { ok, data | message }
 */
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });

export async function GET(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return unauthorized();
  return NextResponse.json(await aiPlanningStatus(s.db));
}

export async function POST(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return unauthorized();
  const read = await readJson(request, 20_000);
  if (!read.ok) return read.response;
  const body = read.body;
  const result = await generateMealPlan(body, { db: s.db, householdKey: s.userId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
