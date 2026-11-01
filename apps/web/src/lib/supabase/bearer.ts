import "server-only";
import { createClient } from "@supabase/supabase-js";
import { asSupabaseLike } from "./adapter";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Supabase client for API routes called by the phone app, which sends the
 * user's access token as `Authorization: Bearer <jwt>` instead of cookies.
 * Queries run as that user, so row-level security applies.
 */
export async function supabaseFromBearer(request: Request) {
  if (!isSupabaseConfigured) return null;
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token || token.length > 4096) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { db: asSupabaseLike(client), userId: data.user.id };
}
