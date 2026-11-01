import { joinDraftProfile, rpc } from "@kitchen-pantry/database";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Set up your kitchen" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const [{ step }, session] = await Promise.all([searchParams, getAppSession()]);

  if (session.mode === "supabase" && !session.user) {
    redirect("/sign-in?next=/onboarding");
  }

  // Joined someone's household before setting up: start from their answers.
  let joining: { profile: NonNullable<ReturnType<typeof joinDraftProfile>>["profile"]; memberCount: number } | null = null;
  if (session.mode === "supabase" && session.user && !session.profile) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(rpc.getHouseholdOnboardingDraft);
    if (!error) joining = joinDraftProfile(data, defaultOnboardingProfile());
  }

  return (
    <OnboardingFlow
      mode={session.mode}
      initialProfile={session.mode === "supabase" ? session.profile : null}
      joinDraft={joining?.profile ?? null}
      initialStep={step ?? (joining ? "diet" : null)}
    />
  );
}
