import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseLike } from "@kitchen-pantry/database";
import { asSupabaseLike } from "./adapter";
import { supabaseUrl } from "./config";

/**
 * SERVER ONLY. Supabase with the service role, used for exactly two things:
 * Smart Cart sends to a real retailer (the database only lets the server
 * start and finish those, acting for a named member it re-checks) and
 * reading/writing sealed retailer tokens (clients can't read that table).
 * Never import this into client code; never use it for anything else.
 */
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
let client: SupabaseLike | null = null;

export const serviceRoleConfigured = () => Boolean(supabaseUrl && serviceKey);

export function serviceSupabase(): SupabaseLike | null {
  if (!serviceRoleConfigured()) return null;
  client ??= asSupabaseLike(createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
  return client;
}
