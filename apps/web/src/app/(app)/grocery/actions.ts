"use server";

import { createSupabaseGroceryRepository, createSupabaseStoreRepository, type GroceryRepository, type Result } from "@kitchen-pantry/database";
import type { BasketPrice, KrogerStore } from "@kitchen-pantry/grocery-pricing";
import type { GroceryItem, PricingStore } from "@kitchen-pantry/shared-types";
import { findStores, priceItems, pricingStatus, verifyStore, type PricingStatus } from "@/lib/pricing/server";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Shared grocery list server actions. Each runs as the signed-in user, so
 * row-level security limits it to their household's list, and the
 * database records who added or checked each item.
 */
async function run<T>(fn: (repo: GroceryRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Please sign in again." };
  return fn(createSupabaseGroceryRepository(asSupabaseLike(supabase)));
}

const listId = (v: unknown) => (typeof v === "string" ? v : "");

export async function currentListAction(): Promise<Result<{ id: string }>> {
  return run((r) => r.currentList());
}
export async function listItemsAction(id: unknown): Promise<Result<GroceryItem[]>> {
  return run((r) => r.items(listId(id)));
}
export async function addItemAction(id: unknown, input: unknown): Promise<Result<GroceryItem>> {
  return run((r) => r.add(listId(id), input));
}
export async function updateItemAction(id: unknown, patch: unknown): Promise<Result<GroceryItem>> {
  return run((r) => r.update(id, patch));
}
export async function setCheckedAction(id: unknown, checked: unknown): Promise<Result<GroceryItem>> {
  return run((r) => r.setChecked(id, checked === true));
}
export async function removeItemAction(id: unknown): Promise<Result<null>> {
  return run((r) => r.remove(id));
}
export async function clearCheckedAction(id: unknown): Promise<Result<null>> {
  return run((r) => r.clearChecked(listId(id)));
}
export async function replacePlanItemsAction(id: unknown, lines: unknown, planId: unknown): Promise<Result<{ added: number }>> {
  return run((r) => r.replacePlanItems(listId(id), lines, typeof planId === "string" ? planId : null));
}

// ---------------------------------------------------------------------------
// Store prices. In preview mode (no Supabase) these still work when the
// server has Kroger keys; the store choice is then kept in the browser.
// ---------------------------------------------------------------------------
async function who(): Promise<string | null> {
  if (!isSupabaseConfigured) return "preview";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function pricingStatusAction(): Promise<PricingStatus> {
  return pricingStatus();
}

export async function findStoresAction(zip: unknown): Promise<Result<KrogerStore[]>> {
  const id = await who();
  if (!id) return { ok: false, message: "Your session expired. Please sign in again." };
  return findStores(zip, id);
}

export async function priceListAction(request: unknown): Promise<Result<BasketPrice>> {
  const id = await who();
  if (!id) return { ok: false, message: "Your session expired. Please sign in again." };
  return priceItems(request, id);
}

export async function getStoreAction(): Promise<Result<PricingStore | null>> {
  if (!isSupabaseConfigured) return { ok: true, data: null };
  const supabase = await createSupabaseServerClient();
  return createSupabaseStoreRepository(asSupabaseLike(supabase)).get();
}

/** Check the store with Kroger, then save it for the household (Supabase) or return it (preview). */
export async function setStoreAction(locationId: unknown): Promise<Result<PricingStore | null>> {
  const id = await who();
  if (!id) return { ok: false, message: "Your session expired. Please sign in again." };
  if (locationId === null) {
    if (!isSupabaseConfigured) return { ok: true, data: null };
    const supabase = await createSupabaseServerClient();
    return createSupabaseStoreRepository(asSupabaseLike(supabase)).set(null);
  }
  const verified = await verifyStore(locationId);
  if (!verified.ok) return verified;
  const s = verified.data;
  const store = {
    provider: "kroger" as const,
    storeId: s.locationId,
    name: s.name,
    address: [s.address, s.city, s.region].filter(Boolean).join(", ") || null,
    setAt: new Date().toISOString(),
  };
  if (!isSupabaseConfigured) return { ok: true, data: store };
  const supabase = await createSupabaseServerClient();
  return createSupabaseStoreRepository(asSupabaseLike(supabase)).set(store);
}
