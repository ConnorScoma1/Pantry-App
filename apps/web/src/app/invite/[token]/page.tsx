import { createSupabaseHouseholdRepository, parseInviteToken, type InviteDetails } from "@kitchen-pantry/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/shell/brand";
import { ButtonLink } from "@/components/ui/button";
import { getAppSession } from "@/lib/session";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteAccept } from "./invite-accept";

export const metadata: Metadata = { title: "Household invite", robots: { index: false } };

/**
 * Opening an invite link. Signed-out visitors are sent to sign in first (the
 * proxy does this), so nothing about the household is shown and nothing is
 * granted without an account. The database checks expiry, single use,
 * email match and the seat limit.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token: raw }, session] = await Promise.all([params, getAppSession()]);
  const token = parseInviteToken(raw);

  let details: InviteDetails = { householdName: null, invitedBy: null, expiresAt: null, status: "invalid" };
  if (session.mode === "supabase") {
    if (!session.user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${raw}`)}`);
    if (token) {
      const supabase = await createSupabaseServerClient();
      const r = await createSupabaseHouseholdRepository(asSupabaseLike(supabase)).inviteDetails(token);
      if (r.ok) details = r.data;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 py-8 sm:px-10">
      <BrandLockup />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 animate-enter">
        {session.mode === "preview" ? (
          <>
            <h1 className="text-[32px] font-bold leading-tight tracking-tight">Invites need accounts</h1>
            <p className="mt-2 text-[17px] text-muted">This copy of Kitchen Pantry runs in preview mode, without accounts, so it can&apos;t join households.</p>
            <ButtonLink href="/" size="lg" className="mt-6">
              Go home
            </ButtonLink>
          </>
        ) : (
          <InviteAccept token={token ?? ""} details={details} email={session.user?.email ?? null} hasProfile={Boolean(session.profile)} />
        )}
      </main>
    </div>
  );
}
