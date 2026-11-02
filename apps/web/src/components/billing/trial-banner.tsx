"use client";

import { trialDaysLeft } from "@kitchen-pantry/database";
import Link from "next/link";
import { useProfile } from "@/components/profile/profile-provider";
import { yearlyPrice } from "@/lib/billing/price";

/** Home: a quiet heads-up in the last 3 days of the free trial (only once billing is on). */
export function TrialBanner() {
  const { mode, access } = useProfile();
  if (mode !== "supabase" || !access.enforced || access.reason !== "trial") return null;
  const left = trialDaysLeft(access);
  if (left > 3) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-accent-soft px-5 py-4">
      <p className="text-[15px]">
        <strong>{left <= 1 ? "Your free trial ends today." : `Your free trial ends in ${left} days.`}</strong> Keep everything going for {yearlyPrice} a year.
      </p>
      <Link href="/profile#subscription" className="rounded-full bg-foreground px-4 py-2 text-[15px] font-semibold text-background">
        Subscribe
      </Link>
    </div>
  );
}
