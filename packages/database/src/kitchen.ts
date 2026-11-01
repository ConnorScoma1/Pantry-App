import {
  displayName,
  normalizeForStorage,
  searchLocalIngredients,
  STAPLES,
} from "@kitchen-pantry/inventory-engine";
import type { IngredientOption, PantryItem, RemovalReason } from "@kitchen-pantry/shared-types";
import {
  issuesToFieldErrors,
  pantryItemIdSchema,
  pantryItemInputSchema,
  removalReasonSchema,
  type PantryItemInput,
} from "@kitchen-pantry/validation";
import { z } from "zod";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";

/**
 * My Kitchen data access, shared by the web app (server actions) and the
 * mobile app (direct, under row-level security). Two implementations of one
 * interface: Supabase and local device storage (preview mode).
 */
export interface KitchenRepository {
  list(): Promise<Result<PantryItem[]>>;
  add(input: unknown): Promise<Result<PantryItem>>;
  update(id: unknown, input: unknown): Promise<Result<PantryItem>>;
  remove(id: unknown, reason: unknown): Promise<Result<null>>;
  /** Add staples by name (from the staples checklist). */
  addStaples(names: unknown): Promise<Result<PantryItem[]>>;
  searchIngredients(query: unknown): Promise<Result<IngredientOption[]>>;
}

const SAVE_FAILED = "Something went wrong saving your kitchen. Please try again.";
const GONE = "That item no longer exists.";
const stapleNamesSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(100);
const searchSchema = z.string().trim().min(1).max(60);

export const PANTRY_COLUMNS =
  "id, ingredient_id, name, category, quantity, unit, storage_location, purchased_on, use_by, opened_on, estimated_remaining_pct, price_paid_cents, is_staple, created_at, updated_at";

