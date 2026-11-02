import { assessUrgency } from "@kitchen-pantry/inventory-engine";
import { groceryDepartments, type GroceryDepartment, type GroceryItem, type PantryItem, type PriceStatus, type Quantity } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { rankProducts, type PricingNeed, type SearchCache } from "./basket";
import { classifyPrice, PricingProviderError, type Availability, type PricedProduct, type PricingProvider } from "./provider";

/**
 * Smart Cart (spec 07): the shared grocery list → products at one retailer
 * → reviewed and approved by the household → sent to the retailer's cart
 * through an authorised adapter. Everything here is deterministic; the
 * retailer is the only source of products and prices.
 */

export type FulfillmentMethod = "pickup" | "delivery";
export const fulfillmentMethods: ReadonlyArray<{ code: FulfillmentMethod; label: string }> = [
  { code: "pickup", label: "Pickup" },
  { code: "delivery", label: "Delivery" },
];

// ---------------------------------------------------------------------------
// 1. What to buy: the shared list, de-duplicated, with kitchen hints
// ---------------------------------------------------------------------------
export interface CartNeed {
  /** Stable id: the first grocery item's id. */
  id: string;
  name: string;
  department: GroceryDepartment;
  amountText: string | null;
  quantity: Quantity | null;
  /** Grocery list items merged into this line. */
  sourceIds: string[];
  neededFor: string[];
  /** Set when a typed item looks like something already in the kitchen. */
  inKitchen: string | null;
}

const SKIP_WORDS = new Set(["fresh", "large", "small", "medium", "organic", "boneless", "skinless", "whole", "chopped", "sliced", "diced", "minced", "ground"]);
const singular = (w: string) => (w.length > 3 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && /(ches|shes|oes|xes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const keyWords = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);
const nameKey = (name: string) => keyWords(name).join(" ");

function sameThing(a: string, b: string): boolean {
  const wa = keyWords(a).filter((w) => !SKIP_WORDS.has(w));
  const wb = new Set(keyWords(b).filter((w) => !SKIP_WORDS.has(w)));
  return wa.length > 0 && wa.every((w) => wb.has(w));
}

/**
 * Unchecked list items, merged when two lines are the same thing (a typed
 * "milk" and the plan's "milk"). Plan lines already had the kitchen taken
 * off; typed items that look like something in the kitchen are flagged, not
 * removed — the household decides.
 */
export function cartNeeds(items: readonly Pick<GroceryItem, "id" | "name" | "department" | "amount" | "quantity" | "checked" | "source" | "neededFor">[], pantry: readonly PantryItem[], today: string): CartNeed[] {
  const byKey = new Map<string, CartNeed>();
  const usable = pantry.filter((p) => assessUrgency(p.useBy, today).usable);
  for (const item of items) {
    if (item.checked) continue;
    const key = nameKey(item.name);
    if (!key) continue;
    const have = item.source === "manual" ? usable.find((p) => sameThing(item.name, p.name) || sameThing(p.name, item.name)) : undefined;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        id: item.id,
        name: item.name,
        department: item.department,
        amountText: item.amount,
        quantity: item.quantity,
        sourceIds: [item.id],
        neededFor: [...item.neededFor],
        inKitchen: have ? `You have ${have.name.toLowerCase()} in your kitchen` : null,
      });
      continue;
    }
    existing.sourceIds.push(item.id);
    existing.neededFor = [...new Set([...existing.neededFor, ...item.neededFor])];
    if (existing.quantity && item.quantity && existing.quantity.unit === item.quantity.unit) {
      existing.quantity = { value: existing.quantity.value + item.quantity.value, unit: existing.quantity.unit };
    } else if (item.quantity && !existing.quantity && !existing.amountText) {
      existing.quantity = item.quantity;
    } else if (item.quantity || existing.quantity) {
      existing.quantity = existing.quantity ?? item.quantity; // amounts in different units: keep both texts
    }
    existing.amountText = [existing.amountText, item.amount].filter(Boolean).join(" + ") || null;
    if (!existing.inKitchen && have) existing.inKitchen = `You have ${have.name.toLowerCase()} in your kitchen`;
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// 2. Matching to the retailer's products
// ---------------------------------------------------------------------------
export interface CartProduct {
  productId: string;
  upc: string | null;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  soldByWeight: boolean;
  regularCents: number;
  saleCents: number | null;
  availability: Availability;
  priceStatus: PriceStatus;
  observedAt: string;
  /** Units to add for this item's amount; null when it can't be worked out. */
  suggestedCount: number | null;
}

