import { buildCostTable, type CostTable } from "./eligibility";
import { arrivals, miles, storeOpenNote, straightLineMiles, timeCostCents, tripTravel } from "./travel";
import type { ItemCost, LatLng, ShoppingSettings, ShoppingStore, StoreBasket, TravelMatrix, TripPlan, TripStop } from "./types";

/**
 * Multi-store basket optimisation (spec 03 §1, Mode B and C). Grocery
 * lists are short and trips have at most four stops, so every combination
 * of the candidate stores is tried — no heuristics that could miss the
 * cheapest answer.
 *
 * Fair comparison: a trip that leaves an item out isn't "cheaper" just
 * because it buys less. Trips are ranked first by how many list items they
 * cover, then by cost — so the answer is "the cheapest way to buy
 * everything you can", within the stop, time and distance limits. Savings
 * between two trips are only ever counted on items both of them price.
 */

export const MAX_CANDIDATE_STORES = 8;
export const DEFAULT_MAX_PRICE_AGE_HOURS = 24;

export interface OptimizeInput {
  itemIds: readonly string[];
  baskets: readonly StoreBasket[];
  settings: ShoppingSettings;
  travel: TravelMatrix | null;
  start: LatLng | null;
  now?: Date;
  /** When the trip starts, for store-hours checks (defaults to now). */
  departAt?: Date;
  maxPriceAgeHours?: number;
}

export interface Candidates {
  table: CostTable;
  stores: ShoppingStore[];
  /** Stores left out and why (excluded, outside the radius, no prices). */
  skipped: Array<{ store: ShoppingStore; reason: string }>;
}

/** Which stores take part: not excluded, inside the radius when it can be checked, with prices. */
export function candidateStores(input: OptimizeInput): Candidates {
  const now = input.now ?? new Date();
  const { settings } = input;
  const skipped: Candidates["skipped"] = [];
  const usable: StoreBasket[] = [];
  const sampleMode = input.baskets.some((b) => b.store.isSample);
  for (const b of input.baskets) {
    if (b.store.isSample !== sampleMode) skipped.push({ store: b.store, reason: "Sample and real stores aren't compared together" });
    else if (settings.excludedStores.includes(b.store.key)) skipped.push({ store: b.store, reason: "You excluded this store" });
    else if (!b.basket) skipped.push({ store: b.store, reason: b.error ?? "Prices couldn't be loaded" });
    else if (input.start && b.store.location && straightLineMiles(input.start, b.store.location) > settings.radiusMiles)
      skipped.push({ store: b.store, reason: `More than ${settings.radiusMiles} miles away` });
    else usable.push(b);
  }
  // Keep the search small: the stores that price the most items, preferred ones first.
  usable.sort(
    (a, b) =>
      Number(settings.preferredStores.includes(b.store.key)) - Number(settings.preferredStores.includes(a.store.key)) ||
      b.basket!.pricedCount - a.basket!.pricedCount,
  );
  for (const b of usable.slice(MAX_CANDIDATE_STORES)) skipped.push({ store: b.store, reason: `Only ${MAX_CANDIDATE_STORES} stores are compared at once` });
  const kept = usable.slice(0, MAX_CANDIDATE_STORES);
  const table = buildCostTable(kept, input.itemIds, settings, now, input.maxPriceAgeHours ?? DEFAULT_MAX_PRICE_AGE_HOURS);
  return { table, stores: table.stores, skipped };
}

function subsets<T>(items: readonly T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length) out.push(acc.slice());
    if (acc.length === maxSize) return;
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

export interface RankedPlan {
  plan: TripPlan;
  /** grocery + fuel (when known); compared only between trips covering the same number of items. */
  cashScore: number;
  /** cashScore + time × value of time; null when travel isn't known. */
  valueScore: number | null;
}

/** Build the trip for one set of stores. Null when a store in the set would get nothing to buy. */
export function planTrip(keys: readonly string[], c: Candidates, input: OptimizeInput): RankedPlan | null {
  const { settings } = input;
  const preferred = new Set(settings.preferredStores);
  const byStore = new Map<string, ItemCost[]>(keys.map((k) => [k, []]));
  const missing: string[] = [];
  for (const id of input.itemIds) {
    let best: ItemCost | null = null;
    for (const k of keys) {
      const cost = c.table.costs.get(k)?.get(id);
      if (!cost) continue;
      if (!best || cost.cents < best.cents || (cost.cents === best.cents && preferred.has(k) && !preferred.has(best.storeKey))) best = cost;
    }
    if (best) byStore.get(best.storeKey)!.push(best);
    else missing.push(id);
  }
  if (keys.length > 1 && [...byStore.values()].some((items) => items.length === 0)) return null;

  let order = [...keys];
  let travel: TripPlan["travel"] = null;
  const warnings: string[] = [];
  if (input.travel && input.start) {
    const t = tripTravel(keys, input.travel, settings);
    if (t) {
      order = t.order;
      travel = t.travel;
    } else warnings.push("No drive route was found for this trip");
  }

  const storeOf = new Map(c.stores.map((s) => [s.key, s]));
  const times = travel ? arrivals(travel, input.departAt ?? input.now ?? new Date(), settings.minutesPerStop) : [];
  const stops: TripStop[] = order.map((k, i) => {
    const items = byStore.get(k)!;
    const store = storeOf.get(k)!;
    const at = times[i];
    const hours = at ? storeOpenNote(store, at, settings.minutesPerStop) : { open: null, note: null };
    if (hours.note) warnings.push(hours.note);
    return {
      storeKey: k,
      itemIds: items.map((x) => x.itemId),
      subtotalCents: items.reduce((s, x) => s + x.cents, 0),
      openAtArrival: hours.open,
      arrivalNote: hours.note,
    };
  });
  const all = [...byStore.values()].flat();
  const groceryCents = all.reduce((s, x) => s + x.cents, 0);
  const fuel = travel?.fuelCents ?? null;
  const plan: TripPlan = {
    storeKeys: order,
    stops,
    groceryCents,
    pricedCount: all.length,
    itemCount: input.itemIds.length,
    missingIds: missing,
    saleSavingsCents: 0,
    saleNotCountedCents: all.reduce((s, x) => s + x.saleNotCountedCents, 0),
    preferredCount: keys.filter((k) => preferred.has(k)).length,
    travel,
    cashCents: travel ? (fuel === null ? null : groceryCents + fuel) : null,
    valueCents: null,
    warnings,
  };
  // Sale savings counted: regular − sale for items where an eligible sale was used.
  plan.saleSavingsCents = savingsFromBaskets(all, input.baskets);
  const cashScore = groceryCents + (fuel ?? 0);
  const valueScore = travel ? cashScore + timeCostCents(travel.totalMinutes, settings.valueOfTimeCentsPerHour) : null;
  if (travel && fuel !== null) plan.valueCents = groceryCents + fuel + timeCostCents(travel.totalMinutes, settings.valueOfTimeCentsPerHour);
  return { plan, cashScore, valueScore };
}

