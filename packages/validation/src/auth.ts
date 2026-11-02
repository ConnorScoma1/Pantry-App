import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Passwords are at least 8 characters"),
});

export const signUpSchema = signInSchema.extend({
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128, "That password is too long"),
});

export const magicLinkSchema = z.object({ email: emailSchema });

// ---------------------------------------------------------------------------
// Social sign-in and plain-language auth errors (shared by web and mobile).
// ---------------------------------------------------------------------------

/** Sign-in providers the app offers, in display order. Each must also be switched on in Supabase. */
export const socialProviders = ["google", "apple", "facebook"] as const;
export type SocialProvider = (typeof socialProviders)[number];

export const socialProviderSchema = z.enum(socialProviders);

export const socialProviderLabels: Record<SocialProvider, string> = {
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
};

/**
 * Which providers Supabase has switched on, from its public auth settings
 * (`GET /auth/v1/settings` → `{ external: { google: true, … } }`). Anything
 * unexpected means none, so a button is never shown for a provider that
 * would fail.
 */
export function enabledSocialProviders(settings: unknown): SocialProvider[] {
  const external = (settings as { external?: Record<string, unknown> } | null)?.external;
  if (!external || typeof external !== "object") return [];
  return socialProviders.filter((p) => external[p] === true);
}

/**
 * A plain-language message for a Supabase Auth error code. Sign-in failures
 * always get the same message (no hint whether an email has an account).
 */
export function authErrorMessage(code: string | undefined, action: "sign-in" | "sign-up" | "link" | "social"): string {
  switch (code) {
    case "weak_password":
      return "Choose a stronger password: at least 10 characters, mixing letters, numbers and symbols, and not a common one.";
    case "email_address_invalid":
      return "That email address can't be used. Check it, or try another address.";
    case "email_address_not_authorized":
      return "We can't send email to that address yet. Email sending still needs setting up in Supabase (see the README, “Sign-in and accounts”).";
    case "over_email_send_rate_limit":
      return "Too many emails were sent in the last hour. Wait a while and try again, or sign in with Google, Apple or Facebook.";
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a minute and try again.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Creating accounts with an email address is switched off right now.";
    case "provider_disabled":
      return "That sign-in option isn't switched on yet.";
    case "email_not_confirmed":
      return "Confirm your email first: open the link we sent you, then sign in.";
    case "unexpected_failure":
      return "Something went wrong on our side creating your account. Please try again in a minute.";
    default:
      break;
  }
  switch (action) {
    case "sign-in":
      return "That email and password don't match.";
    case "sign-up":
      return "We couldn't create that account. If you already have one, sign in or use an email link instead.";
    case "link":
      return "We couldn't send a link right now. Please try again shortly.";
    case "social":
      return "That sign-in didn't finish. Please try again.";
  }
}
