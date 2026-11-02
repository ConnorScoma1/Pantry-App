import { convert } from "@kitchen-pantry/inventory-engine";
import { groceryDepartments, type GroceryDepartment, type Quantity } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import type { SearchCache } from "./basket";
import { PricingProviderError, classifyPrice, type Availability, type PricedProduct, type PricingProvider } from "./provider";

/**
 * Specials (spec 02 §2): products the household's store currently reports
 * at a promotional price below its regular price.
 *
 * Where they come from: a `PromotionProvider`. The first one reads the
 * store's own product prices (Kroger Products API) for a list of search
 * terms — the things the household buys, plus each department's everyday
 * staples. It is NOT a weekly ad: it only knows products it was asked
 * about, and it only reports a sale price. BOGO, multi-buy, digital-coupon
 * and loyalty-price details need a source that publishes them; until one is
 * added those fields stay "not stated" rather than guessed.
 */

export type PromoType = "sale" | "bogo" | "multi_buy" | "digital_coupon" | "loyalty_price";

export interface Special {
  /** `${provider}:${productId}` */
  id: string;
  provider: string;
  retailer: string;
  storeId: string;
  productId: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  department: GroceryDepartment;
  /** The search term that found it (e.g. "chicken thighs"). */
  matchedTerm: string;
  regularCents: number;
  saleCents: number;
  /** Whole percent, rounded down so it never overstates the discount. */
  percentOff: number;
  /** Price is per pound at the register. */
  soldByWeight: boolean;
  /** Worked out from the package size the store gives; null when it can't be read. */
  unitPrice: { regularCents: number; saleCents: number; per: UnitBasis } | null;
  promoType: PromoType;
  /** null = the source doesn't say whether a coupon or loyalty card is needed. */
  requiresMembership: boolean | null;
  requiresCoupon: boolean | null;
  /** Last day of the promotion (YYYY-MM-DD) when the source gives one. */
  endsOn: string | null;
  /** Retailer page for the product, when the source provides one. */
  sourceUrl: string | null;
  availability: Availability;
  /** ISO time the store reported the price. */
  observedAt: string;
}

export type UnitBasis = "oz" | "fl oz" | "lb" | "each";

export interface SpecialsTerm {
  term: string;
  department: GroceryDepartment;
}

export interface SpecialsResult {
  provider: string;
  storeId: string;
  specials: Special[];
  /** Terms asked about, so the page can say what was checked. */
  checked: number;
  /** Terms that couldn't be loaded. */
  failed: number;
  warning: string | null;
  fetchedAt: string;
}

/** A source of promotions. Registered only once its terms of use allow it. */
export interface PromotionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isMock: boolean;
  findSpecials(input: { storeId: string; terms: readonly SpecialsTerm[]; cache?: SearchCache; now?: () => Date }): Promise<SpecialsResult>;
}

/** Everyday items by department, checked for every household (no personal data). */
export const STAPLE_SPECIALS_TERMS: readonly SpecialsTerm[] = [
  ...["chicken breast", "chicken thighs", "ground beef", "pork chops", "salmon", "shrimp", "bacon", "ground turkey"].map((term) => ({ term, department: "meat_seafood" as const })),
  ...["apples", "bananas", "berries", "grapes", "potatoes", "onions", "broccoli", "salad", "tomatoes", "avocados", "peppers", "carrots"].map((term) => ({ term, department: "produce" as const })),
  ...["milk", "eggs", "cheese", "yogurt", "butter"].map((term) => ({ term, department: "dairy" as const })),
  ...["bread", "tortillas"].map((term) => ({ term, department: "bakery" as const })),
  ...["pasta", "rice", "canned tomatoes", "cereal", "coffee", "olive oil", "beans"].map((term) => ({ term, department: "pantry" as const })),
  ...["frozen vegetables", "ice cream", "frozen pizza"].map((term) => ({ term, department: "frozen" as const })),
];

const DEPARTMENTS = new Set<string>(groceryDepartments.map((d) => d.code));

