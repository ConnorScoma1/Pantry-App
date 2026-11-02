import { convert } from "@kitchen-pantry/inventory-engine";
import type { PriceStatus, Quantity } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { linePriceCents, planPackages } from "./packages";
import { classifyPrice, PricingProviderError, type PricedProduct, type PricingProvider } from "./provider";

/**
 * Price a shopping list at one store.
 *
 *  - Each list item is matched to a store product deterministically: the
 *    product name must contain the item's key words; then in-stock items
 *    win, then the cheapest way to buy the amount needed.
 *  - Package math uses the store's real package sizes. When the amount
 *    can't be compared (cups of spinach vs a 5 oz bag), the line is priced
 *    as one package and says so — it never pretends the amount is covered.
 *  - Sale prices are used only when the store reports them below regular.
 *  - Totals say how many items are included; a partial total is never shown
 *    as the whole basket.
 */

export interface PricingNeed {
  id: string;
  name: string;
  /** Base units (g, ml, each) or package units (clove, can); null when unknown. */
  quantity: Quantity | null;
}

export interface PricedLine {
  id: string;
  status: PriceStatus;
  product: { id: string; name: string; brand: string | null; size: string | null } | null;
  /** Packages to buy; null for items priced by weight. */
  packages: number | null;
  /** Shelf price of one package (or one pound), cents. */
  regularCents: number | null;
  /** Sale price when the store reports one below regular. */
  saleCents: number | null;
  lineTotalCents: number | null;
  /** True when the amount couldn't be compared to the package and one package was assumed. */
  assumedOnePackage: boolean;
  outOfStock: boolean;
  note: string | null;
  observedAt: string | null;
}

