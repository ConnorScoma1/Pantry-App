import type { PricingStore } from "@kitchen-pantry/shared-types";
import { pricingStoreSchema } from "@kitchen-pantry/validation";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";

/**
 * Which store the household's grocery list is priced at. Shared by the
 * household (any member can change it). Prices are never stored here.
 */
export interface StoreRepository {
  get(): Promise<Result<PricingStore | null>>;
  set(store: unknown): Promise<Result<PricingStore | null>>;
}

const COLUMNS = "id, pricing_provider, pricing_store_id, pricing_store_name, pricing_store_address, pricing_store_set_at";
interface Row {
  id: string;
  pricing_provider: string | null;
  pricing_store_id: string | null;
  pricing_store_name: string | null;
  pricing_store_address: string | null;
  pricing_store_set_at: string | null;
}

function fromRow(row: Row | null): PricingStore | null {
  if (!row || row.pricing_provider !== "kroger" || !row.pricing_store_id) return null;
  return {
    provider: "kroger",
    storeId: row.pricing_store_id,
    name: row.pricing_store_name ?? "Kroger store",
    address: row.pricing_store_address,
    setAt: row.pricing_store_set_at,
  };
}

export function createSupabaseStoreRepository(db: SupabaseLike): StoreRepository {
  async function household(): Promise<Result<string>> {
    const { data, error } = await db.rpc("current_household_id");
    if (error) return dbFailure("current household", error, "Couldn't load your store.");
    return typeof data === "string" ? { ok: true, data } : { ok: false, message: "Finish setting up your household first." };
  }
  return {
    async get() {
      const hh = await household();
      if (!hh.ok) return hh;
      const { data, error } = await db.from("households").select(COLUMNS).eq("id", hh.data).maybeSingle();
      if (error) return dbFailure("pricing store", error, "Couldn't load your store.");
      return { ok: true, data: fromRow(data as Row | null) };
    },
    async set(store) {
      const hh = await household();
      if (!hh.ok) return hh;
      let patch: Record<string, unknown>;
      if (store === null) {
        patch = { pricing_provider: null, pricing_store_id: null, pricing_store_name: null, pricing_store_address: null, pricing_store_set_at: null };
      } else {
        const parsed = pricingStoreSchema.safeParse(store);
        if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Choose a store from the list." };
        patch = {
          pricing_provider: parsed.data.provider,
          pricing_store_id: parsed.data.storeId,
          pricing_store_name: parsed.data.name,
          pricing_store_address: parsed.data.address,
          pricing_store_set_at: new Date().toISOString(),
        };
      }
      const { data, error } = await db.from("households").update(patch).eq("id", hh.data).select(COLUMNS).single();
      if (error) return dbFailure("save pricing store", error, "Couldn't save your store. Please try again.");
      return { ok: true, data: fromRow(data as Row) };
    },
  };
}

export const LOCAL_STORE_KEY = "kp-preview-store-v1";

export function createLocalStoreRepository(storage: KeyValueStorage, now: () => Date = () => new Date()): StoreRepository {
  return {
    async get() {
      try {
        const raw = await storage.getItem(LOCAL_STORE_KEY);
        const parsed = pricingStoreSchema.safeParse(raw ? JSON.parse(raw) : null);
        return { ok: true, data: parsed.success ? (parsed.data as PricingStore) : null };
      } catch {
        return { ok: true, data: null };
      }
    },
    async set(store) {
      if (store === null) {
        await storage.removeItem(LOCAL_STORE_KEY);
        return { ok: true, data: null };
      }
      const parsed = pricingStoreSchema.safeParse(store);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Choose a store from the list." };
      const value = { ...parsed.data, setAt: now().toISOString() } as PricingStore;
      try {
        await storage.setItem(LOCAL_STORE_KEY, JSON.stringify(value));
      } catch {
        return { ok: false, message: "Couldn't save your store." };
      }
      return { ok: true, data: value };
    },
  };
}
