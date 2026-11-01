import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/session";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Set up your kitchen" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const [{ step }, session] = await Promise.all([searchParams, getAppSession()]);

  if (session.mode === "supabase" && !session.user) {
    redirect("/sign-in?next=/onboarding");
  }

  return (
    <OnboardingFlow
      mode={session.mode}
      initialProfile={session.mode === "supabase" ? session.profile : null}
      initialStep={step ?? null}
    />
  );
}
