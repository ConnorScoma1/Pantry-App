import { NextResponse } from "next/server";
import { useSoonStatus } from "@/lib/planning/reminders";
import { weeklyDraftsStatus } from "@/lib/planning/weekly";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

/** For the phone app: are the weekly drafts and use-soon reminder jobs set up on this server? Requires a signed-in user. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const s = await supabaseFromBearer(request);
  if (!s) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  return NextResponse.json({ ...weeklyDraftsStatus(), reminders: useSoonStatus() });
}
