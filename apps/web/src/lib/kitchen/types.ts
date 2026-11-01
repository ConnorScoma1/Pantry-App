import type { IngredientOption, PantryItem, RemovalReason } from "@kitchen-pantry/shared-types";
import type { PantryItemInput } from "@kitchen-pantry/validation";

export type Result<T> = { ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * One interface, two stores: Supabase (server actions, RLS) and the
 * browser-only preview store. UI code never knows which it is talking to.
 */
export interface KitchenRepository {
  list(): Promise<Result<PantryItem[]>>;
  add(input: PantryItemInput): Promise<Result<PantryItem>>;
  update(id: string, input: PantryItemInput): Promise<Result<PantryItem>>;
  remove(id: string, reason: RemovalReason): Promise<Result<null>>;
  /** Add staples by display name; returns the created items. */
  addStaples(names: string[]): Promise<Result<PantryItem[]>>;
  searchIngredients(query: string): Promise<Result<IngredientOption[]>>;
}