export type CartLineState = "matched" | "needs_review" | "substitute" | "unavailable";

export interface CartLine extends CartNeed {
  options: CartProduct[];
  /** Chosen product (productId), or null when nothing fits. */
  selected: string | null;
  /** Units to add to the cart (packages, or pounds for items sold by weight). */
  count: number;
  include: boolean;
  state: CartLineState;
  /** Why it needs a look, in plain words. */
  reason: string | null;
  /** The household confirmed this line (always true for clean matches). */
  approved: boolean;
}

const MAX_OPTIONS = 5;

function toCartProduct(o: ReturnType<typeof rankProducts>[number], provider: Pick<PricingProvider, "isMock" | "storeSpecific">, now: Date): CartProduct {
  const { product, observation } = o.priced;
  const obs = observation!;
  const lb = o.priced.product.soldByWeight && o.totalCents !== null && !o.assumed ? o.totalCents / (obs.promoPriceCents ?? obs.priceCents) : null;
  return {
    productId: product.externalProductId,
    upc: product.upc,
    name: product.name,
    brand: product.brand,
    sizeLabel: product.sizeLabel ?? null,
    soldByWeight: Boolean(product.soldByWeight),
    regularCents: obs.priceCents,
    saleCents: obs.promoPriceCents,
    availability: obs.availability,
    priceStatus: classifyPrice(obs, provider, now),
    observedAt: obs.observedAt.toISOString(),
    suggestedCount: o.assumed ? null : product.soldByWeight ? (lb === null ? null : Math.max(1, Math.ceil(lb - 1e-9))) : o.packages,
  };
}

/** Turn ranked products into a line with a suggested choice and a state. */
export function lineFromOptions(
  need: CartNeed,
  ranked: ReturnType<typeof rankProducts>,
  provider: Pick<PricingProvider, "isMock" | "storeSpecific">,
  now: Date,
  /** The same products ranked as if everything were in stock (what we'd have picked). */
  ideal: ReturnType<typeof rankProducts>[number] | null = null,
): CartLine {
  const options = ranked.slice(0, MAX_OPTIONS).map((o) => toCartProduct(o, provider, now));
  const base = { ...need, options };
  if (options.length === 0) {
    return { ...base, selected: null, count: 1, include: false, state: "unavailable", reason: "No matching product at this store", approved: true };
  }
  const first = options[0]!;
  if (first.availability === "out_of_stock") {
    return { ...base, selected: null, count: 1, include: false, state: "unavailable", reason: "Out of stock at this store", approved: true };
  }
  // The closest match by name, ignoring stock: if that's out of stock and we picked something else, it's a substitution.
  const idealOut = ideal !== null && ideal.priced.observation!.availability === "out_of_stock" && ideal.priced.product.externalProductId !== first.productId;
  const count = first.suggestedCount ?? 1;
  if (idealOut) {
    return {
      ...base,
      selected: first.productId,
      count,
      include: true,
      state: "substitute",
      reason: `${ideal!.priced.product.name} is out of stock — suggested ${first.name} instead`,
      approved: false,
    };
  }
  if (first.suggestedCount === null && need.quantity === null) {
    // A typed item with no structured amount: one package, with a gentle note — not a blocker.
    return { ...base, selected: first.productId, count: 1, include: true, state: "matched", reason: need.amountText ? `You wrote "${need.amountText}" — check the quantity` : null, approved: true };
  }
  if (first.suggestedCount === null) {
    const amount = need.amountText ?? (need.quantity ? `${Math.round(need.quantity.value * 10) / 10} ${need.quantity.unit}` : null);
    return {
      ...base,
      selected: first.productId,
      count: 1,
      include: true,
      state: "needs_review",
      reason: amount ? `Check the amount: you need ${amount}, this is ${first.sizeLabel ?? "one package"}` : "Check the amount — we added 1",
      approved: false,
    };
  }
  return { ...base, selected: first.productId, count, include: true, state: "matched", reason: null, approved: true };
}

