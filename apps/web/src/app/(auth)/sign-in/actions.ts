"use server";

import { authErrorMessage, issuesToFieldErrors, magicLinkSchema, signInSchema, signUpSchema, socialProviderSchema } from "@kitchen-pantry/validation";
import { redirect } from "next/navigation";
import { isSupabaseConfigured, siteUrl } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthFormState {
  status: "idle" | "error" | "sent";
  message?: string;
  fieldErrors?: Record<string, string>;
  email?: string;
}

function notConfigured(): AuthFormState {
  return { status: "error", message: "Supabase isn't configured yet — see the README." };
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: issuesToFieldErrors(parsed.error), email: String(formData.get("email") ?? "") };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown email and wrong password (no account enumeration).
    return { status: "error", message: authErrorMessage(error.code, "sign-in"), email: parsed.data.email };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = signUpSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: issuesToFieldErrors(parsed.error), email: String(formData.get("email") ?? "") };
  }
  // New people arriving from a household invite go back to it after confirming.
  const requested = safeNext(formData.get("next"));
  const after = requested.startsWith("/invite/") ? requested : "/onboarding";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(after)}` },
  });
  if (error) {
    console.error("[auth] sign-up failed", { code: error.code });
    return { status: "error", message: authErrorMessage(error.code, "sign-up"), email: parsed.data.email };
  }
  if (!data.session) {
    return { status: "sent", message: "Check your email to confirm your account.", email: parsed.data.email };
  }
  redirect(after);
}

export async function magicLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", fieldErrors: issuesToFieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("next")))}` },
  });
  if (error) {
    console.error("[auth] magic link failed", { code: error.code });
    return { status: "error", message: authErrorMessage(error.code, "link"), email: parsed.data.email };
  }
  return { status: "sent", message: "Check your inbox for a sign-in link.", email: parsed.data.email };
}

/**
 * Google / Apple / Facebook: Supabase sends the person to the provider and
 * back to /auth/callback with a one-time code (PKCE — the verifier stays in
 * this browser's cookie). A first sign-in creates the account.
 */
export async function socialSignInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const provider = socialProviderSchema.safeParse(formData.get("provider"));
  if (!provider.success) return { status: "error", message: authErrorMessage(undefined, "social") };
  const requested = safeNext(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.data,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(requested)}`,
      // Facebook needs to be asked for the email address explicitly.
      ...(provider.data === "facebook" ? { scopes: "email" } : {}),
    },
  });
  if (error || !data.url) {
    console.error("[auth] social sign-in failed", { provider: provider.data, code: error?.code });
    return { status: "error", message: authErrorMessage(error?.code, "social") };
  }
  redirect(data.url);
}
