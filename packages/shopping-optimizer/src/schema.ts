import { pricingRequestSchema } from "@kitchen-pantry/grocery-pricing";
import { z } from "zod";

/** Request and response shapes, checked on the server and again on the device. */

export const STORE_KEY = /^(kroger|sample):[0-9A-Za-z-]{4,20}$/;
const storeKey = z.string().regex(STORE_KEY);

export const shoppingSettingsSchema = z
  .object({
    maxStops: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    radiusMiles: z.number().min(1).max(50),
    maxExtraMinutes: z.number().int().min(0).max(240).nullable(),
    maxDriveMiles: z.number().min(1).max(200).nullable(),
    valueOfTimeCentsPerHour: z.number().int().min(0).max(50_000),
    fuelCentsPerGallon: z.number().int().min(50).max(2_000).nullable(),
    milesPerGallon: z.number().min(5).max(150).nullable(),
    minutesPerStop: z.number().int().min(0).max(90),
    returnHome: z.boolean(),
    preferredStores: z.array(storeKey).max(10),
    excludedStores: z.array(storeKey).max(20),
    loyaltyRetailers: z.array(z.string().regex(/^[a-z0-9 '&.-]{2,40}$/)).max(10),
    digitalCoupons: z.boolean(),
  })
  .strict();

export const startPointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("address"), text: z.string().trim().min(3).max(200) }),
  z.object({ kind: z.literal("point"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
]);
export type StartPoint = z.infer<typeof startPointSchema>;

export const compareRequestSchema = z
  .object({
    mode: z.enum(["live", "sample"]),
    items: pricingRequestSchema.shape.items.refine((items) => new Set(items.map((i) => i.id)).size === items.length, "Each list item can only be sent once."),
    /** Kroger location ids to compare (live mode). */
    storeIds: z.array(z.string().regex(/^[0-9A-Za-z]{4,20}$/)).max(6).default([]),
    start: startPointSchema.nullable().default(null),
    settings: shoppingSettingsSchema,
    baselineStoreKey: storeKey.nullable().default(null),
    /** ISO time the trip starts, for store hours (defaults to now). */
    departAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict();
export type CompareRequest = z.input<typeof compareRequestSchema>;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
const cents = z.number().int();
const hours = z
  .object({
    timezone: z.string().nullable(),
    open24: z.boolean(),
    days: z.record(z.string(), z.object({ open: z.string(), close: z.string(), open24: z.boolean() }).nullable()),
  })
  .nullable();
export const shoppingStoreSchema = z.object({
  key: z.string(),
  provider: z.string(),
  storeId: z.string(),
  retailer: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  hours,
  isSample: z.boolean(),
});
const travel = z
  .object({
    provider: z.string(),
    isSample: z.boolean(),
    legs: z.array(z.object({ from: z.string(), to: z.string(), meters: z.number().nonnegative(), seconds: z.number().nonnegative() })),
    meters: z.number().nonnegative(),
    driveSeconds: z.number().nonnegative(),
    totalMinutes: z.number().nonnegative(),
    fuelCents: cents.nullable(),
  })
  .nullable();
export const tripPlanSchema = z.object({
  storeKeys: z.array(z.string()).min(1).max(4),
  stops: z.array(
    z.object({
      storeKey: z.string(),
      itemIds: z.array(z.string()),
      subtotalCents: cents,
      openAtArrival: z.boolean().nullable(),
      arrivalNote: z.string().nullable(),
    }),
  ),
  groceryCents: cents.nonnegative(),
  pricedCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  missingIds: z.array(z.string()),
  saleSavingsCents: cents.nonnegative(),
  saleNotCountedCents: cents.nonnegative(),
  preferredCount: z.number().int().nonnegative(),
  travel,
  cashCents: cents.nullable(),
  valueCents: cents.nullable(),
  warnings: z.array(z.string()),
});
const comparison = z
  .object({
    comparableCount: z.number().int().nonnegative(),
    grocerySavingsCents: cents,
    extraFuelCents: cents.nullable(),
    netSavingsCents: cents.nullable(),
    extraMiles: z.number().nullable(),
    extraMinutes: z.number().nullable(),
    extraStops: z.number().int(),
  })
  .nullable();
const itemLine = z.object({
  itemId: z.string(),
  storeKey: z.string(),
  cents: cents.nonnegative(),
  onSale: z.boolean(),
  saleNeedsMembership: z.boolean(),
  saleNotCountedCents: cents.nonnegative(),
  status: z.enum(["verified", "cached", "estimated"]),
  assumedOnePackage: z.boolean(),
  productName: z.string().nullable(),
});
export const comparisonResultSchema = z.object({
  stores: z.array(shoppingStoreSchema),
  singles: z.array(tripPlanSchema),
  oneStore: tripPlanSchema.nullable(),
  bestDeals: tripPlanSchema.nullable(),
  bestValue: tripPlanSchema.nullable(),
  dealsVsOne: comparison,
  valueVsOne: comparison,
  confidence: z.enum(["complete", "partial", "insufficient"]),
  limitations: z.array(z.string()),
  recommendation: z.object({ strategy: z.enum(["one_store", "best_deals", "best_value"]).nullable(), text: z.string() }),
  travelAvailable: z.boolean(),
  isSample: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  oldestPriceAt: z.string().nullable(),
  generatedAt: z.string(),
  /** What each item costs at each store (for the item-by-item view). */
  lines: z.array(itemLine),
  /** Why routing wasn't used, when it was asked for. */
  travelError: z.string().nullable(),
  /** Who provided drive times ("Mapbox"), for attribution. */
  travelProvider: z.string().nullable(),
});
export type ComparisonResponse = z.infer<typeof comparisonResultSchema>;

/** A chosen trip, saved so the shared list can be shown store by store. */
export const saveTripSchema = z
  .object({
    strategy: z.enum(["one_store", "best_deals", "best_value"]),
    isSample: z.boolean(),
    stops: z
      .array(
        z.object({
          storeKey: storeKey,
          name: z.string().trim().min(1).max(160),
          address: z.string().trim().max(240).nullable(),
          itemIds: z.array(z.uuid()).max(80),
        }),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type SaveTripInput = z.infer<typeof saveTripSchema>;

/** What's saved per person: their settings, typed starting address and the stores they compare. */
export const savedShoppingSchema = z
  .object({
    settings: shoppingSettingsSchema,
    startAddress: z.string().trim().min(3).max(200).nullable(),
    compareStoreIds: z.array(z.string().regex(/^[0-9A-Za-z]{4,20}$/)).max(6),
  })
  .strict();
export type SavedShopping = z.infer<typeof savedShoppingSchema>;

/** The household's chosen trip, as read back. */
export interface ActiveTrip {
  id: string;
  strategy: "one_store" | "best_deals" | "best_value";
  createdAt: string;
  stops: Array<{ storeKey: string; name: string; address: string | null }>;
  /** itemId → storeKey */
  assignment: Record<string, string>;
}