/** Search the retailer for every need (cached, a few at a time) and build the lines. */
export async function matchCart(input: {
  provider: PricingProvider;
  storeId: string;
  needs: readonly CartNeed[];
  cache?: SearchCache;
  now?: () => Date;
  concurrency?: number;
}): Promise<{ lines: CartLine[]; warning: string | null }> {
  const { provider, storeId } = input;
  const now = input.now ?? (() => new Date());
  const search = async (term: string): Promise<PricedProduct[]> => {
    const key = `cart:${provider.id}:${storeId}:${term.toLowerCase().trim()}`;
    const hit = input.cache?.get(key);
    if (hit) return hit;
    const results = provider.searchPriced ? await provider.searchPriced({ text: term, storeId, limit: 15 }) : [];
    input.cache?.set(key, results);
    return results;
  };
  const lines: CartLine[] = new Array(input.needs.length);
  let warning: string | null = null;
  let stop = false;
  let next = 0;
  const worker = async () => {
    while (next < input.needs.length) {
      const i = next++;
      const need = input.needs[i]!;
      const pricingNeed: PricingNeed = { id: need.id, name: need.name, quantity: need.quantity };
      if (stop) {
        lines[i] = { ...need, options: [], selected: null, count: 1, include: false, state: "unavailable", reason: "Couldn't check this store", approved: true };
        continue;
      }
      try {
        const results = await search(need.name);
        lines[i] = lineFromOptions(need, rankProducts(pricingNeed, results), provider, now(), rankProducts(pricingNeed, results, { ignoreStock: true })[0] ?? null);
      } catch (error) {
        const e = error instanceof PricingProviderError ? error : null;
        if (e && (e.kind === "auth" || e.kind === "rate_limited" || e.kind === "not_configured")) stop = true;
        warning ??= e?.message ?? "Some items couldn't be matched.";
        lines[i] = { ...need, options: [], selected: null, count: 1, include: false, state: "unavailable", reason: "Couldn't check this store", approved: true };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, Math.max(input.needs.length, 1)) }, worker));
  return { lines, warning };
}

// ---------------------------------------------------------------------------
// 3. Household edits (pure; return a new line)
// ---------------------------------------------------------------------------
/** Pick a different product. Choosing it yourself counts as approving it. */
export function chooseOption(line: CartLine, productId: string): CartLine {
  const option = line.options.find((o) => o.productId === productId);
  if (!option) return line;
  return {
    ...line,
    selected: productId,
    count: option.suggestedCount ?? line.count,
    include: true,
    state: option.availability === "out_of_stock" ? "unavailable" : line.state === "unavailable" ? "matched" : line.state,
    approved: option.availability !== "out_of_stock",
    reason: option.availability === "out_of_stock" ? "Out of stock at this store" : line.reason,
  };
}

export function setCount(line: CartLine, count: number): CartLine {
  const n = Math.round(count);
  if (!Number.isFinite(n) || n < 1 || n > 99) return line;
  return { ...line, count: n, approved: line.state === "needs_review" ? true : line.approved };
}

export function setInclude(line: CartLine, include: boolean): CartLine {
  if (include && !line.selected) return line;
  return { ...line, include };
}

/** "Yes, that substitution / amount is fine." */
export function approveLine(line: CartLine): CartLine {
  return line.selected ? { ...line, approved: true } : line;
}

// ---------------------------------------------------------------------------
// 4. Estimate, readiness and what gets sent
// ---------------------------------------------------------------------------
export interface CartEstimate {
  /** Sum of shelf/sale prices × units. An estimate: the retailer's checkout total (tax, fees, weight, price changes) will differ. */
  estimatedCents: number;
  includedCount: number;
  /** Included lines with no current price (left out of the estimate). */
  unpricedCount: number;
  saleSavingsCents: number;
  skippedCount: number;
  oldestPriceAt: string | null;
  /** True when any included price is a sample/mock price. */
  sample: boolean;
}

