import type { IsoDate, PriceStatus } from "@kitchen-pantry/shared-types";

/**
 * Meal-planner core utilities. The optimizer itself (basket-level cost,
 * ingredient reuse, waste reduction) arrives in Phase 3; these primitives
 * are shared by the UI and the planner so "the week" and "the budget" mean
 * the same thing everywhere.
 */

function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIso(value: IsoDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Monday-based week start (ISO weeks). */
export function startOfWeek(date: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate {
  const d = fromIso(date);
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return toIso(d);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = fromIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function weekDates(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Convert any budget period to a weekly figure for planning. */
export function weeklyBudgetCents(
  amountCents: number | null,
  period: "week" | "two_weeks" | "month",
): number | null {
  if (amountCents === null) return null;
  if (period === "week") return amountCents;
  if (period === "two_weeks") return Math.round(amountCents / 2);
  return Math.round((amountCents * 12) / 52);
}

export type BudgetVerdict =
  | "within_budget"
  | "over_budget"
  | "estimate_within_budget"
  | "estimate_over_budget"
  | "incomplete"
  | "no_budget";

export interface BasketLine {
  totalCents: number | null;
  status: PriceStatus;
}

export interface BasketSummary {
  totalCents: number;
  unpricedLines: number;
  verdict: BudgetVerdict;
}

/**
 * Summarise a full shopping basket against the budget. We only say a plan is
 * "within budget" when every line has a store-specific price; otherwise the
 * verdict is explicitly an estimate, or incomplete if lines lack prices.
 */
export function summarizeBasket(lines: BasketLine[], budgetCents: number | null): BasketSummary {
  let totalCents = 0;
  let unpricedLines = 0;
  let allStoreSpecific = true;

  for (const line of lines) {
    if (line.status === "unavailable" || line.totalCents === null) {
      unpricedLines += 1;
      continue;
    }
    totalCents += line.totalCents;
    if (line.status === "estimated") allStoreSpecific = false;
  }

  let verdict: BudgetVerdict;
  if (budgetCents === null) verdict = "no_budget";
  else if (unpricedLines > 0) verdict = "incomplete";
  else if (allStoreSpecific) verdict = totalCents <= budgetCents ? "within_budget" : "over_budget";
  else verdict = totalCents <= budgetCents ? "estimate_within_budget" : "estimate_over_budget";

  return { totalCents, unpricedLines, verdict };
}
