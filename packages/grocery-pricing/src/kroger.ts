import type { Quantity } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import {
  PricingProviderError,
  type Availability,
  type PriceObservation,
  type PricedProduct,
  type PricingProvider,
  type ProductSearchQuery,
  type RetailerProduct,
} from "./provider";

/**
 * Kroger Developer API (Kroger-family stores: Kroger, Ralphs, Fred Meyer,
 * King Soopers, Harris Teeter, Pick 'n Save, Mariano's and others).
 *
 * SERVER ONLY: the client secret must never reach a browser or the phone.
 * Uses the OAuth2 client-credentials flow (public product and store data,
 * no shopper account). Prices exist only relative to a store (locationId).
 * Every response is validated; anything unreadable is dropped, never guessed.
 *
 * Request shapes follow Kroger's public API as used by the kroger-api
 * client (github.com/CupOfOwls/kroger-api): /v1/connect/oauth2/token,
 * /v1/locations?filter.zipCode.near=…, /v1/products?filter.term=…&filter.locationId=…
 */

export interface KrogerConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export const KROGER_PROVIDER_ID = "kroger";
const DEFAULT_BASE = "https://api.kroger.com";

// ---------------------------------------------------------------------------
// Response schemas (only the fields we use; extra fields are ignored)
// ---------------------------------------------------------------------------
const money = z.number().finite().nonnegative();
const itemSchema = z.object({
  itemId: z.string().optional(),
  size: z.string().optional(),
  soldBy: z.string().optional(),
  price: z
    .object({
      regular: money.optional(),
      promo: money.optional(),
      // Optional: used only when Kroger includes it; never assumed.
      expirationDate: z.object({ value: z.string().max(40) }).partial().optional(),
    })
    .optional(),
  inventory: z.object({ stockLevel: z.string().optional() }).optional(),
});
const productSchema = z.object({
  productId: z.string().min(1).max(40),
  upc: z.string().max(40).optional(),
  description: z.string().min(1).max(300),
  brand: z.string().max(120).optional(),
  items: z.array(itemSchema).optional(),
  productPageURI: z.string().max(400).optional(),
});
const productsResponse = z.object({ data: z.array(z.unknown()) });

const locationSchema = z.object({
  locationId: z.string().min(1).max(20),
  chain: z.string().max(60).optional(),
  name: z.string().max(160).optional(),
  address: z
    .object({
      addressLine1: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(40).optional(),
      zipCode: z.string().max(12).optional(),
    })
    .optional(),
  geolocation: z.object({ latitude: z.number().optional(), longitude: z.number().optional() }).optional(),
  hours: z.record(z.string(), z.unknown()).optional(),
});
const locationsResponse = z.object({ data: z.array(z.unknown()) });
const tokenResponse = z.object({ access_token: z.string().min(1), expires_in: z.number().positive().optional() });

