import "server-only";
import {
  createMemoryCache,
  KrogerClient,
  KrogerPricingProvider,
  priceBasket,
  PricingProviderError,
  pricingRequestSchema,
  findStoreSpecials,
  specialsRequestSchema,
  cartMatchRequestSchema,
  costRecipes,
  recipeCostRequestSchema,
  type RecipeCost,
  matchCart,
  SampleCatalogProvider,
  type CartLine,
  type CartNeed,
  type BasketPrice,
  type SpecialsResult,
  type KrogerStore,
} from "@kitchen-pantry/grocery-pricing";
import type { Result } from "@kitchen-pantry/database";

/**
 * Live store prices (Kroger Developer API). SERVER ONLY — the client secret
 * stays here. Browsers and phones send item names and amounts; prices only
 * ever come from Kroger, labelled with how old they are.
 */
const clientId = process.env.KROGER_CLIENT_ID ?? "";
const clientSecret = process.env.KROGER_CLIENT_SECRET ?? "";
const cacheMinutes = Math.min(Math.max(Number(process.env.PRICING_CACHE_MINUTES ?? 30) || 30, 0), 360);
const hourlyLimit = Math.max(Number(process.env.PRICING_HOURLY_LIMIT ?? 30) || 30, 1);

let client: KrogerClient | null = null;
function kroger(): KrogerClient | null {
  if (!clientId || !clientSecret) return null;
  client ??= new KrogerClient({ clientId, clientSecret });
  return client;
}

const searchCache = createMemoryCache(cacheMinutes * 60_000);
const storeCache = new Map<string, { at: number; stores: KrogerStore[] }>();
const usage = new Map<string, number[]>();

export interface PricingStatus {
  enabled: boolean;
  provider: "kroger" | null;
}

export function pricingStatus(): PricingStatus {
  return kroger() ? { enabled: true, provider: "kroger" } : { enabled: false, provider: null };
}

const NOT_CONFIGURED = "Store prices aren't connected yet. Add Kroger API keys on the server (see the README).";

function friendly(error: unknown): string {
  if (error instanceof PricingProviderError) {
    if (error.kind === "auth") return "The store price connection needs attention (Kroger rejected the API keys).";
    if (error.kind === "rate_limited") return "Kroger's daily price lookups are used up. Try again tomorrow.";
    if (error.kind === "bad_request") return error.message;
    return "Kroger isn't responding right now. Try again in a minute.";
  }
  console.error("[pricing] unexpected error", error);
  return "Couldn't load prices. Please try again.";
}

/** Simple per-user guard so one person can't use up the shared daily quota. */
function allow(key: string, now = Date.now()): boolean {
  const recent = (usage.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= hourlyLimit) {
    usage.set(key, recent);
    return false;
  }
  recent.push(now);
  usage.set(key, recent);
  return true;
}

