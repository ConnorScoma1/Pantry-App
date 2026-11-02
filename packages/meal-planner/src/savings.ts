import type { CartDraft } from "@kitchen-pantry/grocery-pricing";
import type { IsoDate, PantryOutcome, SpendingEntry } from "@kitchen-pantry/shared-types";
import { addDays, startOfWeek } from "./week";

/**
 * Smart Savings (spec 02 §7). Every number here comes from something the
 * household did or a price a store reported — nothing is invented:
 *
 *  - Verified sale savings: regular and sale price both reported by a real
 *    store (Kroger) when the cart was built, a fresh "verified" price, sold
 *    per package (not by weight), on a cart sent to the store AND marked
 *    "ordered" by the household. Anything short of that is an estimate.
 *  - Value of food used: what the household typed in as "price paid" for
 *    items they marked "Used it up". It is NOT cash saved — the food was
 *    already bought — so it's shown as value, never as savings.
 *  - Food rescued: items used up on or within 3 days before their use-by
 *    date ("potential waste avoided"). Thrown out / expired items are shown
 *    honestly beside it.
 *  - Spending: only shops the household logged. No logging, no trend.
 */

export interface Period {
  /** Inclusive local dates. */
  from: IsoDate;
  to: IsoDate;
}

/** Local calendar day of a timestamp (in this device's time zone). */
export function localDay(iso: string): IsoDate {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inPeriod = (day: IsoDate, p: Period) => day >= p.from && day <= p.to;

export function daysBetween(a: IsoDate, b: IsoDate): number {
  const t = (s: IsoDate) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** The last `count` Monday-based weeks, oldest first, ending with this week. */
export function recentWeeks(today: IsoDate, count = 8): IsoDate[] {
  const thisWeek = startOfWeek(today);
  return Array.from({ length: count }, (_, i) => addDays(thisWeek, (i - count + 1) * 7));
}

export const weekPeriod = (weekStart: IsoDate): Period => ({ from: weekStart, to: addDays(weekStart, 6) });

// ---------------------------------------------------------------------------
// Sale savings from carts
// ---------------------------------------------------------------------------
export interface CartSavings {
  verifiedCents: number;
  /** Items behind the verified figure. */
  verifiedItems: number;
  estimatedCents: number;
  estimatedItems: number;
  /** Real-store carts sent in the period, and how many were marked ordered. */
  sentCarts: number;
  orderedCarts: number;
  /** Practice carts (Sample Market) are never counted. */
  practiceCarts: number;
}

export function cartSavings(carts: readonly CartDraft[], period: Period, dayOf: (iso: string) => IsoDate = localDay): CartSavings {
  const out: CartSavings = { verifiedCents: 0, verifiedItems: 0, estimatedCents: 0, estimatedItems: 0, sentCarts: 0, orderedCarts: 0, practiceCarts: 0 };
  for (const cart of carts) {
    if (cart.status !== "sent" && cart.status !== "link_ready") continue;
    if (!inPeriod(dayOf(cart.createdAt), period)) continue;
    if (cart.retailer === "mock") {
      out.practiceCarts += 1;
      continue;
    }
    out.sentCarts += 1;
    const ordered = cart.purchase === "ordered";
    if (ordered) out.orderedCarts += 1;
    for (const line of cart.lines) {
      if (!line.include || !line.selected || line.count <= 0) continue;
      const p = line.options.find((o) => o.productId === line.selected);
      if (!p || p.saleCents === null || p.saleCents >= p.regularCents) continue;
      const saved = Math.round((p.regularCents - p.saleCents) * line.count);
      if (ordered && p.priceStatus === "verified" && !p.soldByWeight) {
        out.verifiedCents += saved;
        out.verifiedItems += 1;
      } else {
        out.estimatedCents += saved;
        out.estimatedItems += 1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Food used, rescued and wasted
// ---------------------------------------------------------------------------
export const RESCUE_DAYS = 3;

export interface PantrySummary {
  usedCount: number;
  /** Sum of the prices the household entered for items it used up. */
  usedValueCents: number;
  usedUnpriced: number;
  /** Used up on, or within RESCUE_DAYS before, the use-by date. */
  rescuedCount: number;
  rescuedValueCents: number;
  rescuedNames: string[];
  wastedCount: number;
  /** "Up to": a thrown-out item may have been partly used. */
  wastedValueCents: number;
  wastedUnpriced: number;
  wastedNames: string[];
}

export function pantrySummary(log: readonly PantryOutcome[], period: Period, dayOf: (iso: string) => IsoDate = localDay): PantrySummary {
  const out: PantrySummary = {
    usedCount: 0, usedValueCents: 0, usedUnpriced: 0, rescuedCount: 0, rescuedValueCents: 0, rescuedNames: [],
    wastedCount: 0, wastedValueCents: 0, wastedUnpriced: 0, wastedNames: [],
  };
  const push = (list: string[], name: string) => {
    const n = name.trim().toLowerCase();
    if (n && !list.includes(n) && list.length < 5) list.push(n);
  };
  for (const e of log) {
    const day = dayOf(e.at);
    if (!inPeriod(day, period)) continue;
    const price = e.pricePaidCents !== null && e.pricePaidCents >= 0 ? e.pricePaidCents : null;
    if (e.reason === "consumed") {
      out.usedCount += 1;
      if (price === null) out.usedUnpriced += 1;
      else out.usedValueCents += price;
      if (e.useBy) {
        const left = daysBetween(day, e.useBy);
        if (left >= 0 && left <= RESCUE_DAYS) {
          out.rescuedCount += 1;
          out.rescuedValueCents += price ?? 0;
          push(out.rescuedNames, e.itemName);
        }
      }
    } else {
      out.wastedCount += 1;
      if (price === null) out.wastedUnpriced += 1;
      else out.wastedValueCents += price;
      push(out.wastedNames, e.itemName);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spending (logged shops only)
// ---------------------------------------------------------------------------
export interface SpendingWeek {
  weekStart: IsoDate;
  spentCents: number;
  shops: number;
  /** null when there's no weekly budget, or nothing was logged that week. */
  overBudget: boolean | null;
}

export function spendingByWeek(entries: readonly SpendingEntry[], weeks: readonly IsoDate[], weeklyBudgetCents: number | null): SpendingWeek[] {
  return weeks.map((weekStart) => {
    const p = weekPeriod(weekStart);
    const mine = entries.filter((e) => inPeriod(e.spentOn, p));
    const spent = mine.reduce((sum, e) => sum + e.amountCents, 0);
    return {
      weekStart,
      spentCents: spent,
      shops: mine.length,
      overBudget: weeklyBudgetCents === null || mine.length === 0 ? null : spent > weeklyBudgetCents,
    };
  });
}

export interface SpendingTrend {
  /** Average of weeks that have at least one logged shop. */
  averageCents: number | null;
  loggedWeeks: number;
  /** Change from the first half of the logged weeks to the second, when there are at least 4. */
  direction: "up" | "down" | "steady" | null;
}

export function spendingTrend(weeks: readonly SpendingWeek[]): SpendingTrend {
  const logged = weeks.filter((w) => w.shops > 0);
  if (logged.length === 0) return { averageCents: null, loggedWeeks: 0, direction: null };
  const avg = (ws: readonly SpendingWeek[]) => ws.reduce((s, w) => s + w.spentCents, 0) / ws.length;
  const averageCents = Math.round(avg(logged));
  if (logged.length < 4) return { averageCents, loggedWeeks: logged.length, direction: null };
  const half = Math.floor(logged.length / 2);
  const before = avg(logged.slice(0, half));
  const after = avg(logged.slice(logged.length - half));
  const change = (after - before) / Math.max(before, 1);
  return { averageCents, loggedWeeks: logged.length, direction: change > 0.05 ? "up" : change < -0.05 ? "down" : "steady" };
}

/** Ordered carts that haven't been logged as a shop yet (to offer "log this shop"). */
export function unloggedOrders(carts: readonly CartDraft[], entries: readonly SpendingEntry[]): CartDraft[] {
  const logged = new Set(entries.map((e) => e.cartDraftId).filter(Boolean));
  return carts.filter((c) => c.retailer !== "mock" && c.purchase === "ordered" && (c.status === "sent" || c.status === "link_ready") && !logged.has(c.id));
}