export interface BasketPrice {
  provider: string;
  storeId: string;
  lines: PricedLine[];
  totalCents: number;
  /** Lines included in totalCents. */
  pricedCount: number;
  /** Lines with no price at this store (no match, no price reported). */
  missingCount: number;
  assumedCount: number;
  saleSavingsCents: number;
  /** Oldest price used, so the UI can say "prices as of …". */
  oldestObservedAt: string | null;
  /** Non-null when the provider failed part-way; prices shown are still real. */
  warning: string | null;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
const DESCRIPTORS = new Set([
  "fresh", "large", "small", "medium", "extra", "chopped", "diced", "minced", "sliced", "grated", "shredded", "ground",
  "boneless", "skinless", "low", "sodium", "reduced", "plain", "whole", "raw", "cooked", "frozen", "dried", "of", "and", "or", "the",
  "a", "for", "to", "taste", "optional", "baby", "lean", "unsalted", "salted", "light", "dark", "packed", "crushed", "kosher",
]);

export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(ses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);

/** Words that turn an ingredient into a different product ("lemon" → "lemon juice"). */
const FORM_WORDS = new Set([
  "juice", "sauce", "powder", "extract", "flavored", "flavor", "mix", "chip", "snack", "soup", "dressing", "drink", "seasoning",
  "candy", "cookie", "bar", "cake", "pie", "muffin", "cracker", "cereal", "spread", "dip", "salsa", "marinade", "concentrate",
  "soda", "tea", "smoothie", "popsicle", "gummy", "vinaigrette", "pouch", "pickle", "relish", "jam", "jelly", "syrup", "oil",
]);

/** Share of the item's key words found in the product name (0–1), minus a penalty for a different product form. */
export function matchScore(itemName: string, productName: string): number {
  const all = words(itemName);
  const key = all.filter((w) => !DESCRIPTORS.has(w));
  const need = key.length > 0 ? key : all;
  if (need.length === 0) return 0;
  const product = words(productName);
  const have = new Set(product);
  const keyHits = need.filter((w) => have.has(w)).length;
  const extraHits = all.filter((w) => DESCRIPTORS.has(w) && have.has(w)).length;
  const mine = new Set(all);
  const otherForm = product.some((w) => FORM_WORDS.has(w) && !mine.has(w));
  // Key words decide the match; matching descriptors ("baby", "diced") breaks ties.
  return keyHits / need.length + Math.min(extraHits, 3) * 0.01 - (otherForm ? 0.5 : 0);
}

export const MIN_MATCH = 0.99;

interface Option {
  priced: PricedProduct;
  score: number;
  packages: number | null;
  totalCents: number | null;
  assumed: boolean;
  each: number;
}

function effectiveCents(o: PricedProduct): number | null {
  const obs = o.observation;
  if (!obs) return null;
  return obs.promoPriceCents ?? obs.priceCents;
}

function costFor(need: PricingNeed, p: PricedProduct): Pick<Option, "packages" | "totalCents" | "assumed"> {
  const each = effectiveCents(p);
  if (each === null) return { packages: null, totalCents: null, assumed: false };
  if (p.product.soldByWeight) {
    const lb = need.quantity ? convert(need.quantity, "lb") : null;
    if (lb === null) return { packages: 1, totalCents: each, assumed: true };
    return { packages: null, totalCents: Math.max(1, Math.round(lb * each)), assumed: false };
  }
  if (need.quantity && p.product.packageSize) {
    const plan = planPackages(need.quantity, p.product.packageSize);
    if (plan) return { packages: Math.max(plan.packages, 1), totalCents: linePriceCents(Math.max(plan.packages, 1), p.observation!), assumed: false };
  }
  return { packages: 1, totalCents: each, assumed: true };
}

/** Pick the store product for one list item, or null when nothing matches. */
export function chooseProduct(need: PricingNeed, results: readonly PricedProduct[]): Option | null {
  const options: Option[] = results
    .map((priced) => ({ priced, score: matchScore(need.name, priced.product.name), each: effectiveCents(priced) ?? Infinity, ...costFor(need, priced) }))
    .filter((o) => o.score >= MIN_MATCH && o.priced.observation !== null);
  if (options.length === 0) return null;
  const inStock = options.filter((o) => o.priced.observation!.availability !== "out_of_stock");
  const pool = inStock.length > 0 ? inStock : options;
  const best = Math.max(...pool.map((o) => o.score));
  const top = pool.filter((o) => o.score >= best - 0.005);
  // Prefer a computed amount over "one package assumed", then the cheapest.
  return top.sort(byCost)[0]!;
}

const byCost = (a: Option, b: Option) =>
  Number(a.assumed) - Number(b.assumed) || (a.totalCents ?? Infinity) - (b.totalCents ?? Infinity) || a.each - b.each;

export type ProductOption = Option;

/**
 * Every acceptable product for a list item, best first: the same order
 * chooseProduct uses (in stock, best match, computed amount, cheapest),
 * with out-of-stock matches last. Used for substitutions in Smart Cart.
 */
export function rankProducts(need: PricingNeed, results: readonly PricedProduct[], options: { ignoreStock?: boolean } = {}): ProductOption[] {
  const found: Option[] = results
    .map((priced) => ({ priced, score: matchScore(need.name, priced.product.name), each: effectiveCents(priced) ?? Infinity, ...costFor(need, priced) }))
    .filter((o) => o.score >= MIN_MATCH && o.priced.observation !== null);
  const out = (o: Option) => !options.ignoreStock && o.priced.observation!.availability === "out_of_stock";
  const seen = new Set<string>();
  return found
    .sort((a, b) => Number(out(a)) - Number(out(b)) || Math.round((b.score - a.score) * 200) / 200 || byCost(a, b))
    .filter((o) => (seen.has(o.priced.product.externalProductId) ? false : (seen.add(o.priced.product.externalProductId), true)));
}

export function priceLine(need: PricingNeed, results: readonly PricedProduct[], provider: Pick<PricingProvider, "isMock" | "storeSpecific">, now: Date): PricedLine {
  const choice = chooseProduct(need, results);
  if (!choice) {
    const unpricedMatch = results.some((r) => r.observation === null && matchScore(need.name, r.product.name) >= MIN_MATCH);
    return {
      id: need.id,
      status: "unavailable",
      product: null,
      packages: null,
      regularCents: null,
      saleCents: null,
      lineTotalCents: null,
      assumedOnePackage: false,
      outOfStock: false,
      note: unpricedMatch ? "The store doesn't list a price for this" : "No match at this store",
      observedAt: null,
    };
  }
  const { product, observation } = choice.priced;
  const obs = observation!;
  const outOfStock = obs.availability === "out_of_stock";
  const notes = [
    product.soldByWeight ? (choice.assumed ? "Sold by the pound — priced for 1 lb" : "Sold by the pound") : null,
    choice.assumed && !product.soldByWeight ? (need.quantity ? "Priced as 1 package — check it's enough" : "Priced as 1 package") : null,
    outOfStock ? "Out of stock at this store" : null,
  ].filter(Boolean);
  return {
    id: need.id,
    status: classifyPrice(obs, provider, now),
    product: { id: product.externalProductId, name: product.name, brand: product.brand, size: product.sizeLabel ?? null },
    packages: choice.packages,
    regularCents: obs.priceCents,
    saleCents: obs.promoPriceCents,
    lineTotalCents: choice.totalCents,
    assumedOnePackage: choice.assumed,
    outOfStock,
    note: notes.length ? notes.join(" · ") : null,
    observedAt: obs.observedAt.toISOString(),
  };
}

export function summarize(provider: string, storeId: string, lines: PricedLine[], warning: string | null = null): BasketPrice {
  const priced = lines.filter((l) => l.lineTotalCents !== null);
  const savings = priced.reduce((sum, l) => {
    if (l.saleCents === null || l.regularCents === null) return sum;
    const units = l.packages ?? (l.lineTotalCents! / l.saleCents);
    return sum + Math.round((l.regularCents - l.saleCents) * units);
  }, 0);
  const dates = priced.map((l) => l.observedAt).filter((d): d is string => d !== null).sort();
  return {
    provider,
    storeId,
    lines,
    totalCents: priced.reduce((s, l) => s + l.lineTotalCents!, 0),
    pricedCount: priced.length,
    missingCount: lines.length - priced.length,
    assumedCount: priced.filter((l) => l.assumedOnePackage).length,
    saleSavingsCents: Math.max(0, savings),
    oldestObservedAt: dates[0] ?? null,
    warning,
  };
}

// ---------------------------------------------------------------------------
// Basket
// ---------------------------------------------------------------------------
export interface SearchCache {
  get(key: string): PricedProduct[] | undefined;
  set(key: string, value: PricedProduct[]): void;
}

/** Small in-memory TTL cache (per server instance). */
export function createMemoryCache(ttlMs: number, maxEntries = 2000, now: () => number = Date.now): SearchCache {
  const map = new Map<string, { at: number; value: PricedProduct[] }>();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (map.size >= maxEntries) map.delete(map.keys().next().value!);
      map.set(key, { at: now(), value });
    },
  };
}

