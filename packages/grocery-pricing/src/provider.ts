import type { PriceStatus, Quantity } from "@kitchen-pantry/shared-types";

/**
 * Common contract every pricing source implements — authorized retailer
 * APIs, licensed data providers, or the clearly-labelled mock provider.
 * Providers return raw observations; status classification happens here in
 * one place so no provider can label its own data "verified".
 */

export interface ProductSearchQuery {
  /** Plain ingredient name, e.g. "broccoli crowns". */
  text: string;
  storeId: string;
  limit?: number;
}

export interface RetailerProduct {
  provider: string;
  retailer: string;
  externalProductId: string;
  name: string;
  brand: string | null;
  /** Null when the retailer's size text can't be read (never guessed). */
  packageSize: Quantity | null;
  /** The retailer's own size text, e.g. "5 oz" — shown to the shopper. */
  sizeLabel?: string | null;
  /** Priced per pound at the register (loose produce, deli). */
  soldByWeight?: boolean;
  upc: string | null;
  /** Retailer's page for the product, when the source provides one. */
  pageUrl?: string | null;
}

export type Availability = "in_stock" | "limited" | "out_of_stock" | "unknown";

export interface PriceObservation {
  externalProductId: string;
  storeId: string;
  /** Regular shelf price for one package, in cents. */
  priceCents: number;
  /** Promotional price if the provider reports one. */
  promoPriceCents: number | null;
  promoDescription: string | null;
  /** Last day of the promotion (YYYY-MM-DD), only when the source states it. */
  promoEndsOn?: string | null;
  /** Provider-reported unit price (cents per `unitPriceUnit`), when given. */
  unitPriceCents: number | null;
  unitPriceUnit: string | null;
  availability: Availability;
  /** When the provider says the price was current. */
  observedAt: Date;
}

export interface PricingProvider {
  readonly id: string;
  readonly displayName: string;
  /** Mock/sample providers can never produce verified or cached prices. */
  readonly isMock: boolean;
  /** Whether the provider's prices are specific to a store location. */
  readonly storeSpecific: boolean;
  searchProducts(query: ProductSearchQuery): Promise<RetailerProduct[]>;
  getPrices(storeId: string, externalProductIds: string[]): Promise<PriceObservation[]>;
  /** Optional: search and price in one call when the retailer returns both together. */
  searchPriced?(query: ProductSearchQuery): Promise<PricedProduct[]>;
}

export interface PricedProduct {
  product: RetailerProduct;
  /** Null when the store doesn't report a price for it. */
  observation: PriceObservation | null;
}

export type PricingErrorKind = "not_configured" | "auth" | "rate_limited" | "unavailable" | "bad_response" | "bad_request";

export class PricingProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
    options?: { cause?: unknown; kind?: PricingErrorKind },
  ) {
    super(message, options);
    this.name = "PricingProviderError";
    this.kind = options?.kind ?? (retryable ? "unavailable" : "bad_response");
  }
  readonly kind: PricingErrorKind;
}

export interface FreshnessPolicy {
  /** Max age for a store-specific price to count as "verified". */
  verifiedMaxAgeMs: number;
  /** Max age for a store-specific price to count as "recent/cached". */
  cachedMaxAgeMs: number;
}

export const DEFAULT_FRESHNESS: FreshnessPolicy = {
  verifiedMaxAgeMs: 6 * 60 * 60 * 1000, // 6 hours
  cachedMaxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/** Decide how a price may be described to the user. */
export function classifyPrice(
  observation: Pick<PriceObservation, "observedAt"> | null,
  provider: Pick<PricingProvider, "isMock" | "storeSpecific">,
  now: Date = new Date(),
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
): PriceStatus {
  if (!observation) return "unavailable";
  if (provider.isMock || !provider.storeSpecific) return "estimated";
  const age = now.getTime() - observation.observedAt.getTime();
  if (age < 0) return "estimated"; // clock skew / bad data: don't over-claim
  if (age <= policy.verifiedMaxAgeMs) return "verified";
  if (age <= policy.cachedMaxAgeMs) return "cached";
  return "estimated";
}