/** Cents per oz / fl oz / lb / each from a package price. */
export function unitPriceCents(cents: number, size: Quantity | null, soldByWeight = false): { cents: number; per: UnitBasis } | null {
  if (soldByWeight) return { cents, per: "lb" };
  if (!size || size.value <= 0) return null;
  if (size.unit === "each") return { cents: Math.round(cents / size.value), per: "each" };
  const flOz = convert(size, "fl_oz");
  if (flOz !== null && flOz > 0) return { cents: Math.round(cents / flOz), per: "fl oz" };
  const oz = convert(size, "oz");
  if (oz === null || oz <= 0) return null;
  // Per lb for big packs, per oz for small ones (how shelf tags read).
  return oz >= 32 ? { cents: Math.round(cents / (oz / 16)), per: "lb" } : { cents: Math.round(cents / oz), per: "oz" };
}

/** A product → a Special, or null unless the store reports a real sale. */
export function toSpecial(p: PricedProduct, term: SpecialsTerm, provider: Pick<PricingProvider, "id" | "isMock" | "storeSpecific">, now: Date): Special | null {
  const o = p.observation;
  if (!o || o.promoPriceCents === null || o.promoPriceCents <= 0 || o.promoPriceCents >= o.priceCents) return null;
  if (o.availability === "out_of_stock") return null;
  // Only fresh, store-specific prices count — never mock or stale data.
  const status = classifyPrice(o, provider, now);
  if (status !== "verified" && status !== "cached") return null;
  if (o.promoEndsOn && o.promoEndsOn < now.toISOString().slice(0, 10)) return null;
  const regular = unitPriceCents(o.priceCents, p.product.packageSize, p.product.soldByWeight);
  const sale = unitPriceCents(o.promoPriceCents, p.product.packageSize, p.product.soldByWeight);
  return {
    id: `${p.product.provider}:${p.product.externalProductId}`,
    provider: p.product.provider,
    retailer: p.product.retailer,
    storeId: o.storeId,
    productId: p.product.externalProductId,
    name: p.product.name,
    brand: p.product.brand,
    sizeLabel: p.product.sizeLabel ?? null,
    department: DEPARTMENTS.has(term.department) ? term.department : "other",
    matchedTerm: term.term,
    regularCents: o.priceCents,
    saleCents: o.promoPriceCents,
    percentOff: Math.floor(((o.priceCents - o.promoPriceCents) / o.priceCents) * 100),
    soldByWeight: Boolean(p.product.soldByWeight),
    unitPrice: regular && sale && regular.per === sale.per ? { regularCents: regular.cents, saleCents: sale.cents, per: sale.per } : null,
    promoType: "sale",
    requiresMembership: null,
    requiresCoupon: null,
    endsOn: o.promoEndsOn ?? null,
    sourceUrl: p.product.pageUrl ?? null,
    availability: o.availability,
    observedAt: o.observedAt.toISOString(),
  };
}

/**
 * Sale prices from a PricingProvider (e.g. Kroger) for a set of terms.
 * Results are de-duplicated by product (the first, most specific term wins
 * — callers put the household's own items first).
 */
export async function findStoreSpecials(input: {
  provider: PricingProvider;
  storeId: string;
  terms: readonly SpecialsTerm[];
  cache?: SearchCache;
  now?: () => Date;
  perTerm?: number;
  concurrency?: number;
}): Promise<SpecialsResult> {
  const { provider, storeId } = input;
  const now = input.now ?? (() => new Date());
  const perTerm = input.perTerm ?? 25;
  const terms = dedupeTerms(input.terms).slice(0, 60);
  const found: Array<Special[] | null> = new Array(terms.length).fill(null);
  let failed = 0;
  let warning: string | null = null;
  let stop = false;
  let next = 0;

  const search = async (text: string) => {
    const key = `specials:${provider.id}:${storeId}:${perTerm}:${text}`;
    const hit = input.cache?.get(key);
    if (hit) return hit;
    if (!provider.searchPriced) return [];
    const results = await provider.searchPriced({ text, storeId, limit: perTerm });
    input.cache?.set(key, results);
    return results;
  };

  const worker = async () => {
    while (!stop && next < terms.length) {
      const i = next++;
      const t = terms[i]!;
      try {
        const at = now();
        found[i] = (await search(t.term)).map((p) => toSpecial(p, t, provider, at)).filter((s): s is Special => s !== null);
      } catch (error) {
        failed++;
        const e = error instanceof PricingProviderError ? error : null;
        if (e && (e.kind === "auth" || e.kind === "rate_limited" || e.kind === "not_configured")) stop = true;
        warning ??= e?.message ?? "Some specials couldn't be loaded.";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, Math.max(terms.length, 1)) }, worker));
  if (stop) failed += terms.length - next;

  const seen = new Set<string>();
  const specials: Special[] = [];
  for (const list of found) {
    for (const s of list ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      specials.push(s);
    }
  }
  return { provider: provider.id, storeId, specials, checked: terms.length, failed, warning, fetchedAt: now().toISOString() };
}

