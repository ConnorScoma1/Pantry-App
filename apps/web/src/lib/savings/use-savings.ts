"use client";

import { createLocalSavingsRepository, type SavingsData, type SavingsRepository } from "@kitchen-pantry/database";
import { cartEstimate } from "@kitchen-pantry/grocery-pricing";
import {
  cartSavings,
  pantrySummary,
  recentWeeks,
  spendingByWeek,
  spendingTrend,
  unloggedOrders,
  weeklyBudgetCents,
  weekPeriod,
  type Period,
} from "@kitchen-pantry/meal-planner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addSpendingAction, removeSpendingAction, savingsOverviewAction, updateSpendingAction } from "@/app/(app)/savings/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";

const supabaseRepo: SavingsRepository = {
  overview: (since) => savingsOverviewAction(since),
  addSpending: (i) => addSpendingAction(i),
  updateSpending: (id, i) => updateSpendingAction(id, i),
  removeSpending: (id) => removeSpendingAction(id),
};
let preview: SavingsRepository | null = null;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type SavingsRange = "week" | "eight_weeks";

/**
 * Smart Savings: this week and the last eight weeks, worked out on this
 * device from the household's own records (pantry log, logged shops, carts
 * sent to a store). Nothing here is estimated unless it says so.
 */
export function useSavings() {
  const { mode, profile } = useProfile();
  const repo = mode === "preview" ? (preview ??= createLocalSavingsRepository(browserStorage)) : supabaseRepo;
  const today = localToday();
  const weeks = useMemo(() => recentWeeks(today, 8), [today]);
  const [data, setData] = useState<SavingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<SavingsRange>("week");

  const reload = useCallback(async () => {
    const r = await repo.overview(weeks[0]!);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.message);
  }, [repo, weeks]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const budget = weeklyBudgetCents(profile.budget.amountCents, profile.budget.period);
  const period: Period = range === "week" ? weekPeriod(weeks[weeks.length - 1]!) : { from: weeks[0]!, to: today };

  const summary = useMemo(() => {
    if (!data) return null;
    const byWeek = spendingByWeek(data.spending, weeks, budget);
    return {
      carts: cartSavings(data.carts, period),
      pantry: pantrySummary(data.pantry, period),
      byWeek,
      trend: spendingTrend(byWeek),
      orders: unloggedOrders(data.carts, data.spending).map((c) => ({ cart: c, estimateCents: cartEstimate(c.lines).estimatedCents })),
    };
  }, [data, weeks, budget, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    async <T,>(p: Promise<{ ok: true; data: T } | { ok: false; message: string }>) => {
      const r = await p;
      if (r.ok) await reload();
      return r;
    },
    [reload],
  );

  return {
    mode,
    loading: data === null && error === null,
    error,
    today,
    weeks,
    range,
    setRange,
    budget,
    data,
    summary,
    addSpending: (input: unknown) => act(repo.addSpending(input)),
    updateSpending: (id: string, input: unknown) => act(repo.updateSpending(id, input)),
    removeSpending: (id: string) => act(repo.removeSpending(id)),
  };
}
