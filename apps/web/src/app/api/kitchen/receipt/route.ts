import { NextResponse } from "next/server";
import { readReceiptPhoto } from "@/lib/kitchen/import-server";
import { readJson } from "@/lib/read-json";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read a receipt photo (Claude, server-side; the photo isn't stored).
 * The browser uses its session cookie, the phone a bearer token; preview
 * mode (no accounts) only where AI in preview is allowed.
 *   POST { mediaType, base64 } → { ok, data: draft }
 * A route rather than a server action because photos are bigger than a
 * server action accepts.
 */
export const dynamic = "force-dynamic";

async function caller(request: Request) {
  if (!isSupabaseConfigured) return { db: null };
  if (request.headers.get("authorization")) {
    const s = await supabaseFromBearer(request);
    return s ? { db: s.db } : null;
  }
  // Cookie sessions: only same-site JSON requests (a cross-site page can't send these without CORS).
  const origin = request.headers.get("origin");
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return null;
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return null;
    } catch {
      return null;
    }
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { db: asSupabaseLike(supabase) } : null;
}

export async function POST(request: Request) {
  const c = await caller(request);
  if (!c) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const read = await readJson(request, 5_000_000);
  if (!read.ok) return read.response;
  const result = await readReceiptPhoto(read.body, c.db);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
