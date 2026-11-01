"use server";

import { normalizeForStorage, STAPLES } from "@kitchen-pantry/inventory-engine";
import type { IngredientOption, PantryItem, RemovalReason } from "@kitchen-pantry/shared-types";
import {
  issuesToFieldErrors,
  pantryItemIdSchema,
  pantryItemInputSchema,
  removalReasonSchema,
  type PantryItemInput,
} from "@kitchen-pantry/validation";
import { z } from "zod";
import type { Result } from "@/lib/kitchen/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * My Kitchen server actions. Every call validates input, runs as the signed-in
 * user (so row-level security applies), and returns a Result instead of
 * throwing. Inserts don't send household_id: the database defaults it to the
 * caller's active household, and the transaction log is written by trigger.
 */

const COLUMNS =
  "id, ingredient_id, name, category, quantity, unit, storage_location, purchased_on, use_by, opened_on, estimated_remaining_pct, price_paid_cents, is_staple, created_at, updated_at";

interface PantryRow {
  id: string;
  ingredient_id: string | null;
  name: string;
  category: PantryItem["category"];
  quantity: number | string | null;
  unit: string | null;
  storage_location: PantryItem["storageLocation"];
  purchased_on: string | null;
  use_by: string | null;
  opened_on: string | null;
  estimated_remaining_pct: number | null;
  price_paid_cents: number | null;
  is_staple: boolean;
  created_at: string;
  updated_at: string;
}

function toItem(row: PantryRow): PantryItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: row.category,
    // numeric columns arrive as strings from PostgREST
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    storageLocation: row.storage_location,
    purchasedOn: row.purchased_on,
    useBy: row.use_by,
    openedOn: row.opened_on,
    estimatedRemainingPct: row.estimated_remaining_pct,
    pricePaidCents: row.price_paid_cents,
    isStaple: row.is_staple,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(input: PantryItemInput) {
  const { normalizedQuantity, normalizedUnit } = normalizeForStorage(input.quantity, input.unit);
  return {
    ingredient_id: input.ingredientId,
    name: input.name,
    category: input.category,
    quantity: input.quantity,
    unit: input.quantity === null ? null : input.unit,
    normalized_quantity: normalizedQuantity,
    normalized_unit: normalizedUnit,
    storage_location: input.storageLocation,
    purchased_on: input.purchasedOn,
    use_by: input.useBy,
    opened_on: input.openedOn,
    estimated_remaining_pct: input.estimatedRemainingPct,
    price_paid_cents: input.pricePaidCents,
    is_staple: input.isStaple,
  };
}

async function client() {
  if (!isSupabaseConfigured) return { error: "Supabase isn't configured." } as const;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please sign in again." } as const;
  return { supabase } as const;
}

function failure(context: string, error: { code?: string; message?: string }): Result<never> {
  console.error(`[kitchen] ${context} failed`, { code: error.code, message: error.message });
  return { ok: false, message: "Something went wrong saving your kitchen. Please try again." };
}

export async function listPantryItemsAction(): Promise<Result<PantryItem[]>> {
  const c = await client();
  if ("error" in c) return { ok: false, message: c.error };
  const { data, error } = await c.supabase.from("pantry_items").select(COLUMNS).order("name").limit(2000);
  if (error) return failure("list", error);
  return { ok: true, data: (data as PantryRow[]).map(toItem) };
}

export async function addPantryItemAction(input: unknown): Promise<Result<PantryItem>> {
  const parsed = pantryItemInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };
  }
  const c = await client();
  if ("error" in c) return { ok: false, message: c.error };
  const { data, error } = await c.supabase
    .from("pantry_items")
    .insert({ ...toRow(parsed.data), source: "manual" })
    .select(COLUMNS)
    .single();
  if (error) return failure("add", error);
  return { ok: true, data: toItem(data as PantryRow) };
}

export async function updatePantryItemAction(id: unknown, input: unknown): Promise<Result<PantryItem>> {
  const itemId = pantryItemIdSchema.safeParse(id);
  const parsed = pantryItemInputSchema.safeParse(input);
  if (!itemId.success) return { ok: false, message: "That item no longer exists." };
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };
  }
  const c = await client();
  if ("error" in c) return { ok: false, message: c.error };
  const { data, error } = await c.supabase
    .from("pantry_items")
    .update(toRow(parsed.data))
    .eq("id", itemId.data)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return failure("update", error);
  if (!data) return { ok: false, message: "That item no longer exists." };
  return { ok: true, data: toItem(data as PantryRow) };
}

export async function removePantryItemAction(id: unknown, reason: unknown): Promise<Result<null>> {
  const itemId = pantryItemIdSchema.safeParse(id);
  const why = removalReasonSchema.safeParse(reason);
  if (!itemId.success || !why.success) return { ok: false, message: "That item no longer exists." };
  const c = await client();
  if ("error" in c) return { ok: false, message: c.error };
  const { error } = await c.supabase.rpc("pantry_remove_item", {
    item_id: itemId.data,
    reason: why.data satisfies RemovalReason,
  });
  if (error?.code === "P0002") return { ok: true, data: null }; // already gone
  if (error) return failure("remove", error);
  return { ok: true, data: null };
}

const stapleNamesSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(100);

export async function addStaplesAction(names: unknown): Promise<Result<PantryItem[]>> {
  const parsed = stapleNamesSchema.safeParse(names);
  if (!parsed.success) return { ok: false, message: "Pick at least one staple." };
  const defs = parsed.data
    .map((n) => STAPLES.find((s) => s.name === n.toLowerCase()))
    .filter((s): s is (typeof STAPLES)[number] => Boolean(s));
  if (defs.length === 0) return { ok: false, message: "Pick at least one staple." };

  const c = await client();
  if ("error" in c) return { ok: false, message: c.error };

  const { data: ingredients, error: lookupError } = await c.supabase
    .from("ingredients")
    .select("id, canonical_name")
    .in(
      "canonical_name",
      defs.map((d) => d.name),
    );
  if (lookupError) return failure("staples lookup", lookupError);
  const idByName = new Map((ingredients ?? []).map((i: { id: string; canonical_name: string }) => [i.canonical_name, i.id]));

  const rows = defs.map((d) => ({
    ingredient_id: idByName.get(d.name) ?? null,
    name: d.name.charAt(0).toUpperCase() + d.name.slice(1),
    category: d.category,
    storage_location: d.storageLocation,
    is_staple: true,
    source: "bulk_staple",
  }));
  const { data, error } = await c.supabase.from("pantry_items").insert(rows).select(COLUMNS);
  if (error) return failure("add staples", error);
  return { ok: true, data: (data as PantryRow[]).map(toItem) };
}

export async function searchIngredientsAction(query: unknown): Promise<Result<IngredientOption[]>> {
  const q = z.string().trim().min(1).max(60).safeParse(query);
  if (!q.success) return { ok: true, data: [] };
  const c = await client();
  if ("error" in c) return { ok: false, message: c.error };
  const { data, error } = await c.supabase.rpc("search_ingredients", { query: q.data, max_results: 8 });
  if (error) return failure("search", error);
  return {
    ok: true,
    data: (data as Array<{ id: string; canonical_name: string; category: IngredientOption["category"]; default_unit: string }>).map(
      (row) => {
        const staple = STAPLES.find((s) => s.name === row.canonical_name);
        return {
          id: row.id,
          name: row.canonical_name.charAt(0).toUpperCase() + row.canonical_name.slice(1),
          category: row.category,
          defaultUnit: row.default_unit,
          storageLocation: staple?.storageLocation ?? "pantry",
        };
      },
    ),
  };
}
