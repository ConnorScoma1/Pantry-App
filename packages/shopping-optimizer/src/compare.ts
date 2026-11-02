import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { membershipLabel } from "./eligibility";
import { candidateStores, optimizeMultiStore, singleStorePlans, type OptimizeInput, type RankedPlan } from "./optimize";
import { miles } from "./travel";
import type { ComparisonResult, Confidence, StrategyComparison, TripPlan } from "./types";

/**
 * One Store vs. Best Deals vs. Best Overall Value (spec 03 §1–2).
 *
 * The recommendation sentence is written here, from the numbers — the AI
 * advisor may rephrase it but never supplies a figure. When prices are
 * missing the result is "partial" or "insufficient" and the wording never
 * claims a definitive cheapest store.
 */

export interface CompareInput extends OptimizeInput {
  /** The one-store trip to compare against (e.g. their usual store); defaults to the cheapest single store. */
  baselineStoreKey?: string | null;
  format?: (cents: number) => string;
}

/** Savings of `other` over `base`, counted only on items both price. */
export function compareTrips(base: TripPlan, other: TripPlan, costOf: (plan: TripPlan, itemId: string) => number | null): StrategyComparison {
  const baseIds = new Set(base.stops.flatMap((s) => s.itemIds));
  const common = other.stops.flatMap((s) => s.itemIds).filter((id) => baseIds.has(id));
  let savings = 0;
  for (const id of common) savings += (costOf(base, id) ?? 0) - (costOf(other, id) ?? 0);
  const bt = base.travel;
  const ot = other.travel;
  const extraFuel = bt && ot && bt.fuelCents !== null && ot.fuelCents !== null ? ot.fuelCents - bt.fuelCents : null;
  return {
    comparableCount: common.length,
    grocerySavingsCents: savings,
    extraFuelCents: extraFuel,
    netSavingsCents: extraFuel === null ? null : savings - extraFuel,
    extraMiles: bt && ot ? Math.round(miles(ot.meters - bt.meters) * 10) / 10 : null,
    extraMinutes: bt && ot ? ot.totalMinutes - bt.totalMinutes : null,
    extraStops: other.storeKeys.length - base.storeKeys.length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const numberWord = (n: number) => ["zero", "one", "two", "three", "four"][n] ?? String(n);

export function compareStrategies(input: CompareInput): ComparisonResult {
  const now = input.now ?? new Date();
  const money = input.format ?? ((c: number) => formatCents(c));
  const c = candidateStores(input);
  const singles = singleStorePlans(c, input);
  const baseline = (input.baselineStoreKey && singles.find((p) => p.plan.storeKeys[0] === input.baselineStoreKey)) || singles[0] || null;
  const multi = optimizeMultiStore(c, input, { baseline });
  const costOf = (plan: TripPlan, id: string) => {
    const stop = plan.stops.find((s) => s.itemIds.includes(id));
    return stop ? (c.table.costs.get(stop.storeKey)?.get(id)?.cents ?? null) : null;
  };
  const itemCount = input.itemIds.length;
  const isSample = c.stores.some((s) => s.isSample);
  const travelAvailable = Boolean(input.travel && input.start);
  const storeName = (k: string) => c.stores.find((s) => s.key === k)?.name ?? k;

  // ---- limitations: everything that makes this less than a complete answer
  const limitations: string[] = [];
  if (isSample) limitations.push("Practice comparison: stores, prices and drive times are made-up samples, not real.");
  for (const s of c.skipped) if (!/excluded/.test(s.reason)) limitations.push(`${s.store.name}: ${s.reason}.`);
  const pricedAnywhere = new Set<string>();
  for (const row of c.table.costs.values()) for (const id of row.keys()) pricedAnywhere.add(id);
  const nowhere = input.itemIds.filter((id) => !pricedAnywhere.has(id)).length;
  if (nowhere) limitations.push(`${plural(nowhere, "item")} on your list ${nowhere === 1 ? "has" : "have"} no usable price at any store compared.`);
  if (!travelAvailable) limitations.push(input.start ? "Drive times aren't available, so fuel and travel time aren't included." : "Add a starting point to include drive time and fuel.");
  else if (input.settings.fuelCentsPerGallon === null) limitations.push("Add what you pay for fuel to include fuel cost.");
  limitations.push(...multi.unchecked);
  const assumed = new Set<string>();
  for (const row of c.table.costs.values()) for (const x of row.values()) if (x.assumedOnePackage) assumed.add(x.itemId);
  if (assumed.size) limitations.push(`${plural(assumed.size, "item")} ${assumed.size === 1 ? "is" : "are"} priced as one package because the amount couldn't be compared.`);
  const notCounted = c.stores.filter((s) => [...(c.table.costs.get(s.key)?.values() ?? [])].some((x) => x.saleNeedsMembership));
  for (const label of new Set(notCounted.map(membershipLabel))) limitations.push(`Some sale prices may need a ${label}, so regular prices are used. Add the card in settings if you have one.`);
  if (input.settings.digitalCoupons) limitations.push("Digital coupons aren't included yet — no coupon source is connected.");

  const oneStore = baseline?.plan ?? null;
  const bestDeals = multi.bestDeals?.plan ?? null;
  const bestValue = multi.bestValue?.plan ?? null;
  if ([oneStore, bestDeals, bestValue].some((p) => p?.stops.some((s) => s.openAtArrival === false)))
    limitations.push("Some stores look closed at the time you'd arrive — check their hours, or compare again when you're ready to go.");
  const dealsVsOne = oneStore && bestDeals ? compareTrips(oneStore, bestDeals, costOf) : null;
  const valueVsOne = oneStore && bestValue ? compareTrips(oneStore, bestValue, costOf) : null;

  // ---- confidence
  let confidence: Confidence = "complete";
  const coverage = bestDeals ? bestDeals.pricedCount / Math.max(1, itemCount) : 0;
  if (c.stores.length < 2 || !bestDeals || coverage < 0.5) confidence = "insufficient";
  else if (
    (bestDeals.missingIds.length > 0 || (oneStore?.missingIds.length ?? 0) > 0 || c.skipped.some((s) => !/excluded/.test(s.reason)) || assumed.size > 0 || !travelAvailable || isSample)
  )
    confidence = "partial";

  // ---- the recommendation, from the numbers
  const recommendation = recommend();
  function recommend(): ComparisonResult["recommendation"] {
    if (c.stores.length === 0) return { strategy: null, text: "No store could price your list, so there's nothing to compare yet." };
    if (c.stores.length === 1) return { strategy: "one_store", text: `Only ${storeName(c.stores[0]!.key)} has prices for your list right now. Add another store to compare.` };
    if (!oneStore || !bestDeals) return { strategy: null, text: "Not enough prices to compare stores yet." };
    if (confidence === "insufficient") return { strategy: null, text: `Only ${bestDeals.pricedCount} of ${itemCount} items have prices, which isn't enough to say which store is cheapest.` };
    const priced = Math.min(bestDeals.pricedCount, oneStore.pricedCount);
    const caveat = confidence === "partial" && priced < itemCount ? ` Based on the items with prices (${priced} of ${itemCount} at the least) — not a definitive answer.` : "";
    const d = dealsVsOne!;
    const differs = bestDeals.storeKeys.join() !== oneStore.storeKeys.join();
    const more = bestDeals.pricedCount - oneStore.pricedCount;
    // A trip can win by covering more of the list while costing more on the items both price: say exactly that.
    if (differs && d.grocerySavingsCents <= 0 && more > 0) {
      const who = bestDeals.storeKeys.length === 1 ? storeName(bestDeals.storeKeys[0]!) : `Shopping at ${numberWord(bestDeals.storeKeys.length)} stores`;
      return {
        strategy: "best_deals",
        text: `${who} covers ${plural(more, "more item")} than ${storeName(oneStore.storeKeys[0]!)}${d.grocerySavingsCents < 0 ? `, but costs ${money(-d.grocerySavingsCents)} more on the ${plural(d.comparableCount, "item")} both price` : ""}.${caveat}`,
      };
    }
    if (bestDeals.storeKeys.length === 1) {
      const same = bestDeals.storeKeys[0] === oneStore.storeKeys[0];
      return same
        ? { strategy: "one_store", text: `${storeName(oneStore.storeKeys[0]!)} is the cheapest option for your list — splitting it across stores doesn't save money.${caveat}` }
        : { strategy: "best_deals", text: `${storeName(bestDeals.storeKeys[0]!)} is ${money(Math.max(0, d.grocerySavingsCents))} cheaper than ${storeName(oneStore.storeKeys[0]!)} for the same ${plural(d.comparableCount, "item")}.${caveat}` };
    }
    const n = numberWord(bestDeals.storeKeys.length);
    if (d.netSavingsCents !== null && d.extraMinutes !== null) {
      if (d.netSavingsCents <= 0)
        return { strategy: "one_store", text: `Shopping at ${n} stores saves ${money(Math.max(0, d.grocerySavingsCents))} on groceries, but extra fuel costs ${money(d.extraFuelCents ?? 0)}, so one store is the better choice.${caveat}` };
      const pick = bestValue && bestValue.storeKeys.length === 1 ? "one_store" : bestValue ? (bestValue.storeKeys.join() === bestDeals.storeKeys.join() ? "best_deals" : "best_value") : "best_deals";
      return {
        strategy: pick,
        text: `Shopping at ${n} stores could save ${money(d.netSavingsCents)} after estimated additional fuel costs, but would take about ${plural(Math.max(0, d.extraMinutes), "extra minute")}.${pick === "one_store" ? ` At your value of time (${money(input.settings.valueOfTimeCentsPerHour)}/hour), one store is the better overall value.` : ""}${caveat}`,
      };
    }
    if (d.extraMinutes !== null)
      return { strategy: "best_deals", text: `Shopping at ${n} stores saves ${money(Math.max(0, d.grocerySavingsCents))} on groceries and takes about ${plural(Math.max(0, d.extraMinutes), "extra minute")}. Add your fuel price to see the savings after fuel.${caveat}` };
    return { strategy: "best_deals", text: `Splitting your list across ${n} stores saves ${money(Math.max(0, d.grocerySavingsCents))} on groceries. Drive time and fuel aren't included.${caveat}` };
  }

  const dates = c.stores.flatMap((s) => {
    const b = input.baskets.find((x) => x.store.key === s.key)?.basket;
    return b?.oldestObservedAt ? [b.oldestObservedAt] : [];
  });
  return {
    stores: c.stores,
    singles: singles.map((p: RankedPlan) => p.plan),
    oneStore,
    bestDeals,
    bestValue,
    dealsVsOne,
    valueVsOne,
    confidence,
    limitations: [...new Set(limitations)],
    recommendation,
    travelAvailable,
    isSample,
    itemCount,
    oldestPriceAt: dates.sort()[0] ?? null,
    generatedAt: now.toISOString(),
  };
}
