import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { miles } from "./travel";
import type { ComparisonResponse } from "./schema";
import type { ShoppingSettings, TripPlan } from "./types";

/**
 * The facts the AI shopping advisor may talk about (spec 03 §5). Built here
 * from the server's own comparison: every number the advisor is allowed to
 * say is in this object, already formatted, and anything else it writes is
 * rejected by `numbersAllowed`. Store and item names are the household's or
 * the retailer's text, so they're stripped of markup and shortened.
 */

export interface AdviceTrip {
  storeCount: number;
  stores: Array<{ name: string; subtotal: string; items: string[] }>;
  grocery: string;
  itemsPriced: number;
  itemsMissing: number;
  driveMinutes: number | null;
  totalMinutes: number | null;
  miles: number | null;
  fuel: string | null;
}

export interface AdviceFacts {
  practice: boolean;
  confidence: ComparisonResponse["confidence"];
  itemCount: number;
  valueOfTimePerHour: string;
  minutesPerStop: number;
  oneStore: AdviceTrip | null;
  bestDeals: AdviceTrip | null;
  bestValue: AdviceTrip | null;
  dealsVsOne: { grocerySavings: string; extraFuel: string | null; netSavings: string | null; extraMinutes: number | null; extraMiles: number | null; itemsCompared: number; extraStops: number } | null;
  preferredStores: string[];
  saleNotCounted: string | null;
  recommendation: string;
  limitations: string[];
}

const clean = (s: string, max = 60) => s.normalize("NFKC").replace(/[<>{}[\]`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
/** Household-written text (item names) loses its digits, so it can't smuggle a number into the advice. */
const cleanItem = (s: string) => clean(s, 40).replace(/\p{Nd}+/gu, "").replace(/\s+/g, " ").trim() || "item";
const money = (c: number) => formatCents(Math.round(c));

function trip(plan: TripPlan | null, r: ComparisonResponse, names: ReadonlyMap<string, string>): AdviceTrip | null {
  if (!plan) return null;
  const storeName = (k: string) => clean(r.stores.find((s) => s.key === k)?.name ?? "a store");
  return {
    storeCount: plan.stops.length,
    stores: plan.stops.map((s) => ({ name: storeName(s.storeKey), subtotal: money(s.subtotalCents), items: s.itemIds.slice(0, 6).map((id) => cleanItem(names.get(id) ?? "item")) })),
    grocery: money(plan.groceryCents),
    itemsPriced: plan.pricedCount,
    itemsMissing: plan.missingIds.length,
    driveMinutes: plan.travel ? Math.round(plan.travel.driveSeconds / 60) : null,
    totalMinutes: plan.travel ? plan.travel.totalMinutes : null,
    miles: plan.travel ? Math.round(miles(plan.travel.meters) * 10) / 10 : null,
    fuel: plan.travel?.fuelCents != null ? money(plan.travel.fuelCents) : null,
  };
}

export function buildAdviceFacts(r: ComparisonResponse, itemNames: ReadonlyMap<string, string>, settings: Pick<ShoppingSettings, "valueOfTimeCentsPerHour" | "minutesPerStop" | "preferredStores">): AdviceFacts {
  const d = r.dealsVsOne;
  const notCounted = r.bestDeals?.saleNotCountedCents ?? 0;
  return {
    practice: r.isSample,
    confidence: r.confidence,
    itemCount: r.itemCount,
    valueOfTimePerHour: money(settings.valueOfTimeCentsPerHour),
    minutesPerStop: settings.minutesPerStop,
    oneStore: trip(r.oneStore, r, itemNames),
    bestDeals: trip(r.bestDeals, r, itemNames),
    bestValue: trip(r.bestValue, r, itemNames),
    dealsVsOne: d
      ? {
          grocerySavings: money(d.grocerySavingsCents),
          extraFuel: d.extraFuelCents === null ? null : money(d.extraFuelCents),
          netSavings: d.netSavingsCents === null ? null : money(d.netSavingsCents),
          extraMinutes: d.extraMinutes,
          extraMiles: d.extraMiles,
          itemsCompared: d.comparableCount,
          extraStops: d.extraStops,
        }
      : null,
    preferredStores: r.stores.filter((s) => settings.preferredStores.includes(s.key)).map((s) => clean(s.name)),
    saleNotCounted: notCounted > 0 ? money(notCounted) : null,
    recommendation: clean(r.recommendation.text, 400),
    limitations: r.limitations.slice(0, 6).map((l) => clean(l, 200)),
  };
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
/** Words that state an amount or ratio the facts never contain. */
const FORBIDDEN_WORDS =
  /\b(thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|halves|quarter|double|doubles|twice|triple|thrice|percent|per cent|percentage)\b|%|[½⅓⅔¼¾⅛]/i;

/** Keys whose text comes from the household and is never a source of allowed numbers. */
const UNTRUSTED_KEYS = new Set(["items"]);

/** Every number the facts contain, as the advisor might write it. */
export function allowedNumbers(f: AdviceFacts): Set<string> {
  const out = new Set<string>(["1"]);
  const add = (v: unknown) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number") {
      out.add(String(v));
      out.add(String(Math.round(v)));
      out.add(String(Math.abs(v)));
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/-?\$?\d[\d,]*(?:\.\d+)?/g)) {
        const n = m[0].replace(/[$,]/g, "");
        out.add(n);
        out.add(n.replace(/^-/, ""));
        if (n.endsWith(".00")) out.add(n.slice(0, -3).replace(/^-/, ""));
      }
    } else if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as object)) if (!UNTRUSTED_KEYS.has(k)) add(x);
  };
  add(f);
  return out;
}

/** True when every number in the text (digits or number words) is one of the facts. */
export function numbersAllowed(raw: string, f: AdviceFacts): boolean {
  const text = raw.normalize("NFKC");
  // Digits from other scripts (e.g. Arabic-Indic) aren't checked below, so refuse them.
  if (/[^\x00-\x7F]/.test(text.replace(/[^\p{Nd}]/gu, "")) ) return false;
  if (FORBIDDEN_WORDS.test(text)) return false;
  const ok = allowedNumbers(f);
  for (const m of text.matchAll(/\$?\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/[$,]/g, "");
    if (!ok.has(n) && !ok.has(n.replace(/\.0$/, ""))) return false;
  }
  for (const m of text.toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g)) {
    if (!ok.has(String(WORDS[m[1]!]))) return false;
  }
  return true;
}
