"use server";

import { createSupabaseProfileStore } from "@kitchen-pantry/database";
import { issuesToFieldErrors, onboardingProfileSchema } from "@kitchen-pantry/validation";
import { revalidatePath } from "next/cache";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveOnboardingResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Validates the full questionnaire on the server (never trust the client)
 * and saves it atomically via the save_onboarding_profile RPC, under RLS.
 */
export async function saveOnboardingAction(input: unknown): Promise<SaveOnboardingResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: "Supabase isn't configured." };
  }

  const parsed = onboardingProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Some answers need another look.",
      fieldErrors: issuesToFieldErrors(parsed.error),
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Please sign in again." };

  const saved = await createSupabaseProfileStore(asSupabaseLike(supabase)).save(parsed.data);
  if (!saved.ok) return { ok: false, message: saved.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
