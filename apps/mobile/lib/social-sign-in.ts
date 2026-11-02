import { enabledSocialProviders, socialProviderLabels, type SocialProvider } from "@kitchen-pantry/validation";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { supabase } from "./supabase";

/**
 * Google / Apple / Facebook sign-in on the phone. Supabase opens the
 * provider in a secure in-app browser (ASWebAuthenticationSession on iOS,
 * Custom Tabs on Android); the provider sends the person back to
 * kitchenpantry://auth/callback with a one-time code, which is exchanged
 * here for a session (PKCE — the secret half never leaves this phone).
 * A first sign-in creates the account.
 */

WebBrowser.maybeCompleteAuthSession();

/** Where providers return to: kitchenpantry://auth/callback (exp://…/--/auth/callback in Expo Go). */
export function authRedirectUrl(): string {
  return Linking.createURL("auth/callback");
}

/** Providers switched on in Supabase (Authentication → Sign In / Providers). */
export async function socialSignInOptions(): Promise<SocialProvider[]> {
  if (!supabase) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey }, signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? enabledSocialProviders(await res.json()) : [];
  } catch {
    return [];
  }
}

/** The one-time code (or the provider's error) in a callback URL. */
export function callbackParams(url: string): { code: string | null; failed: boolean } {
  const { queryParams } = Linking.parse(url);
  const one = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null);
  const code = one(queryParams?.code);
  const failed = Boolean(one(queryParams?.error) ?? one(queryParams?.error_description));
  return { code, failed };
}

export type SocialResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

export async function signInWithProvider(provider: SocialProvider): Promise<SocialResult> {
  const label = socialProviderLabels[provider];
  if (!supabase) return { ok: false, cancelled: false, message: "Supabase isn't configured." };
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true, ...(provider === "facebook" ? { scopes: "email" } : {}) },
  });
  if (error || !data.url) return { ok: false, cancelled: false, message: `${label} sign-in isn't available right now.` };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { ok: false, cancelled: true, message: "" };
  const { code, failed } = callbackParams(result.url);
  if (!code || failed) return { ok: false, cancelled: false, message: `${label} sign-in didn't finish. Please try again.` };
  return exchange(code, label);
}

/** Finish a sign-in from a callback link (also used when Android opens the link directly). */
export async function finishSignIn(code: string, label = "That"): Promise<SocialResult> {
  return exchange(code, label);
}

async function exchange(code: string, label: string): Promise<SocialResult> {
  if (!supabase) return { ok: false, cancelled: false, message: "Supabase isn't configured." };
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Already exchanged by the other path (in-app browser vs. deep link) counts as done if there's a session now.
    const { data } = await supabase.auth.getSession();
    if (data.session) return { ok: true };
    return { ok: false, cancelled: false, message: `${label} sign-in didn't finish. Please try again.` };
  }
  return { ok: true };
}
