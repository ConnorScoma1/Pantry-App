import "server-only";
import { enabledSocialProviders, type SocialProvider } from "@kitchen-pantry/validation";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

/**
 * The social sign-in options switched on in the Supabase dashboard
 * (Authentication → Sign In / Providers). Read from Supabase's public auth
 * settings and re-checked every 5 minutes, so a button appears once a
 * provider is turned on — and never for one that would fail.
 */
export async function socialSignInOptions(): Promise<SocialProvider[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return [];
    return enabledSocialProviders(await res.json());
  } catch {
    return [];
  }
}
