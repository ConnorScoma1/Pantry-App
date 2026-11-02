import { NextResponse } from "next/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Download my data (migration …2700). The website calls it with its session
 * cookie; the phone app with `Authorization: Bearer <access token>`. Returns
 * one JSON file of everything the account can see (row-level security
 * decides, exactly as in the app). Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ ok: false, message: "Supabase isn't configured." }, { status: 404 });
  const bearer = await supabaseFromBearer(request);
  let rpc: (fn: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  if (bearer) {
    rpc = (fn) => bearer.db.rpc(fn);
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
    rpc = (fn) => supabase.rpc(fn);
  }
  const { data, error } = await rpc("export_my_data");
  if (error || !data) {
    console.error("[account] export failed", { code: error?.code });
    const message = error?.code === "PGRST202" ? "Data download isn't set up on the server yet (migration …2700)." : "We couldn't prepare your data. Please try again.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="kitchen-pantry-data-${day}.json"`,
      "cache-control": "no-store, private",
    },
  });
}