export interface KrogerStore {
  provider: "kroger";
  locationId: string;
  chain: string | null;
  name: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  /** Opening hours as Kroger publishes them; null when the response has none. */
  hours?: StoreHours | null;
}

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A store's weekly hours in its own time zone ("HH:MM", 24-hour). */
export interface StoreHours {
  timezone: string | null;
  open24: boolean;
  days: Partial<Record<Weekday, { open: string; close: string; open24: boolean } | null>>;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const daySchema = z.object({ open: z.string().optional(), close: z.string().optional(), open24: z.boolean().optional() });

/** Kroger's `hours` object → StoreHours. Unreadable days are left out (unknown), never guessed. */
export function parseStoreHours(raw: Record<string, unknown> | undefined): StoreHours | null {
  if (!raw) return null;
  const tz = typeof raw.timezone === "string" && /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(raw.timezone) ? raw.timezone : null;
  const open24 = raw.Open24 === true || raw.open24 === true;
  const days: StoreHours["days"] = {};
  for (const d of WEEKDAYS) {
    const parsed = daySchema.safeParse(raw[d]);
    if (!parsed.success) continue;
    const v = parsed.data;
    if (v.open24) days[d] = { open: "00:00", close: "24:00", open24: true };
    else if (v.open && v.close && HHMM.test(v.open) && HHMM.test(v.close)) days[d] = { open: v.open, close: v.close, open24: false };
  }
  if (!open24 && Object.keys(days).length === 0) return null;
  return { timezone: tz, open24, days };
}

// ---------------------------------------------------------------------------
// Size text → quantity ("16 oz", "1 gal", "12 ct", "1/2 gal", "2 lb / 32 oz")
// ---------------------------------------------------------------------------
const SIZE_UNITS: Record<string, string> = {
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  "fl oz": "fl_oz",
  "fl. oz": "fl_oz",
  floz: "fl_oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  liter: "l",
  litre: "l",
  gal: "gallon",
  gallon: "gallon",
  qt: "quart",
  quart: "quart",
  pt: "pint",
  pint: "pint",
  ct: "each",
  count: "each",
  each: "each",
  ea: "each",
  pk: "each",
  dozen: "dozen",
  doz: "dozen",
};

export function parseSize(text: string | null | undefined): Quantity | null {
  if (!text) return null;
  const first = text.toLowerCase().split(/\s+[/|]\s+|\s*,\s*(?=\d)/)[0]!.trim();
  if (/^each$/.test(first)) return { value: 1, unit: "each" };
  const m = /^(\d+(?:\.\d+)?|\d+\s*\/\s*\d+|\d+\s+\d+\s*\/\s*\d+)\s*(fl\.?\s*oz|[a-z]+)\.?\b/.exec(first);
  if (!m) return null;
  const raw = m[1]!.replace(/\s+/g, " ").trim();
  let value: number;
  if (raw.includes("/")) {
    const parts = raw.split(" ");
    const frac = parts.at(-1)!.split("/").map((x) => Number(x.trim()));
    const whole = parts.length > 1 ? Number(parts[0]) : 0;
    value = whole + frac[0]! / frac[1]!;
  } else value = Number(raw);
  const unit = SIZE_UNITS[/^fl/.test(m[2]!) ? "fl oz" : m[2]!];
  if (!unit || !Number.isFinite(value) || value <= 0) return null;
  return { value, unit };
}

function availabilityOf(stockLevel: string | undefined): Availability {
  switch ((stockLevel ?? "").toUpperCase()) {
    case "HIGH":
      return "in_stock";
    case "LOW":
      return "limited";
    case "TEMPORARILY_OUT_OF_STOCK":
      return "out_of_stock";
    default:
      return "unknown";
  }
}

const toCents = (dollars: number) => Math.round(dollars * 100);
const isoDay = (v: string | undefined): string | null => {
  const m = v ? /^(\d{4}-\d{2}-\d{2})/.exec(v) : null;
  return m ? m[1]! : null;
};

/** One Kroger product → our product + (store-specific) price. Exported for tests. */
export function toPricedProduct(raw: unknown, storeId: string, observedAt: Date): PricedProduct | null {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const item = p.items?.find((i) => i.price?.regular !== undefined) ?? p.items?.[0];
  const soldByWeight = (item?.soldBy ?? "").toUpperCase() === "WEIGHT";
  const product: RetailerProduct = {
    provider: KROGER_PROVIDER_ID,
    retailer: "kroger",
    externalProductId: p.productId,
    name: p.description,
    brand: p.brand ?? null,
    packageSize: soldByWeight ? { value: 1, unit: "lb" } : parseSize(item?.size),
    sizeLabel: item?.size ?? null,
    soldByWeight,
    upc: p.upc ?? null,
    pageUrl: p.productPageURI && /^\/p\/[\w\-/%.]+(\?[\w=&%.-]*)?$/.test(p.productPageURI) ? `https://www.kroger.com${p.productPageURI}` : null,
  };
  const regular = item?.price?.regular;
  if (regular === undefined || regular <= 0) return { product, observation: null };
  const promo = item?.price?.promo;
  const onSale = promo !== undefined && promo > 0 && promo < regular;
  return {
    product,
    observation: {
      externalProductId: p.productId,
      storeId,
      priceCents: toCents(regular),
      promoPriceCents: onSale ? toCents(promo) : null,
      promoDescription: onSale ? "Sale" : null,
      promoEndsOn: onSale ? isoDay(item?.price?.expirationDate?.value) : null,
      unitPriceCents: null,
      unitPriceUnit: null,
      availability: availabilityOf(item?.inventory?.stockLevel),
      observedAt,
    },
  };
}

export function toStore(raw: unknown): KrogerStore | null {
  const parsed = locationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const l = parsed.data;
  return {
    provider: "kroger",
    locationId: l.locationId,
    chain: l.chain ?? null,
    name: l.name ?? l.chain ?? "Kroger store",
    address: l.address?.addressLine1 ?? "",
    city: l.address?.city ?? "",
    region: l.address?.state ?? "",
    postalCode: l.address?.zipCode ?? "",
    latitude: l.geolocation?.latitude ?? null,
    longitude: l.geolocation?.longitude ?? null,
    hours: parseStoreHours(l.hours),
  };
}

/** Kroger store ids are short alphanumerics (8 characters today). */
export const KROGER_LOCATION_ID = /^[0-9A-Za-z]{4,20}$/;

/** Kroger rejects search terms longer than eight words. */
export function searchTerm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export class KrogerClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: KrogerConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new PricingProviderError("Kroger isn't configured.", KROGER_PROVIDER_ID, false, { kind: "not_configured" });
    }
    this.base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (cause) {
      throw new PricingProviderError("Couldn't reach Kroger.", KROGER_PROVIDER_ID, true, { cause, kind: "unavailable" });
    } finally {
      clearTimeout(timer);
    }
  }

  private async accessToken(): Promise<string> {
    const now = this.now().getTime();
    if (this.token && this.token.expiresAt - 60_000 > now) return this.token.value;
    const basic = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
    const res = await this.send(`${this.base}/v1/connect/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" }).toString(),
    });
    if (res.status === 401 || res.status === 400) {
      throw new PricingProviderError("Kroger rejected the API credentials.", KROGER_PROVIDER_ID, false, { kind: "auth" });
    }
    if (!res.ok) throw this.statusError(res.status);
    const parsed = tokenResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new PricingProviderError("Unexpected token response from Kroger.", KROGER_PROVIDER_ID, true, { kind: "bad_response" });
    this.token = { value: parsed.data.access_token, expiresAt: now + (parsed.data.expires_in ?? 1800) * 1000 };
    return this.token.value;
  }

  private statusError(status: number): PricingProviderError {
    if (status === 429) return new PricingProviderError("Kroger's daily request limit was reached.", KROGER_PROVIDER_ID, true, { kind: "rate_limited" });
    if (status >= 500) return new PricingProviderError("Kroger is having trouble right now.", KROGER_PROVIDER_ID, true, { kind: "unavailable" });
    return new PricingProviderError(`Kroger returned status ${status}.`, KROGER_PROVIDER_ID, false, { kind: "bad_request" });
  }

  async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = `${this.base}${path}?${new URLSearchParams(params).toString()}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.send(url, { headers: { Authorization: `Bearer ${await this.accessToken()}`, Accept: "application/json" } });
      if (res.status === 401 && attempt === 0) {
        this.token = null; // expired early: get a fresh one once
        continue;
      }
      if (!res.ok) throw this.statusError(res.status);
      return res.json().catch(() => {
        throw new PricingProviderError("Unreadable response from Kroger.", KROGER_PROVIDER_ID, true, { kind: "bad_response" });
      });
    }
    throw new PricingProviderError("Kroger rejected the API credentials.", KROGER_PROVIDER_ID, false, { kind: "auth" });
  }

  async findStores(input: { postalCode: string; radiusMiles?: number; limit?: number }): Promise<KrogerStore[]> {
    if (!/^\d{5}$/.test(input.postalCode)) {
      throw new PricingProviderError("Enter a 5-digit ZIP code.", KROGER_PROVIDER_ID, false, { kind: "bad_request" });
    }
    const body = await this.get("/v1/locations", {
      "filter.zipCode.near": input.postalCode,
      "filter.radiusInMiles": String(Math.min(Math.max(Math.round(input.radiusMiles ?? 10), 1), 100)),
      "filter.limit": String(Math.min(Math.max(input.limit ?? 10, 1), 50)),
    });
    const parsed = locationsResponse.safeParse(body);
    if (!parsed.success) throw new PricingProviderError("Unexpected store list from Kroger.", KROGER_PROVIDER_ID, true, { kind: "bad_response" });
    return parsed.data.data.map(toStore).filter((s): s is KrogerStore => s !== null);
  }

  async getStore(locationId: string): Promise<KrogerStore | null> {
    if (!KROGER_LOCATION_ID.test(locationId)) return null;
    const body = (await this.get(`/v1/locations/${encodeURIComponent(locationId)}`, {})) as { data?: unknown } | null;
    return toStore(body?.data);
  }

  async searchProducts(term: string, locationId: string, limit = 10): Promise<PricedProduct[]> {
    if (!KROGER_LOCATION_ID.test(locationId)) {
      throw new PricingProviderError("That store id isn't valid.", KROGER_PROVIDER_ID, false, { kind: "bad_request" });
    }
    const t = searchTerm(term);
    if (t.length < 2) return [];
    const body = await this.get("/v1/products", {
      "filter.term": t,
      "filter.locationId": locationId,
      "filter.limit": String(Math.min(Math.max(limit, 1), 50)),
    });
    const parsed = productsResponse.safeParse(body);
    if (!parsed.success) throw new PricingProviderError("Unexpected product list from Kroger.", KROGER_PROVIDER_ID, true, { kind: "bad_response" });
    const at = this.now();
    return parsed.data.data.map((p) => toPricedProduct(p, locationId, at)).filter((p): p is PricedProduct => p !== null);
  }
}

