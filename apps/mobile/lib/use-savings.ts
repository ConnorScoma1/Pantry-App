import type { SavingsData } from "@kitchen-pantry/database";
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
import { useApp, useProfile } from "./app-state";
import { todayIso } from "./use-kitchen";

export type SavingsRange = "week" | "eight_weeks";

/** Smart Savings on the phone — same numbers and rules as the web. */
export function useSavings() {
  const { savings: repo, mode } = useApp();
  const profile = useProfile();
  const today = todayIso();
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
    mode, error, today, weeks, range, setRange, budget, data, summary, reload,
    addSpending: (input: unknown) => act(repo.addSpending(input)),
    updateSpending: (id: string, input: unknown) => act(repo.updateSpending(id, input)),
    removeSpending: (id: string) => act(repo.removeSpending(id)),
  };
}