function dedupeTerms(terms: readonly SpecialsTerm[]): SpecialsTerm[] {
  const seen = new Set<string>();
  const out: SpecialsTerm[] = [];
  for (const t of terms) {
    const key = t.term.toLowerCase().replace(/\s+/g, " ").trim();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push({ term: key, department: t.department });
  }
  return out;
}

/** Store-price specials as a PromotionProvider (Kroger today). */
export class StorePriceSpecialsProvider implements PromotionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isMock: boolean;
  constructor(private readonly pricing: PricingProvider) {
    this.id = pricing.id;
    this.displayName = `${pricing.displayName} sale prices`;
    this.isMock = pricing.isMock;
  }
  findSpecials(input: { storeId: string; terms: readonly SpecialsTerm[]; cache?: SearchCache; now?: () => Date }) {
    return findStoreSpecials({ provider: this.pricing, ...input });
  }
}

// ---------------------------------------------------------------------------
// Transport schemas (server → browser/phone); validated again on arrival.
// ---------------------------------------------------------------------------
const cents = z.number().int().nonnegative();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const specialSchema = z
  .object({
    id: z.string().min(1).max(80),
    provider: z.string().max(40),
    retailer: z.string().max(60),
    storeId: z.string().max(20),
    productId: z.string().max(40),
    name: z.string().min(1).max(300),
    brand: z.string().max(120).nullable(),
    sizeLabel: z.string().max(60).nullable(),
    department: z.enum(groceryDepartments.map((d) => d.code) as [GroceryDepartment, ...GroceryDepartment[]]),
    matchedTerm: z.string().max(120),
    regularCents: cents,
    saleCents: cents,
    percentOff: z.number().int().min(0).max(100),
    soldByWeight: z.boolean(),
    unitPrice: z.object({ regularCents: cents, saleCents: cents, per: z.enum(["oz", "fl oz", "lb", "each"]) }).nullable(),
    promoType: z.enum(["sale", "bogo", "multi_buy", "digital_coupon", "loyalty_price"]),
    requiresMembership: z.boolean().nullable(),
    requiresCoupon: z.boolean().nullable(),
    endsOn: isoDay.nullable(),
    sourceUrl: z.string().url().max(500).refine((u) => u.startsWith("https://"), "https only").nullable(),
    availability: z.enum(["in_stock", "limited", "out_of_stock", "unknown"]),
    observedAt: z.string().max(40),
  })
  .refine((s) => s.saleCents < s.regularCents, "A special must be below the regular price");

export const specialsResultSchema = z.object({
  provider: z.string().max(40),
  storeId: z.string().max(20),
  specials: z.array(specialSchema).max(1500),
  checked: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  warning: z.string().max(300).nullable(),
  fetchedAt: z.string().max(40),
});

export const specialsRequestSchema = z.object({
  storeId: z.string().regex(/^[0-9A-Za-z]{4,20}$/, "That store id isn't valid."),
  terms: z
    .array(
      z.object({
        term: z.string().trim().min(2).max(60),
        department: z.enum(groceryDepartments.map((d) => d.code) as [GroceryDepartment, ...GroceryDepartment[]]),
      }),
    )
    .max(60),
});
export type SpecialsRequest = z.infer<typeof specialsRequestSchema>;
