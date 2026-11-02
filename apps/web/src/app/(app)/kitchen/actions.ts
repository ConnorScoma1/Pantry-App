"use server";

import { createSupabaseKitchenRepository, type KitchenRepository, type Result } from "@kitchen-pantry/database";
import type { IngredientOption, PantryItem } from "@kitchen-pantry/shared-types";
import { lookupBarcode, type BarcodeLookup } from "@/lib/kitchen/import-server";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * My Kitchen server actions — thin wrappers over the shared repository in
 * @kitchen-pantry/database (the mobile app uses the same code). Each call
 * runs as the signed-in user, so row-level security applies.
 */
async function repository(): Promise<{ repo: KitchenRepository } | { error: string }> {
  if (!isSupabaseConfigured) return { error: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please sign in again." };
  return { repo: createSupabaseKitchenRepository(asSupabaseLike(supabase)) };
}

async function run<T>(fn: (repo: KitchenRepository) => Promise<Result<T>>): Promise<Result<T>> {
  const r = await repository();
  if ("error" in r) return { ok: false, message: r.error };
  return fn(r.repo);
}

export async function listPantryItemsAction(): Promise<Result<PantryItem[]>> {
  return run((repo) => repo.list());
}

export async function addPantryItemAction(input: unknown, origin?: unknown): Promise<Result<PantryItem>> {
  return run((repo) => repo.add(input, origin));
}

export async function addPantryItemsAction(inputs: unknown, origin?: unknown): Promise<Result<PantryItem[]>> {
  return run((repo) => repo.addMany(inputs, origin));
}

/** Who's asking, for per-person limits ("preview" without accounts). */
async function who(): Promise<string | null> {
  if (!isSupabaseConfigured) return "preview";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function lookupBarcodeAction(code: unknown, format?: unknown): Promise<Result<BarcodeLookup>> {
  const id = await who();
  if (!id) return { ok: false, message: "Your session expired. Please sign in again." };
  return lookupBarcode(code, id, format);
}

export async function updatePantryItemAction(id: unknown, input: unknown): Promise<Result<PantryItem>> {
  return run((repo) => repo.update(id, input));
}

export async function removePantryItemAction(id: unknown, reason: unknown): Promise<Result<null>> {
  return run((repo) => repo.remove(id, reason));
}

export async function addStaplesAction(names: unknown): Promise<Result<PantryItem[]>> {
  return run((repo) => repo.addStaples(names));
}

export async function searchIngredientsAction(query: unknown): Promise<Result<IngredientOption[]>> {
  return run((repo) => repo.searchIngredients(query));
}
