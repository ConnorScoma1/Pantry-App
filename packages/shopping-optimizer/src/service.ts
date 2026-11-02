import { priceBasket, type PricingNeed, type PricingProvider, type SearchCache } from "@kitchen-pantry/grocery-pricing";
import { compareStrategies } from "./compare";
import { buildCostTable } from "./eligibility";
import { candidateStores, DEFAULT_MAX_PRICE_AGE_HOURS } from "./optimize";
import { RoutingError, type RoutingProvider } from "./routing";
import type { ComparisonResponse } from "./schema";
import type { LatLng, ShoppingSettings, ShoppingStore, StoreBasket, TravelMatrix } from "./types";

/**
 * The whole comparison in one call, for the server: price the list at each
 * store, get drive times for the stores that have coordinates, then compare.
 * Providers are passed in, so the same code runs against Kroger + Mapbox or
 * against the labelled sample stores.
 */
export interface RunComparisonInput {
  pricing: PricingProvider;
  stores: readonly ShoppingStore[];
  needs: readonly PricingNeed[];
  settings: ShoppingSettings;
  routing: RoutingProvider | null;
  start: LatLng | null;
  baselineStoreKey?: string | null;
  departAt?: Date | null;
  cache?: SearchCache;
  now?: () => Date;
}

export async function priceStores(input: Pick<RunComparisonInput, "pricing" | "stores" | "needs" | "cache" | "now">): Promise<StoreBasket[]> {
  const out: StoreBasket[] = [];
  // Two stores at a time; each basket already looks items up four at a time.
  for (let i = 0; i < input.stores.length; i += 2) {
    const batch = input.stores.slice(i, i + 2);
    out.push(
      ...(await Promise.all(
        batch.map(async (store): Promise<StoreBasket> => {
          try {
            const basket = await priceBasket({ provider: input.pricing, storeId: store.storeId, needs: input.needs, cache: input.cache, now: input.now });
            if (basket.pricedCount === 0 && basket.warning) return { store, basket: null, error: basket.warning };
            return { store, basket, error: null };
          } catch (error) {
            return { store, basket: null, error: error instanceof Error ? error.message : "Prices couldn't be loaded" };
          }
        }),
      )),
    );
  }
  return out;
}

export async function runComparison(input: RunComparisonInput): Promise<ComparisonResponse> {
  const now = (input.now ?? (() => new Date()))();
  const baskets = await priceStores(input);
  const itemIds = input.needs.map((n) => n.id);

  let travel: TravelMatrix | null = null;
  let travelError: string | null = null;
  if (input.routing && input.start) {
    // Route only the stores that will be compared and have coordinates.
    const c = candidateStores({ itemIds, baskets, settings: input.settings, travel: null, start: input.start, now });
    const stops = c.stores
      .filter((s) => s.isSample === input.routing!.isSample)
      .map((s) => (input.routing!.isSample ? { key: s.key, location: { lat: 0, lng: 0 } } : s.location ? { key: s.key, location: s.location } : null))
      .filter((s): s is { key: string; location: LatLng } => s !== null);
    if (stops.length) {
      try {
        travel = await input.routing.matrix(input.start, stops);
      } catch (error) {
        travelError = error instanceof RoutingError ? error.message : "Drive times couldn't be loaded.";
      }
    }
    if (stops.length < c.stores.length && !travelError) travelError = "Some stores have no map location, so trips that include them have no drive time.";
  }

  const result = compareStrategies({
    itemIds,
    baskets,
    settings: input.settings,
    travel,
    // The start still filters stores by radius when routing failed; travel is gated on the matrix.
    start: input.start,
    now,
    departAt: input.departAt ?? now,
    baselineStoreKey: input.baselineStoreKey ?? null,
  });
  if (input.start && !travel) {
    result.limitations = result.limitations.map((l) => (l.startsWith("Add a starting point") ? "Drive times aren't available, so fuel and travel time aren't included." : l));
  }
  // Per-item costs exactly as the optimiser used them (for the item-by-item view).
  const table = buildCostTable(
    baskets.filter((b) => result.stores.some((s) => s.key === b.store.key)),
    itemIds,
    input.settings,
    now,
    DEFAULT_MAX_PRICE_AGE_HOURS,
  );
  return {
    ...result,
    lines: [...table.costs.values()].flatMap((row) => [...row.values()]),
    travelError,
    travelProvider: travel && !travel.isSample ? (input.routing?.displayName ?? null) : null,
  };
}
