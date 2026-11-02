import type { BasketPrice, StoreHours } from "@kitchen-pantry/grocery-pricing";

/**
 * One Store vs. Best Deals (spec 03). Everything in this package is
 * deterministic: prices come from a pricing provider (BasketPrice per
 * store), distances and drive times come from a routing provider
 * (TravelMatrix). Nothing here estimates a price, a distance or a time on
 * its own — when an input is missing the result says so.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ShoppingStore {
  /** `${provider}:${storeId}` — unique across providers. */
  key: string;
  provider: string;
  storeId: string;
  /** Chain or banner, e.g. "Kroger", "Pick 'n Save". */
  retailer: string;
  name: string;
  address: string | null;
  location: LatLng | null;
  hours: StoreHours | null;
  /** Sample stores (practice mode) are never mixed with real ones. */
  isSample: boolean;
}

/** Prices for the list at one store, or why there are none. */
export interface StoreBasket {
  store: ShoppingStore;
  basket: BasketPrice | null;
  error: string | null;
}

export type MaxStops = 1 | 2 | 3 | 4;

/**
 * The shopper's own settings. Fuel price and value of time are theirs to
 * set — the app never guesses what gas costs. In-store minutes per stop is
 * also their own estimate and is always shown as "your setting".
 */
export interface ShoppingSettings {
  maxStops: MaxStops;
  radiusMiles: number;
  /** Most extra minutes (driving + in-store) they'll accept over one store; null = no limit. */
  maxExtraMinutes: number | null;
  /** Most total driving miles for the trip; null = no limit. */
  maxDriveMiles: number | null;
  /** What an hour of their time is worth, for Best Overall Value. */
  valueOfTimeCentsPerHour: number;
  /** What they pay for fuel; null = not set, so fuel cost isn't shown. */
  fuelCentsPerGallon: number | null;
  milesPerGallon: number | null;
  /** Parking, finding things, checkout — per store visited (their estimate). */
  minutesPerStop: number;
  returnHome: boolean;
  preferredStores: string[];
  excludedStores: string[];
  /** Retailers whose loyalty card they have (lower-case, e.g. "kroger"). */
  loyaltyRetailers: string[];
  /** Whether they clip digital coupons. */
  digitalCoupons: boolean;
}

export const DEFAULT_SETTINGS: ShoppingSettings = {
  maxStops: 2,
  radiusMiles: 10,
  maxExtraMinutes: null,
  maxDriveMiles: null,
  valueOfTimeCentsPerHour: 1500,
  fuelCentsPerGallon: null,
  milesPerGallon: 25,
  minutesPerStop: 15,
  returnHome: true,
  preferredStores: [],
  excludedStores: [],
  loyaltyRetailers: [],
  digitalCoupons: false,
};

/**
 * Drive times and distances from a routing provider. Point 0 is the
 * starting point; point i (1…n) is `storeKeys[i-1]`. null = unroutable.
 */
export interface TravelMatrix {
  provider: string;
  /** Sample routing is only used with sample stores, and is labelled. */
  isSample: boolean;
  observedAt: string;
  storeKeys: string[];
  seconds: (number | null)[][];
  meters: (number | null)[][];
}

export interface TripLeg {
  from: string; // "start" or a store key
  to: string; // a store key or "start"
  meters: number;
  seconds: number;
}

export interface TripTravel {
  provider: string;
  isSample: boolean;
  legs: TripLeg[];
  meters: number;
  driveSeconds: number;
  /** Drive time plus your in-store minutes per stop. */
  totalMinutes: number;
  /** Null when fuel price or mpg isn't set. */
  fuelCents: number | null;
}

/** What one item costs at a store, after promotion eligibility. */
export interface ItemCost {
  itemId: string;
  storeKey: string;
  cents: number;
  /** A sale price the shopper is eligible for was used. */
  onSale: boolean;
  /** Sale price exists but needs a card/coupon they haven't said they have. */
  saleNeedsMembership: boolean;
  /** Cents more than the sale price because the sale wasn't counted. */
  saleNotCountedCents: number;
  status: "verified" | "cached" | "estimated";
  assumedOnePackage: boolean;
  productName: string | null;
}

export interface TripStop {
  storeKey: string;
  itemIds: string[];
  subtotalCents: number;
  /** Store hours check at the estimated arrival; null when hours or travel are unknown. */
  openAtArrival: boolean | null;
  arrivalNote: string | null;
}

export interface TripPlan {
  /** Stores in visiting order (route order when travel is known). */
  storeKeys: string[];
  stops: TripStop[];
  groceryCents: number;
  pricedCount: number;
  itemCount: number;
  /** Items no store in this trip prices. */
  missingIds: string[];
  saleSavingsCents: number;
  /** Sale prices left out because they may need a card or coupon. */
  saleNotCountedCents: number;
  preferredCount: number;
  travel: TripTravel | null;
  /** grocery + fuel (when fuel is known). */
  cashCents: number | null;
  /** grocery + fuel + time × value of time (when travel is known). */
  valueCents: number | null;
  warnings: string[];
}

export type StrategyId = "one_store" | "best_deals" | "best_value";
export type Confidence = "complete" | "partial" | "insufficient";

export interface StrategyComparison {
  /** Items both trips price — savings are only ever counted on these. */
  comparableCount: number;
  grocerySavingsCents: number;
  extraFuelCents: number | null;
  netSavingsCents: number | null;
  extraMiles: number | null;
  extraMinutes: number | null;
  extraStops: number;
}

export interface ComparisonResult {
  stores: ShoppingStore[];
  /** Every single-store option, best first. */
  singles: TripPlan[];
  oneStore: TripPlan | null;
  bestDeals: TripPlan | null;
  bestValue: TripPlan | null;
  dealsVsOne: StrategyComparison | null;
  valueVsOne: StrategyComparison | null;
  confidence: Confidence;
  limitations: string[];
  recommendation: { strategy: StrategyId | null; text: string };
  travelAvailable: boolean;
  isSample: boolean;
  itemCount: number;
  oldestPriceAt: string | null;
  generatedAt: string;
}
