"use client";

import { ArrowRight, PiggyBank } from "lucide-react";
import Link from "next/link";
import { formatMoney, plural } from "@/lib/format";
import { useSavings } from "@/lib/savings/use-savings";

/** Home: this week's savings in one line, linking to the dashboard. Only real numbers. */
export function SavingsSnapshot() {
  const s = useSavings();
  if (!s.summary) return null;
  const week = s.summary.byWeek[s.summary.byWeek.length - 1]!;
  const parts = [
    s.summary.carts.verifiedCents > 0 ? `${formatMoney(s.summary.carts.verifiedCents)} verified sale savings` : null,
    s.summary.pantry.rescuedCount > 0 ? `${plural(s.summary.pantry.rescuedCount, "item")} used before going off` : null,
    week.shops > 0 ? `${formatMoney(week.spentCents)} spent${s.budget !== null ? ` of ${formatMoney(s.budget)}` : ""}` : null,
  ].filter(Boolean);
  return (
    <Link href="/savings" className="mt-4 flex items-center gap-4 rounded-card bg-surface p-5 transition-colors hover:bg-surface-strong">
      <PiggyBank className="size-7 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">Savings this week</span>
        <span className="block text-[15px] text-muted">{parts.length > 0 ? parts.join(" · ") : "Log a shop or use up what's in your kitchen to see it here."}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
