"use server";

import { createSupabaseShoppingRepository, type Result, type ShoppingRepository } from "@kitchen-pantry/database";
import type { ActiveTrip, SavedShopping } from "@kitchen-pantry/shopping-optimizer";
import { adviseShopping, compareShopping, shoppingStatus, type CompareResult, type ShoppingAdviceResult, type ShoppingStatus } from "@/lib/shopping/server";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * One Store vs. Best Deals server actions. Comparisons run here (keys stay
 * on the server). Settings and the chosen trip are saved as the signed-in
 * user, so row-level security applies; in preview mode the browser keeps them.
 */
async function session() {
  if (!isSupabaseConfigured) return { who: "preview", db: null };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { who: user.id, db: asSupabaseLike(supabase) } : null;
}

const expired = { ok: false as const, message: "Your session expired. Please sign in again." };

export async function shoppingStatusAction(): Promise<ShoppingStatus> {
  return shoppingStatus();
}

export async function compareShoppingAction(request: unknown): Promise<Result<CompareResult>> {
  const s = await session();
  if (!s) return expired;
  return compareShopping(request, s.who);
}

export async function adviseShoppingAction(token: unknown): Promise<Result<ShoppingAdviceResult>> {
  const s = await session();
  if (!s) return expired;
  return adviseShopping(token, s.who, s.db);
}

async function repo<T>(fn: (r: ShoppingRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const s = await session();
  if (!s || !s.db) return expired;
  return fn(createSupabaseShoppingRepository(s.db));
}

export async function getShoppingSettingsAction(): Promise<Result<SavedShopping>> {
  return repo((r) => r.getSettings());
}
export async function saveShoppingSettingsAction(input: unknown): Promise<Result<SavedShopping>> {
  return repo((r) => r.saveSettings(input));
}
export async function activeTripAction(): Promise<Result<ActiveTrip | null>> {
  return repo((r) => r.activeTrip());
}
export async function saveTripAction(input: unknown): Promise<Result<{ id: string }>> {
  return repo((r) => r.saveTrip(input));
}
export async function endTripAction(id: unknown, status: unknown): Promise<Result<null>> {
  if (typeof id !== "string" || (status !== "done" && status !== "cancelled")) return { ok: false, message: "That trip isn't valid." };
  return repo((r) => r.endTrip(id, status));
}
