"use client";

import type { InviteDetails } from "@kitchen-pantry/database";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/app/(app)/household/actions";
import { Button, ButtonLink } from "@/components/ui/button";

const PROBLEMS: Record<Exclude<InviteDetails["status"], "valid" | "already_member">, { title: string; body: string }> = {
  invalid: { title: "This invite link doesn't work", body: "Check you copied the whole link, or ask for a new one." },
  expired: { title: "This invite has expired", body: "Invites last up to 14 days. Ask the household owner for a new link." },
  used: { title: "This invite has already been used", body: "Each link works once. Ask the household owner for a new one." },
  revoked: { title: "This invite was cancelled", body: "Ask the household owner for a new link." },
  wrong_account: { title: "This invite is for a different email", body: "Sign in with the email address the invite was sent to." },
  full: { title: "This household is full", body: "A household can have up to 6 people. Ask the owner to make room." },
};

export function InviteAccept({
  token,
  details,
  email,
  hasProfile,
}: {
  token: string;
  details: InviteDetails;
  email: string | null;
  hasProfile: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    start(async () => {
      const r = await acceptInviteAction(token);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      router.replace(hasProfile ? "/grocery" : "/onboarding");
      router.refresh();
    });
  }

  if (details.status !== "valid" && details.status !== "already_member") {
    const p = PROBLEMS[details.status];
    return (
      <>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">{p.title}</h1>
        <p className="mt-2 text-[17px] text-muted">{p.body}</p>
        {details.status === "wrong_account" && email ? <p className="mt-2 text-[15px] text-muted">You&apos;re signed in as {email}.</p> : null}
        <ButtonLink href="/" size="lg" variant="secondary" className="mt-6">
          Go to Kitchen Pantry
        </ButtonLink>
      </>
    );
  }

  const name = details.householdName ?? "a household";
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight tracking-tight">
        {details.status === "already_member" ? `You're already in ${name}` : `Join ${name}?`}
      </h1>
      {details.status === "valid" ? (
        <>
          <p className="mt-2 text-[17px] text-muted">
            {details.invitedBy ? `${details.invitedBy} invited you` : "You've been invited"} to share the kitchen inventory, weekly meal
            plans and grocery list.
          </p>
          <ul className="mt-5 space-y-2 rounded-card bg-surface p-5 text-[16px]">
            <li>Your cooking skill, goals, allergies and diet stay yours.</li>
            <li>Meal plans will avoid your allergies for everyone.</li>
            <li>You keep any household you&apos;re already in, and can switch or leave any time.</li>
          </ul>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-[15px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        <Button size="lg" onClick={accept} disabled={pending || !token}>
          {pending ? "Joining…" : details.status === "already_member" ? `Open ${name}` : "Join household"}
        </Button>
        <ButtonLink href="/" size="lg" variant="ghost">
          Not now
        </ButtonLink>
      </div>
      {email ? <p className="mt-4 text-center text-[14px] text-muted">Signed in as {email}</p> : null}
    </>
  );
}
