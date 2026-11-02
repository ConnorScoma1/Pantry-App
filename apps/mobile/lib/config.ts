/**
 * Supabase is optional while developing. Without these values the app runs
 * in PREVIEW MODE: no sign-in, data kept on this device only.
 */
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * The Kitchen Pantry web server (e.g. http://192.168.1.20:3000). Planning with
 * Claude runs there so the API key never ships in the app. Unset → the phone
 * uses the built-in planner only.
 */
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