function savingsFromBaskets(costs: readonly ItemCost[], baskets: readonly StoreBasket[]): number {
  let total = 0;
  for (const c of costs) {
    if (!c.onSale) continue;
    const line = baskets.find((b) => b.store.key === c.storeKey)?.basket?.lines.find((l) => l.id === c.itemId);
    if (!line || line.regularCents === null || line.saleCents === null || line.saleCents <= 0) continue;
    total += Math.round(c.cents * (line.regularCents / line.saleCents)) - c.cents;
  }
  return Math.max(0, total);
}

const byCash = (a: RankedPlan, b: RankedPlan) =>
  a.plan.missingIds.length - b.plan.missingIds.length ||
  a.cashScore - b.cashScore || a.plan.storeKeys.length - b.plan.storeKeys.length || b.plan.preferredCount - a.plan.preferredCount || a.plan.storeKeys.join().localeCompare(b.plan.storeKeys.join());

/** Every single-store trip, cheapest first (fuel included when known). */
export function singleStorePlans(c: Candidates, input: OptimizeInput): RankedPlan[] {
  return c.stores
    .map((s) => planTrip([s.key], c, input))
    .filter((p): p is RankedPlan => p !== null)
    .sort(byCash);
}

export interface MultiStoreOptions {
  /** The one-store trip the limits are measured against. */
  baseline: RankedPlan | null;
}

export interface MultiStoreResult {
  bestDeals: RankedPlan | null;
  bestValue: RankedPlan | null;
  /** Limits that couldn't be checked (no drive times). */
  unchecked: string[];
  considered: number;
}

/**
 * Best Deals: the cheapest trip of up to `maxStops` stores (groceries plus
 * fuel when fuel is known). Best Overall Value: the lowest groceries + fuel
 * + time at the shopper's value of time; only when drive times are known.
 * Both respect the time and distance limits when drive times are known.
 */
export function optimizeMultiStore(c: Candidates, input: OptimizeInput, opts: MultiStoreOptions): MultiStoreResult {
  const { settings } = input;
  const unchecked: string[] = [];
  const plans = subsets(
    c.stores.map((s) => s.key),
    Math.max(1, Math.min(4, settings.maxStops)),
  )
    .map((keys) => planTrip(keys, c, input))
    .filter((p): p is RankedPlan => p !== null);

  const base = opts.baseline?.plan.travel ?? null;
  const within = plans.filter((p) => {
    const t = p.plan.travel;
    if (!t) return true;
    if (settings.maxDriveMiles !== null && miles(t.meters) > settings.maxDriveMiles + 1e-9 && p.plan.storeKeys.length > 1) return false;
    if (settings.maxExtraMinutes !== null && base && t.totalMinutes - base.totalMinutes > settings.maxExtraMinutes && p.plan.storeKeys.length > 1) return false;
    return true;
  });
  if (!input.travel && (settings.maxExtraMinutes !== null || settings.maxDriveMiles !== null)) unchecked.push("Your time and distance limits couldn't be checked without drive times.");

  const bestDeals = [...within].sort(byCash)[0] ?? null;
  const withValue = within.filter((p) => p.valueScore !== null);
  // Value: lower is better; when two trips are within $1 of each other, prefer fewer stops, then preferred stores.
  let bestValue: RankedPlan | null = null;
  if (withValue.length && withValue.length === within.length) {
    const fewestMissing = Math.min(...withValue.map((p) => p.plan.missingIds.length));
    const covering = withValue.filter((p) => p.plan.missingIds.length === fewestMissing);
    const min = Math.min(...covering.map((p) => p.valueScore!));
    bestValue = covering
      .filter((p) => p.valueScore! - min <= 100)
      .sort((a, b) => a.plan.storeKeys.length - b.plan.storeKeys.length || b.plan.preferredCount - a.plan.preferredCount || a.valueScore! - b.valueScore! || byCash(a, b))[0]!;
  }
  return { bestDeals, bestValue, unchecked, considered: plans.length };
}