export async function findStores(postalCode: unknown, who: string): Promise<Result<KrogerStore[]>> {
  const k = kroger();
  if (!k) return { ok: false, message: NOT_CONFIGURED };
  const zip = String(postalCode ?? "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) return { ok: false, message: "Enter a 5-digit ZIP code." };
  const hit = storeCache.get(zip);
  if (hit && Date.now() - hit.at < 24 * 3_600_000) return { ok: true, data: hit.stores };
  if (!allow(`stores:${who}`)) return { ok: false, message: "Too many store searches. Try again in a bit." };
  try {
    const stores = await k.findStores({ postalCode: zip, radiusMiles: 15, limit: 15 });
    storeCache.set(zip, { at: Date.now(), stores });
    return { ok: true, data: stores };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/** Confirms a store id with Kroger before the household saves it. */
export async function verifyStore(locationId: unknown): Promise<Result<KrogerStore>> {
  const k = kroger();
  if (!k) return { ok: false, message: NOT_CONFIGURED };
  const id = String(locationId ?? "");
  for (const { stores } of storeCache.values()) {
    const s = stores.find((x) => x.locationId === id);
    if (s) return { ok: true, data: s };
  }
  try {
    const store = await k.getStore(id);
    return store ? { ok: true, data: store } : { ok: false, message: "Kroger doesn't know that store." };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

export async function priceItems(request: unknown, who: string): Promise<Result<BasketPrice>> {
  const k = kroger();
  if (!k) return { ok: false, message: NOT_CONFIGURED };
  const parsed = pricingRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nothing to price." };
  if (!allow(`price:${who}`)) return { ok: false, message: "Prices were refreshed a lot this hour. Try again a little later." };
  try {
    const basket = await priceBasket({
      provider: new KrogerPricingProvider(k),
      storeId: parsed.data.storeId,
      needs: parsed.data.items,
      cache: searchCache,
    });
    // Nothing could be priced because Kroger failed: say why instead of showing an empty basket.
    if (basket.warning && basket.pricedCount === 0) return { ok: false, message: basket.warning };
    return { ok: true, data: basket };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/**
 * Specials at the household's store: products from the requested terms that
 * Kroger currently reports below their regular price. Each search is cached,
 * and one refresh counts once against the person's hourly limit.
 */
export async function findSpecials(request: unknown, who: string): Promise<Result<SpecialsResult>> {
  const k = kroger();
  if (!k) return { ok: false, message: NOT_CONFIGURED };
  const parsed = specialsRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nothing to look up." };
  if (parsed.data.terms.length === 0) return { ok: false, message: "Nothing to look up." };
  if (!allow(`specials:${who}`)) return { ok: false, message: "Specials were refreshed a lot this hour. Try again a little later." };
  try {
    const result = await findStoreSpecials({
      provider: new KrogerPricingProvider(k),
      storeId: parsed.data.storeId,
      terms: parsed.data.terms,
      cache: searchCache,
    });
    if (result.warning && result.specials.length === 0 && result.failed === result.checked) return { ok: false, message: result.warning };
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/**
 * Smart Cart: match the household's list to products at one retailer.
 * "mock" uses made-up sample products (labelled); "kroger" uses the store's
 * real products and prices. Counts once against the hourly limit.
 */
export async function matchCartItems(request: unknown, who: string): Promise<Result<{ lines: CartLine[]; warning: string | null }>> {
  const parsed = cartMatchRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nothing to match." };
  const { retailer, storeId, needs } = parsed.data;
  if (retailer === "mock") {
    return { ok: true, data: await matchCart({ provider: new SampleCatalogProvider(), storeId: "sample", needs: needs as CartNeed[] }) };
  }
  if (retailer !== "kroger") return { ok: false, message: "That retailer isn't available." };
  const k = kroger();
  if (!k) return { ok: false, message: NOT_CONFIGURED };
  if (!storeId || !/^[0-9A-Za-z]{4,20}$/.test(storeId)) return { ok: false, message: "Choose your Kroger store first." };
  if (!allow(`cart:${who}`)) return { ok: false, message: "Carts were rebuilt a lot this hour. Try again a little later." };
  try {
    const r = await matchCart({ provider: new KrogerPricingProvider(k), storeId, needs: needs as CartNeed[], cache: searchCache });
    if (r.warning && r.lines.every((l) => l.options.length === 0)) return { ok: false, message: r.warning };
    return { ok: true, data: r };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/**
 * Surprise Me "under $5 a serving": what each recipe's ingredients cost at
 * the store, for the amounts used. At most 8 recipes; one check counts once
 * against the hourly limit, and searches are shared with the grocery list's cache.
 */
export async function priceRecipes(request: unknown, who: string): Promise<Result<{ costs: RecipeCost[]; warning: string | null }>> {
  const k = kroger();
  if (!k) return { ok: false, message: NOT_CONFIGURED };
  const parsed = recipeCostRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nothing to price." };
  if (!allow(`recipe-costs:${who}`)) return { ok: false, message: "Prices were checked a lot this hour. Try again a little later." };
  try {
    const r = await costRecipes({ provider: new KrogerPricingProvider(k), storeId: parsed.data.storeId, recipes: parsed.data.recipes, cache: searchCache });
    if (r.warning && r.costs.every((c) => c.pricedCount === 0)) return { ok: false, message: r.warning };
    return { ok: true, data: r };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}