/** PricingProvider over the Kroger client. Prices are store-specific and live. */
export class KrogerPricingProvider implements PricingProvider {
  readonly id = KROGER_PROVIDER_ID;
  readonly displayName = "Kroger";
  readonly isMock = false;
  readonly storeSpecific = true;

  constructor(private readonly client: KrogerClient) {}

  async searchPriced(query: ProductSearchQuery): Promise<PricedProduct[]> {
    return this.client.searchProducts(query.text, query.storeId, query.limit ?? 10);
  }

  async searchProducts(query: ProductSearchQuery): Promise<RetailerProduct[]> {
    return (await this.searchPriced(query)).map((p) => p.product);
  }

  /** Kroger returns prices with search results; this re-reads them by product id. */
  async getPrices(storeId: string, externalProductIds: string[]): Promise<PriceObservation[]> {
    if (externalProductIds.length === 0) return [];
    const body = await this.client.get("/v1/products", {
      "filter.productId": externalProductIds.slice(0, 50).join(","),
      "filter.locationId": storeId,
    });
    const parsed = productsResponse.safeParse(body);
    if (!parsed.success) return [];
    const at = new Date();
    return parsed.data.data
      .map((p) => toPricedProduct(p, storeId, at)?.observation ?? null)
      .filter((o): o is PriceObservation => o !== null);
  }
}
