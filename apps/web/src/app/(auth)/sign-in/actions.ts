"use server";

import { issuesToFieldErrors, magicLinkSchema, signInSchema, signUpSchema } from "@kitchen-pantry/validation";
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
    return { status: "error", message: "That email and password don't match.", email: parsed.data.email };
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
    return { status: "error", message: "We couldn't create that account. Try a different email or sign in.", email: parsed.data.email };
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
    return { status: "error", message: "We couldn't send a link right now. Please try again shortly.", email: parsed.data.email };
  }
  return { status: "sent", message: "Check your inbox for a sign-in link.", email: parsed.data.email };
}
