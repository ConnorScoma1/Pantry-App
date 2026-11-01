import "server-only";
import { parseStoredProfile, rpc } from "@kitchen-pantry/database";
import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import { cache } from "react";
import { isSupabaseConfigured } from "./supabase/config";
import { createSupabaseServerClient } from "./supabase/server";

export type AppSession =
  | { mode: "preview" }
  | {
      mode: "supabase";
      user: { id: string; email: string | null } | null;
      profile: OnboardingProfile | null;
    };

/** Per-request session + profile lookup (deduplicated with React cache). */
export const getAppSession = cache(async (): Promise<AppSession> => {
  if (!isSupabaseConfigured) return { mode: "preview" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mode: "supabase", user: null, profile: null };

  const { data, error } = await supabase.rpc(rpc.getOnboardingProfile);
  if (error) {
    console.error("[session] get_onboarding_profile failed", { code: error.code, message: error.message });
  }
  return {
    mode: "supabase",
    user: { id: user.id, email: user.email ?? null },
    profile: error ? null : parseStoredProfile(data),
  };
});