export interface PantryRow {
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

export function pantryRowToItem(row: PantryRow): PantryItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: row.category,
    // Postgres numeric arrives as a string over PostgREST.
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

/** Columns written for an add/edit. household_id is defaulted by the database. */
export function pantryInputToRow(input: PantryItemInput) {
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

function invalid(error: z.ZodError): Result<never> {
  return { ok: false, message: "Please check the highlighted fields.", fieldErrors: issuesToFieldErrors(error) };
}

function stapleDefs(names: string[]) {
  return names
    .map((n) => STAPLES.find((s) => s.name === n.toLowerCase()))
    .filter((s): s is (typeof STAPLES)[number] => Boolean(s));
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export function createSupabaseKitchenRepository(db: SupabaseLike): KitchenRepository {
  return {
    async list() {
      const { data, error } = await db.from("pantry_items").select(PANTRY_COLUMNS).order("name").limit(2000);
      if (error) return dbFailure("pantry list", error, "We couldn't load your kitchen. Please try again.");
      return { ok: true, data: (data as PantryRow[]).map(pantryRowToItem) };
    },

    async add(input) {
      const parsed = pantryItemInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const { data, error } = await db
        .from("pantry_items")
        .insert({ ...pantryInputToRow(parsed.data), source: "manual" })
        .select(PANTRY_COLUMNS)
        .single();
      if (error) return dbFailure("pantry add", error, SAVE_FAILED);
      return { ok: true, data: pantryRowToItem(data as PantryRow) };
    },

    async update(id, input) {
      const itemId = pantryItemIdSchema.safeParse(id);
      if (!itemId.success) return { ok: false, message: GONE };
      const parsed = pantryItemInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const { data, error } = await db
        .from("pantry_items")
        .update(pantryInputToRow(parsed.data))
        .eq("id", itemId.data)
        .select(PANTRY_COLUMNS)
        .maybeSingle();
      if (error) return dbFailure("pantry update", error, SAVE_FAILED);
      if (!data) return { ok: false, message: GONE };
      return { ok: true, data: pantryRowToItem(data as PantryRow) };
    },

    async remove(id, reason) {
      const itemId = pantryItemIdSchema.safeParse(id);
      const why = removalReasonSchema.safeParse(reason);
      if (!itemId.success || !why.success) return { ok: false, message: GONE };
      const { error } = await db.rpc("pantry_remove_item", {
        item_id: itemId.data,
        reason: why.data satisfies RemovalReason,
      });
      if (error?.code === "P0002") return { ok: true, data: null }; // already gone
      if (error) return dbFailure("pantry remove", error, SAVE_FAILED);
      return { ok: true, data: null };
    },

    async addStaples(names) {
      const parsed = stapleNamesSchema.safeParse(names);
      const defs = parsed.success ? stapleDefs(parsed.data) : [];
      if (defs.length === 0) return { ok: false, message: "Pick at least one staple." };

      const lookup = await db
        .from("ingredients")
        .select("id, canonical_name")
        .in(
          "canonical_name",
          defs.map((d) => d.name),
        );
      if (lookup.error) return dbFailure("staples lookup", lookup.error, SAVE_FAILED);
      const idByName = new Map(
        ((lookup.data ?? []) as Array<{ id: string; canonical_name: string }>).map((i) => [i.canonical_name, i.id]),
      );

      const rows = defs.map((d) => ({
        ingredient_id: idByName.get(d.name) ?? null,
        name: displayName(d.name),
        category: d.category,
        storage_location: d.storageLocation,
        is_staple: true,
        source: "bulk_staple",
      }));
      const { data, error } = await db.from("pantry_items").insert(rows).select(PANTRY_COLUMNS);
      if (error) return dbFailure("staples add", error, SAVE_FAILED);
      return { ok: true, data: (data as PantryRow[]).map(pantryRowToItem) };
    },

    async searchIngredients(query) {
      const q = searchSchema.safeParse(query);
      if (!q.success) return { ok: true, data: [] };
      const { data, error } = await db.rpc("search_ingredients", { query: q.data, max_results: 8 });
      if (error) return dbFailure("ingredient search", error, "Search isn't available right now.");
      const rows = (data ?? []) as Array<{
        id: string;
        canonical_name: string;
        category: IngredientOption["category"];
        default_unit: string;
      }>;
      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          name: displayName(row.canonical_name),
          category: row.category,
          defaultUnit: row.default_unit,
          storageLocation: STAPLES.find((s) => s.name === row.canonical_name)?.storageLocation ?? "pantry",
        })),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Local device storage (preview mode)
// ---------------------------------------------------------------------------

export const LOCAL_PANTRY_KEY = "kp-preview-pantry-v1";

/** RFC 4122 v4 id. Uses crypto.randomUUID when the runtime has it. */
export function randomUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createLocalKitchenRepository(
  storage: KeyValueStorage,
  options: { now?: () => Date; newId?: () => string } = {},
): KitchenRepository {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUuid;

  async function load(): Promise<PantryItem[]> {
    try {
      const raw = await storage.getItem(LOCAL_PANTRY_KEY);
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? (value as PantryItem[]) : [];
    } catch {
      return [];
    }
  }

  async function save(items: PantryItem[]): Promise<void> {
    try {
      await storage.setItem(LOCAL_PANTRY_KEY, JSON.stringify(items));
    } catch {
      // Storage unavailable: changes last for this session only.
    }
  }

  function fromInput(input: PantryItemInput, base?: PantryItem): PantryItem {
    const stamp = now().toISOString();
    return {
      id: base?.id ?? newId(),
      ingredientId: input.ingredientId,
      name: input.name,
      category: input.category,
      quantity: input.quantity,
      unit: input.quantity === null ? null : input.unit,
      storageLocation: input.storageLocation,
      purchasedOn: input.purchasedOn,
      useBy: input.useBy,
      openedOn: input.openedOn,
      estimatedRemainingPct: input.estimatedRemainingPct,
      pricePaidCents: input.pricePaidCents,
      isStaple: input.isStaple,
      createdAt: base?.createdAt ?? stamp,
      updatedAt: stamp,
    };
  }

  return {
    async list() {
      return { ok: true, data: await load() };
    },
    async add(input) {
      const parsed = pantryItemInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const item = fromInput(parsed.data);
      await save([...(await load()), item]);
      return { ok: true, data: item };
    },
    async update(id, input) {
      const parsed = pantryItemInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const items = await load();
      const existing = items.find((i) => i.id === id);
      if (!existing) return { ok: false, message: GONE };
      const updated = fromInput(parsed.data, existing);
      await save(items.map((i) => (i.id === id ? updated : i)));
      return { ok: true, data: updated };
    },
    async remove(id, reason) {
      if (!removalReasonSchema.safeParse(reason).success) return { ok: false, message: GONE };
      await save((await load()).filter((i) => i.id !== id));
      return { ok: true, data: null };
    },
    async addStaples(names) {
      const parsed = stapleNamesSchema.safeParse(names);
      const defs = parsed.success ? stapleDefs(parsed.data) : [];
      if (defs.length === 0) return { ok: false, message: "Pick at least one staple." };
      const created = defs.map((s) =>
        fromInput({
          ingredientId: null,
          name: displayName(s.name),
          category: s.category,
          quantity: null,
          unit: null,
          storageLocation: s.storageLocation,
          purchasedOn: null,
          useBy: null,
          openedOn: null,
          estimatedRemainingPct: null,
          pricePaidCents: null,
          isStaple: true,
        }),
      );
      await save([...(await load()), ...created]);
      return { ok: true, data: created };
    },
    async searchIngredients(query) {
      const q = searchSchema.safeParse(query);
      return { ok: true, data: q.success ? searchLocalIngredients(q.data) : [] };
    },
  };
}