export function selectedProduct(line: CartLine): CartProduct | null {
  return line.selected ? (line.options.find((o) => o.productId === line.selected) ?? null) : null;
}

export function cartEstimate(lines: readonly CartLine[]): CartEstimate {
  let total = 0;
  let unpriced = 0;
  let savings = 0;
  let sample = false;
  const dates: string[] = [];
  const included = lines.filter((l) => l.include && l.selected);
  for (const l of included) {
    const p = selectedProduct(l);
    if (!p || p.priceStatus === "unavailable") {
      unpriced++;
      continue;
    }
    if (p.priceStatus === "estimated") sample = true;
    const each = p.saleCents ?? p.regularCents;
    total += each * l.count;
    if (p.saleCents !== null) savings += (p.regularCents - p.saleCents) * l.count;
    dates.push(p.observedAt);
  }
  return {
    estimatedCents: total,
    includedCount: included.length,
    unpricedCount: unpriced,
    saleSavingsCents: savings,
    skippedCount: lines.length - included.length,
    oldestPriceAt: dates.sort()[0] ?? null,
    sample,
  };
}

/** Lines that still need a decision before the cart can be sent. */
export function cartBlockers(lines: readonly CartLine[]): CartLine[] {
  return lines.filter((l) => l.include && (!l.selected || !l.approved));
}

export interface TransferItem {
  productId: string;
  upc: string | null;
  name: string;
  quantity: number;
}

export function transferItems(lines: readonly CartLine[]): TransferItem[] {
  return lines
    .filter((l) => l.include && l.selected && l.approved)
    .map((l) => {
      const p = selectedProduct(l)!;
      return { productId: p.productId, upc: p.upc, name: p.name, quantity: l.count };
    });
}

/** Plain-text list — the fallback when a retailer has no cart integration. */
export function cartAsText(input: { title: string; storeName: string | null; lines: readonly CartLine[] }): string {
  const rows = input.lines
    .filter((l) => l.include)
    .map((l) => {
      const p = selectedProduct(l);
      const what = p ? `${p.name}${p.sizeLabel ? ` (${p.sizeLabel})` : ""}` : l.name;
      return `- ${l.count > 1 ? `${l.count} × ` : ""}${what}${l.amountText ? ` — for ${l.amountText} ${l.name.toLowerCase()}` : ""}`;
    });
  return [input.title, input.storeName ? `Store: ${input.storeName}` : null, "", ...rows].filter((x) => x !== null).join("\n");
}

// ---------------------------------------------------------------------------
// 5. The draft the household reviews, and what happened to it
// ---------------------------------------------------------------------------
/**
 * Status of the cart hand-off (separate from the shopping list, whose items
 * are only ticked when the household says they bought them):
 *   draft → approved → sending → sent (retailer confirmed) | link_ready | failed | unknown
 * "unknown" = a send was interrupted; the household must check the retailer
 * cart before trying again, so items are never added twice.
 */
export type CartStatus = "draft" | "approved" | "sending" | "sent" | "link_ready" | "failed" | "unknown";
/** What the household tells us about the order itself — we never see payment. */
export type PurchaseStatus = "not_ordered" | "ordered";

export type TransferResult =
  /** confirmedBy: the retailer's API said OK (retailer_api), a practice run (mock), or a person checked the retailer cart after an interrupted send (household). */
  | { kind: "cart_confirmed"; added: number | null; checkoutUrl: string | null; confirmedBy: "retailer_api" | "mock" | "household"; at: string }
  | { kind: "link"; url: string; label: string; at: string };

/** "unknown" = the request may have reached the retailer (timeout, 5xx): never retried automatically. */
export type CartErrorKind = "auth_required" | "auth_expired" | "rate_limited" | "rejected" | "unavailable" | "not_configured" | "unknown";

export type TransferOutcome = { ok: true; result: TransferResult } | { ok: false; error: CartErrorKind; message: string; retryable: boolean };

