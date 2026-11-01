"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Browser Supabase client, used only for Realtime (live grocery list).
 * Reads and writes still go through server actions. It shares the signed-in
 * session cookie, so Realtime applies the same row-level security.
 */
let client: SupabaseClient | null = null;
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || typeof window === "undefined") return null;
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