export async function priceBasket(input: {
  provider: PricingProvider;
  storeId: string;
  needs: readonly PricingNeed[];
  cache?: SearchCache;
  now?: () => Date;
  concurrency?: number;
}): Promise<BasketPrice> {
  const { provider, storeId } = input;
  const now = input.now ?? (() => new Date());
  const search = async (term: string): Promise<PricedProduct[]> => {
    const key = `${provider.id}:${storeId}:${term.toLowerCase().trim()}`;
    const hit = input.cache?.get(key);
    if (hit) return hit;
    let results: PricedProduct[];
    if (provider.searchPriced) results = await provider.searchPriced({ text: term, storeId, limit: 10 });
    else {
      const products = await provider.searchProducts({ text: term, storeId, limit: 10 });
      const prices = await provider.getPrices(storeId, products.map((p) => p.externalProductId));
      results = products.map((product) => ({ product, observation: prices.find((o) => o.externalProductId === product.externalProductId) ?? null }));
    }
    input.cache?.set(key, results);
    return results;
  };

  const lines: PricedLine[] = new Array(input.needs.length);
  let warning: string | null = null;
  let next = 0;
  let stop = false;
  const worker = async () => {
    while (!stop && next < input.needs.length) {
      const i = next++;
      const need = input.needs[i]!;
      try {
        lines[i] = priceLine(need, await search(need.name), provider, now());
      } catch (error) {
        const e = error instanceof PricingProviderError ? error : null;
        // Credentials or daily-limit problems affect every line: stop asking.
        if (e && (e.kind === "auth" || e.kind === "rate_limited" || e.kind === "not_configured")) stop = true;
        warning ??= e?.message ?? "Some prices couldn't be loaded.";
        lines[i] = priceLine(need, [], provider, now());
        lines[i]!.note = "Price couldn't be loaded";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, input.needs.length) }, worker));
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) {
      lines[i] = priceLine(input.needs[i]!, [], provider, now());
      lines[i]!.note = "Price couldn't be loaded";
    }
  }
  return summarize(provider.id, storeId, lines, warning);
}

// ---------------------------------------------------------------------------
// Validation of what the server sends back (the phone and browser check it).
// ---------------------------------------------------------------------------
const status = z.enum(["verified", "cached", "estimated", "unavailable"]);
const cents = z.number().int().nonnegative();
export const pricedLineSchema = z.object({
  id: z.string(),
  status,
  product: z.object({ id: z.string(), name: z.string(), brand: z.string().nullable(), size: z.string().nullable() }).nullable(),
  packages: z.number().int().positive().nullable(),
  regularCents: cents.nullable(),
  saleCents: cents.nullable(),
  lineTotalCents: cents.nullable(),
  assumedOnePackage: z.boolean(),
  outOfStock: z.boolean(),
  note: z.string().nullable(),
  observedAt: z.string().nullable(),
});
export const basketPriceSchema = z.object({
  provider: z.string(),
  storeId: z.string(),
  lines: z.array(pricedLineSchema),
  totalCents: cents,
  pricedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  assumedCount: z.number().int().nonnegative(),
  saleSavingsCents: cents,
  oldestObservedAt: z.string().nullable(),
  warning: z.string().nullable(),
});

/** What a client sends to be priced: names and amounts only, never prices. */
export const pricingRequestSchema = z.object({
  storeId: z.string().regex(/^[0-9A-Za-z]{4,20}$/, "That store id isn't valid."),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        quantity: z.object({ value: z.number().positive().finite().max(100_000), unit: z.string().min(1).max(20) }).nullable(),
      }),
    )
    .min(1)
    .max(80),
});
export type PricingRequest = z.infer<typeof pricingRequestSchema>;

/** Lines the store reports on sale right now (a real promo price below regular, in stock). */
export function onSale(lines: readonly PricedLine[]): PricedLine[] {
  return lines.filter(
    (l) =>
      l.saleCents !== null &&
      l.regularCents !== null &&
      l.saleCents < l.regularCents &&
      !l.outOfStock &&
      (l.status === "verified" || l.status === "cached"),
  );
}
