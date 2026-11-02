import {
  DEFAULT_SETTINGS,
  savedShoppingSchema,
  saveTripSchema,
  type ActiveTrip,
  type SavedShopping,
} from "@kitchen-pantry/shopping-optimizer";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";

/**
 * One Store vs. Best Deals (spec 03):
 *  - settings are PERSONAL (one row per person per household; only they can read it);
 *  - the chosen trip is SHARED: it says which list item is bought at which
 *    store, so everyone sees the list store by store. No prices are stored.
 */
export interface ShoppingRepository {
  getSettings(): Promise<Result<SavedShopping>>;
  saveSettings(input: unknown): Promise<Result<SavedShopping>>;
  activeTrip(): Promise<Result<ActiveTrip | null>>;
  saveTrip(input: unknown): Promise<Result<{ id: string }>>;
  endTrip(id: string, status: "done" | "cancelled"): Promise<Result<null>>;
}

export const DEFAULT_SAVED_SHOPPING: SavedShopping = { settings: DEFAULT_SETTINGS, startAddress: null, compareStoreIds: [] };

interface PrefRow {
  max_stops: number;
  radius_miles: number | string;
  max_extra_minutes: number | null;
  max_drive_miles: number | string | null;
  value_of_time_cents: number;
  fuel_cents_per_gallon: number | null;
  miles_per_gallon: number | string | null;
  minutes_per_stop: number;
  return_home: boolean;
  start_address: string | null;
  preferred_stores: string[];
  excluded_stores: string[];
  loyalty_retailers: string[];
  digital_coupons: boolean;
  compare_store_ids: string[];
}
const PREF_COLUMNS =
  "max_stops, radius_miles, max_extra_minutes, max_drive_miles, value_of_time_cents, fuel_cents_per_gallon, miles_per_gallon, minutes_per_stop, return_home, start_address, preferred_stores, excluded_stores, loyalty_retailers, digital_coupons, compare_store_ids";

const num = (v: number | string | null) => (v === null ? null : Number(v));

function fromPrefRow(r: PrefRow | null): SavedShopping {
  if (!r) return DEFAULT_SAVED_SHOPPING;
  const parsed = savedShoppingSchema.safeParse({
    settings: {
      maxStops: r.max_stops,
      radiusMiles: Number(r.radius_miles),
      maxExtraMinutes: r.max_extra_minutes,
      maxDriveMiles: num(r.max_drive_miles),
      valueOfTimeCentsPerHour: r.value_of_time_cents,
      fuelCentsPerGallon: r.fuel_cents_per_gallon,
      milesPerGallon: num(r.miles_per_gallon),
      minutesPerStop: r.minutes_per_stop,
      returnHome: r.return_home,
      preferredStores: r.preferred_stores ?? [],
      excludedStores: r.excluded_stores ?? [],
      loyaltyRetailers: r.loyalty_retailers ?? [],
      digitalCoupons: r.digital_coupons,
    },
    startAddress: r.start_address,
    compareStoreIds: r.compare_store_ids ?? [],
  });
  return parsed.success ? parsed.data : DEFAULT_SAVED_SHOPPING;
}

function toPrefRow(s: SavedShopping) {
  const x = s.settings;
  return {
    max_stops: x.maxStops,
    radius_miles: x.radiusMiles,
    max_extra_minutes: x.maxExtraMinutes,
    max_drive_miles: x.maxDriveMiles,
    value_of_time_cents: x.valueOfTimeCentsPerHour,
    fuel_cents_per_gallon: x.fuelCentsPerGallon,
    miles_per_gallon: x.milesPerGallon,
    minutes_per_stop: x.minutesPerStop,
    return_home: x.returnHome,
    start_address: s.startAddress,
    // Practice-mode sample stores are never saved to the database.
    preferred_stores: x.preferredStores.filter((k) => k.startsWith("kroger:")),
    excluded_stores: x.excludedStores.filter((k) => k.startsWith("kroger:")),
    loyalty_retailers: x.loyaltyRetailers,
    digital_coupons: x.digitalCoupons,
    compare_store_ids: s.compareStoreIds,
  };
}

interface TripRow {
  id: string;
  strategy: ActiveTrip["strategy"];
  created_at: string;
  shopping_trip_stops: Array<{ position: number; store_key: string; store_name: string; store_address: string | null }>;
  shopping_trip_items: Array<{ item_id: string; stop_position: number }>;
}

function fromTripRow(r: TripRow): ActiveTrip {
  const stops = [...r.shopping_trip_stops].sort((a, b) => a.position - b.position);
  const byPos = new Map(stops.map((s) => [s.position, s.store_key]));
  const assignment: Record<string, string> = {};
  for (const i of r.shopping_trip_items) {
    const k = byPos.get(i.stop_position);
    if (k) assignment[i.item_id] = k;
  }
  return { id: r.id, strategy: r.strategy, createdAt: r.created_at, stops: stops.map((s) => ({ storeKey: s.store_key, name: s.store_name, address: s.store_address })), assignment };
}

