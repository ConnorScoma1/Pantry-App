import type { CountryCode } from "@kitchen-pantry/shared-types";

/**
 * Integrations registry. This is the ONLY place that decides which
 * retailers the app may present as supported for store lookup or pricing.
 *
 * It is intentionally empty: no store-locator or pricing integration has
 * been verified for access, coverage, licensing and cost yet (Phase 5).
 * Until a provider is registered here, the UI must say store lookup is not
 * available rather than showing retailers as if they were.
 */

export interface StoreLocation {
  provider: string;
  retailerSlug: string;
  externalStoreId: string;
  name: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  distanceKm: number | null;
}

export interface StoreLocatorProvider {
  readonly id: string;
  readonly retailerSlugs: readonly string[];
  readonly countries: readonly CountryCode[];
  findStores(input: { postalCode: string; country: CountryCode; radiusKm: number }): Promise<StoreLocation[]>;
}

export interface IntegrationRegistry {
  storeLocators: StoreLocatorProvider[];
}

/** Register real providers here once access and licensing are confirmed. */
export const integrationRegistry: IntegrationRegistry = {
  storeLocators: [],
};

/** Retailers with a working store locator for the given country. */
export function supportedRetailers(country: CountryCode, registry = integrationRegistry): string[] {
  return [
    ...new Set(
      registry.storeLocators
        .filter((p) => p.countries.includes(country))
        .flatMap((p) => p.retailerSlugs),
    ),
  ];
}

export function hasStoreLookup(country: CountryCode, registry = integrationRegistry): boolean {
  return supportedRetailers(country, registry).length > 0;
}
export * from "./expo-push";
export * from "./email";
export * from "./open-food-facts";
export * from "./billing";
