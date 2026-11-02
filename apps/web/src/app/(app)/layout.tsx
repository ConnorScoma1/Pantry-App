import { redirect } from "next/navigation";
import { ProfileProvider } from "@/components/profile/profile-provider";
import { AppShell } from "@/components/shell/app-shell";
import { getAppSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession();

  if (session.mode === "supabase") {
    if (!session.user) redirect("/sign-in");
    if (!session.profile) redirect("/onboarding");
  }

  return (
    <ProfileProvider
      mode={session.mode}
      email={session.mode === "supabase" ? (session.user?.email ?? null) : null}
      initialProfile={session.mode === "supabase" ? session.profile : null}
      access={session.mode === "supabase" ? session.access : undefined}
    >
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