export function createSupabaseShoppingRepository(db: SupabaseLike): ShoppingRepository {
  async function who(): Promise<Result<{ household: string }>> {
    const { data, error } = await db.rpc("current_household_id");
    if (error) return dbFailure("current household", error, "Couldn't load your shopping settings.");
    return typeof data === "string" ? { ok: true, data: { household: data } } : { ok: false, message: "Finish setting up your household first." };
  }
  return {
    async getSettings() {
      const w = await who();
      if (!w.ok) return w;
      // RLS returns only the caller's own row.
      const { data, error } = await db.from("shopping_preferences").select(PREF_COLUMNS).eq("household_id", w.data.household).maybeSingle();
      if (error) return dbFailure("shopping settings", error, "Couldn't load your shopping settings.");
      return { ok: true, data: fromPrefRow(data as PrefRow | null) };
    },
    async saveSettings(input) {
      const parsed = savedShoppingSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your shopping settings." };
      const w = await who();
      if (!w.ok) return w;
      const { data, error } = await db
        .from("shopping_preferences")
        .upsert({ household_id: w.data.household, ...toPrefRow(parsed.data) }, { onConflict: "user_id,household_id" })
        .select(PREF_COLUMNS)
        .single();
      if (error) return dbFailure("save shopping settings", error, "Couldn't save your shopping settings.");
      return { ok: true, data: fromPrefRow(data as PrefRow) };
    },
    async activeTrip() {
      const w = await who();
      if (!w.ok) return w;
      const { data, error } = await db
        .from("shopping_trips")
        .select("id, strategy, created_at, shopping_trip_stops(position, store_key, store_name, store_address), shopping_trip_items(item_id, stop_position)")
        .eq("household_id", w.data.household)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return dbFailure("active trip", error, "Couldn't load your shopping trip.");
      return { ok: true, data: data ? fromTripRow(data as TripRow) : null };
    },
    async saveTrip(input) {
      const parsed = saveTripSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That trip isn't valid." };
      if (parsed.data.isSample || parsed.data.stops.some((s) => !s.storeKey.startsWith("kroger:")))
        return { ok: false, message: "Practice comparisons can't organise your real list. Compare real stores first." };
      const { data, error } = await db.rpc("save_shopping_trip", {
        payload: { strategy: parsed.data.strategy, stops: parsed.data.stops.map((s) => ({ storeKey: s.storeKey, name: s.name, address: s.address, itemIds: s.itemIds })) },
      });
      if (error) {
        const known = /items aren't on your list|only be bought at one store|Too many trips|no shopping list/i.exec(error.message ?? "");
        return known ? { ok: false, message: error.message! } : dbFailure("save trip", error, "Couldn't save your trip. Please try again.");
      }
      return typeof data === "string" ? { ok: true, data: { id: data } } : { ok: false, message: "Couldn't save your trip." };
    },
    async endTrip(id, status) {
      const { data, error } = await db.rpc("end_shopping_trip", { target: id, new_status: status });
      if (error) return dbFailure("end trip", error, "Couldn't update your trip.");
      return data ? { ok: true, data: null } : { ok: false, message: "That trip isn't active any more." };
    },
  };
}

export const LOCAL_SHOPPING_KEY = "kp-preview-shopping-v1";
export const LOCAL_TRIP_KEY = "kp-preview-trip-v1";

/** Preview mode: this device only. Practice trips with sample stores are allowed here. */
export function createLocalShoppingRepository(storage: KeyValueStorage, now: () => Date = () => new Date()): ShoppingRepository {
  const read = async <T>(key: string): Promise<T | null> => {
    try {
      const raw = await storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const write = async (key: string, value: unknown): Promise<boolean> => {
    try {
      await storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  return {
    async getSettings() {
      const parsed = savedShoppingSchema.safeParse(await read(LOCAL_SHOPPING_KEY));
      return { ok: true, data: parsed.success ? parsed.data : DEFAULT_SAVED_SHOPPING };
    },
    async saveSettings(input) {
      const parsed = savedShoppingSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your shopping settings." };
      return (await write(LOCAL_SHOPPING_KEY, parsed.data)) ? { ok: true, data: parsed.data } : { ok: false, message: "Couldn't save your shopping settings." };
    },
    async activeTrip() {
      const t = await read<ActiveTrip>(LOCAL_TRIP_KEY);
      return { ok: true, data: t && typeof t.id === "string" && Array.isArray(t.stops) && t.assignment ? t : null };
    },
    async saveTrip(input) {
      const parsed = saveTripSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That trip isn't valid." };
      const seen = new Set<string>();
      for (const s of parsed.data.stops) for (const id of s.itemIds) {
        if (seen.has(id)) return { ok: false, message: "An item can only be bought at one store." };
        seen.add(id);
      }
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      const trip: ActiveTrip = {
        id,
        strategy: parsed.data.strategy,
        createdAt: now().toISOString(),
        stops: parsed.data.stops.map((s) => ({ storeKey: s.storeKey, name: s.name, address: s.address })),
        assignment: Object.fromEntries(parsed.data.stops.flatMap((s) => s.itemIds.map((i) => [i, s.storeKey]))),
      };
      return (await write(LOCAL_TRIP_KEY, trip)) ? { ok: true, data: { id } } : { ok: false, message: "Couldn't save your trip." };
    },
    async endTrip() {
      try {
        await storage.removeItem(LOCAL_TRIP_KEY);
      } catch {
        // ignore
      }
      return { ok: true, data: null };
    },
  };
}