export interface CartDraft {
  id: string;
  retailer: string;
  storeId: string | null;
  storeName: string | null;
  fulfillment: FulfillmentMethod;
  lines: CartLine[];
  status: CartStatus;
  /** Bumped on every save; a save with an old version is rejected (another member changed it). */
  version: number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Idempotency key for the send; reused on retries. */
  transferKey: string | null;
  result: TransferResult | null;
  lastError: string | null;
  purchase: PurchaseStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 6. Retailer adapters
// ---------------------------------------------------------------------------
export interface RetailerCartAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Mock adapters never touch a real store. */
  readonly isMock: boolean;
  /** direct_cart = items go into the shopper's cart via the retailer's API; shopping_link = a retailer page the shopper opens. */
  readonly mode: "direct_cart" | "shopping_link";
  readonly fulfillment: readonly FulfillmentMethod[];
  readonly requiresUserAuth: boolean;
  transfer(input: { items: readonly TransferItem[]; fulfillment: FulfillmentMethod; storeId: string | null; accessToken: string | null; title: string }): Promise<TransferOutcome>;
}

/**
 * MOCK retailer for building and testing the flow. It confirms a "cart"
 * that doesn't exist, and says so: confirmedBy "mock", no checkout URL.
 */
export class MockCartAdapter implements RetailerCartAdapter {
  readonly id = "mock";
  readonly displayName = "Sample Market (practice)";
  readonly isMock = true;
  readonly mode = "direct_cart" as const;
  readonly fulfillment: readonly FulfillmentMethod[] = ["pickup", "delivery"];
  readonly requiresUserAuth = false;
  constructor(private readonly options: { fail?: CartErrorKind; now?: () => Date } = {}) {}
  async transfer(input: { items: readonly TransferItem[] }): Promise<TransferOutcome> {
    if (this.options.fail) return { ok: false, error: this.options.fail, message: `Practice failure: ${this.options.fail}`, retryable: this.options.fail !== "rejected" };
    if (input.items.length === 0) return { ok: false, error: "rejected", message: "Nothing to add.", retryable: false };
    return { ok: true, result: { kind: "cart_confirmed", added: input.items.length, checkoutUrl: null, confirmedBy: "mock", at: (this.options.now?.() ?? new Date()).toISOString() } };
  }
}

const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const title = (t: string) => t.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * SAMPLE products for the mock retailer: every search returns three
 * made-up products ("Sample …") with made-up prices, labelled estimated by
 * classifyPrice (isMock). Some are out of stock so substitutions can be tried.
 */
