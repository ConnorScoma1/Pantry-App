import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseLike } from "@kitchen-pantry/database";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Mobile Supabase client. Only the anon/publishable key ships in the app;
 * row-level security in Postgres decides what each user can read or write.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // On web (Expo web) Supabase uses localStorage by default.
        ...(Platform.OS === "web" ? {} : { storage: AsyncStorage }),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Google / Apple / Facebook come back with a one-time code (see social-sign-in.ts).
        flowType: "pkce",
      },
    })
  : null;

// Refresh tokens only while the app is in the foreground.
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/** The shared data layer only needs `from` and `rpc`. */
export function asSupabaseLike(client: SupabaseClient): SupabaseLike {
  return client as unknown as SupabaseLike;
}