export class SampleCatalogProvider implements PricingProvider {
  readonly id = "mock";
  readonly displayName = "Sample Market (sample prices, not real)";
  readonly isMock = true;
  readonly storeSpecific = false;
  constructor(private readonly now: () => Date = () => new Date()) {}
  async searchProducts() {
    return [];
  }
  async getPrices() {
    return [];
  }
  async searchPriced({ text, storeId }: { text: string; storeId: string }): Promise<PricedProduct[]> {
    const name = title(text.trim());
    const h = hash(text.toLowerCase());
    const sizes = ["1 lb", "16 oz", "12 ct", "32 fl oz", "8 oz", "2 lb"];
    return ["", "Organic ", "Value "].map((prefix, i) => {
      const size = sizes[(h + i * 7) % sizes.length]!;
      const [v, u] = size.split(" ", 2) as [string, string];
      const regular = 149 + ((h >> (i + 1)) % 650);
      const sale = (h + i) % 5 === 0 ? regular - 50 : null;
      const out = i === 0 && h % 4 === 0;
      return {
        product: {
          provider: "mock",
          retailer: "Sample Market",
          externalProductId: `sample-${h}-${i}`,
          name: `Sample ${prefix}${name}`,
          brand: prefix ? `Sample ${prefix.trim()}` : "Sample",
          packageSize: { value: Number(v), unit: size.endsWith("fl oz") ? "fl_oz" : u === "ct" ? "each" : u },
          sizeLabel: size,
          soldByWeight: false,
          upc: null,
        },
        observation: {
          externalProductId: `sample-${h}-${i}`,
          storeId,
          priceCents: regular,
          promoPriceCents: sale,
          promoDescription: sale ? "Sample sale" : null,
          unitPriceCents: null,
          unitPriceUnit: null,
          availability: out ? "out_of_stock" : "in_stock",
          observedAt: this.now(),
        },
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Transport schemas (validated on both sides)
// ---------------------------------------------------------------------------
const cents = z.number().int().nonnegative();
const deptEnum = z.enum(groceryDepartments.map((d) => d.code) as [GroceryDepartment, ...GroceryDepartment[]]);
const quantitySchema = z.object({ value: z.number().positive().finite().max(100_000), unit: z.string().min(1).max(20) });

export const cartNeedSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  department: deptEnum,
  amountText: z.string().max(200).nullable(),
  quantity: quantitySchema.nullable(),
  sourceIds: z.array(z.string().max(64)).max(20),
  neededFor: z.array(z.string().max(160)).max(20),
  inKitchen: z.string().max(200).nullable(),
});

export const cartProductSchema = z.object({
  productId: z.string().min(1).max(64),
  upc: z.string().max(40).nullable(),
  name: z.string().min(1).max(300),
  brand: z.string().max(120).nullable(),
  sizeLabel: z.string().max(60).nullable(),
  soldByWeight: z.boolean(),
  regularCents: cents,
  saleCents: cents.nullable(),
  availability: z.enum(["in_stock", "limited", "out_of_stock", "unknown"]),
  priceStatus: z.enum(["verified", "cached", "estimated", "unavailable"]),
  observedAt: z.string().max(40),
  suggestedCount: z.number().int().min(1).max(99).nullable(),
});

export const cartLineSchema = cartNeedSchema.extend({
  options: z.array(cartProductSchema).max(MAX_OPTIONS),
  selected: z.string().max(64).nullable(),
  count: z.number().int().min(1).max(99),
  include: z.boolean(),
  state: z.enum(["matched", "needs_review", "substitute", "unavailable"]),
  reason: z.string().max(300).nullable(),
  approved: z.boolean(),
}).refine((l) => l.selected === null || l.options.some((o) => o.productId === l.selected), "Selected product must be one of the options");

export const cartLinesSchema = z.array(cartLineSchema).max(150);

export const cartMatchRequestSchema = z.object({
  retailer: z.string().min(1).max(30),
  storeId: z.string().regex(/^[0-9A-Za-z-]{1,20}$/).nullable(),
  needs: z.array(cartNeedSchema).min(1).max(150),
});

export const transferResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cart_confirmed"), added: z.number().int().nonnegative().nullable(), checkoutUrl: z.string().url().nullable(), confirmedBy: z.enum(["retailer_api", "mock", "household"]), at: z.string() }),
  z.object({ kind: z.literal("link"), url: z.string().url(), label: z.string().max(120), at: z.string() }),
]);

/** Pounds for an item sold by weight; whole units otherwise. */
export function unitsLabel(line: Pick<CartLine, "count">, product: Pick<CartProduct, "soldByWeight"> | null): string {
  if (product?.soldByWeight) return `${line.count} lb`;
  return `${line.count}`;
}

export const cartDraftSchema = z.object({
  id: z.string().uuid(),
  retailer: z.string().min(2).max(30),
  storeId: z.string().max(20).nullable(),
  storeName: z.string().max(160).nullable(),
  fulfillment: z.enum(["pickup", "delivery"]),
  lines: z.array(z.unknown()).max(150),
  status: z.enum(["draft", "approved", "sending", "sent", "link_ready", "failed", "unknown"]),
  version: z.number().int().positive(),
  createdBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  transferKey: z.string().nullable(),
  result: transferResultSchema.nullable(),
  lastError: z.string().nullable(),
  purchase: z.enum(["not_ordered", "ordered"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A stored draft → CartDraft, or null if anything in it doesn't validate (never silently drops lines). */
export function parseCartDraft(raw: unknown): CartDraft | null {
  const d = cartDraftSchema.safeParse(raw);
  if (!d.success) return null;
  const lines = cartLinesSchema.safeParse(d.data.lines);
  if (!lines.success) return null;
  return { ...d.data, lines: lines.data as CartLine[] } as CartDraft;
}
