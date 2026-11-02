import type { GroceryDepartment, GroceryItem, Quantity } from "@kitchen-pantry/shared-types";
import { groceryDepartments } from "@kitchen-pantry/shared-types";
import { groceryItemInputSchema, groceryItemPatchSchema, planGroceryLinesSchema } from "@kitchen-pantry/validation";
import { z } from "zod";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { randomUuid } from "./kitchen";

/**
 * The household's shared shopping list. Every member reads and edits the
 * same list (row-level security checks membership); the database records
 * who added and who checked each line.
 */
export interface GroceryRepository {
  /** The household's open list, created on first use. */
  currentList(): Promise<Result<{ id: string }>>;
  items(listId: string): Promise<Result<GroceryItem[]>>;
  add(listId: string, input: unknown): Promise<Result<GroceryItem>>;
  update(id: unknown, patch: unknown): Promise<Result<GroceryItem>>;
  setChecked(id: unknown, checked: boolean): Promise<Result<GroceryItem>>;
  remove(id: unknown): Promise<Result<null>>;
  clearChecked(listId: string): Promise<Result<null>>;
  /** Replace the meal-plan lines (typed and already-bought lines stay). */
  replacePlanItems(listId: string, lines: unknown, planId: string | null): Promise<Result<{ added: number }>>;
}

export const GROCERY_COLUMNS =
  "id, grocery_list_id, name, department, amount_text, note, source, item_key, needed_for, required_quantity, required_unit, is_checked, added_by, checked_by, checked_at, position, created_at, updated_at";

export interface GroceryItemRow {
  id: string;
  grocery_list_id: string;
  name: string;
  department: string;
  amount_text: string | null;
  note: string | null;
  source: string;
  item_key: string | null;
  needed_for: string[] | null;
  required_quantity?: number | string | null;
  required_unit?: string | null;
  is_checked: boolean;
  added_by: string | null;
  checked_by: string | null;
  checked_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

const DEPARTMENTS = new Set<string>(groceryDepartments.map((d) => d.code));

function quantityOf(value: number | string | null | undefined, unit: string | null | undefined): Quantity | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 && unit ? { value: n, unit } : null;
}

export function rowToGroceryItem(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    listId: row.grocery_list_id,
    name: row.name,
    department: (DEPARTMENTS.has(row.department) ? row.department : "other") as GroceryDepartment,
    amount: row.amount_text ?? null,
    note: row.note ?? null,
    source: row.source === "plan" ? "plan" : "manual",
    key: row.item_key ?? null,
    neededFor: Array.isArray(row.needed_for) ? row.needed_for : [],
    quantity: quantityOf(row.required_quantity, row.required_unit),
    checked: Boolean(row.is_checked),
    addedBy: row.added_by ?? null,
    checkedBy: row.checked_by ?? null,
    checkedAt: row.checked_at ?? null,
    position: typeof row.position === "number" ? row.position : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Department order, then unchecked first, then plan order / name. */
const DEPT_ORDER = new Map<string, number>(groceryDepartments.map((d, i) => [d.code, i]));
export function sortGroceryItems(items: readonly GroceryItem[]): GroceryItem[] {
  return [...items].sort(
    (a, b) =>
      (DEPT_ORDER.get(a.department) ?? 99) - (DEPT_ORDER.get(b.department) ?? 99) ||
      Number(a.checked) - Number(b.checked) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export interface GroceryGroup {
  department: GroceryDepartment;
  label: string;
  items: GroceryItem[];
  remaining: number;
}

export function groupGroceryItems(items: readonly GroceryItem[]): GroceryGroup[] {
  const sorted = sortGroceryItems(items);
  return groceryDepartments
    .map((d) => {
      const inDept = sorted.filter((i) => i.department === d.code);
      return { department: d.code as GroceryDepartment, label: d.label, items: inDept, remaining: inDept.filter((i) => !i.checked).length };
    })
    .filter((g) => g.items.length > 0);
}

/** "Added by Sam" / "Got it: Alex" — names come from the household member list. */
export function personName(userId: string | null, names: ReadonlyMap<string, string>, you: string | null): string | null {
  if (!userId) return null;
  if (userId === you) return "you";
  return names.get(userId) ?? "a former member";
}

const id = z.uuid();
const NOT_FOUND = "That item is no longer on the list.";
const SAVE_FAILED = "Couldn't save that change. Please try again.";

function invalid(error: z.ZodError): Result<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "name");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, message: Object.values(fieldErrors)[0] ?? "Check the item", fieldErrors };
}

function toDbPatch(patch: z.infer<typeof groceryItemPatchSchema>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.department !== undefined) out.department = patch.department;
  if (patch.amount !== undefined) out.amount_text = patch.amount;
  if (patch.note !== undefined) out.note = patch.note;
  return out;
}

export function createSupabaseGroceryRepository(db: SupabaseLike): GroceryRepository {
  async function single(query: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>, context: string): Promise<Result<GroceryItem>> {
    const { data, error } = await query;
    if (error) return error.code === "PGRST116" ? { ok: false, message: NOT_FOUND } : dbFailure(context, error, SAVE_FAILED);
    if (!data) return { ok: false, message: NOT_FOUND };
    return { ok: true, data: rowToGroceryItem(data as GroceryItemRow) };
  }

  return {
    async currentList() {
      const { data, error } = await db.rpc("current_grocery_list");
      if (error) return dbFailure("current grocery list", error, "Couldn't open the shopping list.");
      const listId = id.safeParse(data);
      return listId.success ? { ok: true, data: { id: listId.data } } : { ok: false, message: "Couldn't open the shopping list." };
    },
    async items(listId) {
      const { data, error } = await db.from("grocery_list_items").select(GROCERY_COLUMNS).eq("grocery_list_id", listId).limit(500);
      if (error) return dbFailure("grocery items", error, "Couldn't load the shopping list.");
      return { ok: true, data: sortGroceryItems((data as GroceryItemRow[]).map(rowToGroceryItem)) };
    },
    async add(listId, input) {
      const parsed = groceryItemInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const v = parsed.data;
      return single(
        db
          .from("grocery_list_items")
          .insert({ grocery_list_id: listId, name: v.name, department: v.department, amount_text: v.amount, note: v.note, source: "manual", is_custom: true })
          .select(GROCERY_COLUMNS)
          .single(),
        "add grocery item",
      );
    },
    async update(itemId, patch) {
      const target = id.safeParse(itemId);
      if (!target.success) return { ok: false, message: NOT_FOUND };
      const parsed = groceryItemPatchSchema.safeParse(patch);
      if (!parsed.success) return invalid(parsed.error);
      const fields = toDbPatch(parsed.data);
      if (Object.keys(fields).length === 0) return { ok: false, message: "Nothing to change." };
      return single(db.from("grocery_list_items").update(fields).eq("id", target.data).select(GROCERY_COLUMNS).single(), "update grocery item");
    },
    async setChecked(itemId, checked) {
      const target = id.safeParse(itemId);
      if (!target.success) return { ok: false, message: NOT_FOUND };
      return single(
        db.from("grocery_list_items").update({ is_checked: Boolean(checked) }).eq("id", target.data).select(GROCERY_COLUMNS).single(),
        "check grocery item",
      );
    },
    async remove(itemId) {
      const target = id.safeParse(itemId);
      if (!target.success) return { ok: false, message: NOT_FOUND };
      const { error } = await db.from("grocery_list_items").delete().eq("id", target.data);
      if (error) return dbFailure("remove grocery item", error, SAVE_FAILED);
      return { ok: true, data: null };
    },
    async clearChecked(listId) {
      const { error } = await db.from("grocery_list_items").delete().eq("grocery_list_id", listId).eq("is_checked", true);
      if (error) return dbFailure("clear checked items", error, SAVE_FAILED);
      return { ok: true, data: null };
    },
    async replacePlanItems(listId, lines, planId) {
      const parsed = planGroceryLinesSchema.safeParse(lines);
      if (!parsed.success) return { ok: false, message: "Couldn't build the list from this plan." };
      const { data, error } = await db.rpc("replace_plan_grocery_items", { target_list: listId, items: parsed.data, plan: planId });
      if (error) return dbFailure("replace plan grocery items", error, "Couldn't add the plan to the list.");
      return { ok: true, data: { added: typeof data === "number" ? data : 0 } };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode: the list lives on this device only.
// ---------------------------------------------------------------------------
export const LOCAL_GROCERY_KEY = "kp-preview-grocery-v1";
export const PREVIEW_LIST_ID = "00000000-0000-4000-8000-000000000001";

export function createLocalGroceryRepository(
  storage: KeyValueStorage,
  options: { now?: () => Date; newId?: () => string } = {},
): GroceryRepository {
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const newId = options.newId ?? randomUuid;

  async function load(): Promise<GroceryItem[]> {
    try {
      const raw = await storage.getItem(LOCAL_GROCERY_KEY);
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? (value as GroceryItem[]) : [];
    } catch {
      return [];
    }
  }
  async function store(items: GroceryItem[]): Promise<boolean> {
    try {
      await storage.setItem(LOCAL_GROCERY_KEY, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }
  async function change(itemId: unknown, fn: (item: GroceryItem) => GroceryItem): Promise<Result<GroceryItem>> {
    const items = await load();
    const index = items.findIndex((i) => i.id === itemId);
    if (index < 0) return { ok: false, message: NOT_FOUND };
    const next = { ...fn(items[index]!), updatedAt: now() };
    items[index] = next;
    return (await store(items)) ? { ok: true, data: next } : { ok: false, message: SAVE_FAILED };
  }

  return {
    async currentList() {
      return { ok: true, data: { id: PREVIEW_LIST_ID } };
    },
    async items() {
      return { ok: true, data: sortGroceryItems(await load()) };
    },
    async add(listId, input) {
      const parsed = groceryItemInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const at = now();
      const item: GroceryItem = {
        id: newId(),
        listId,
        name: parsed.data.name,
        department: parsed.data.department as GroceryDepartment,
        amount: parsed.data.amount,
        note: parsed.data.note,
        source: "manual",
        key: null,
        neededFor: [],
        quantity: null,
        checked: false,
        addedBy: null,
        checkedBy: null,
        checkedAt: null,
        position: 0,
        createdAt: at,
        updatedAt: at,
      };
      const items = await load();
      if (items.length >= 500) return { ok: false, message: "The list is full. Clear some checked items first." };
      return (await store([...items, item])) ? { ok: true, data: item } : { ok: false, message: SAVE_FAILED };
    },
    async update(itemId, patch) {
      const parsed = groceryItemPatchSchema.safeParse(patch);
      if (!parsed.success) return invalid(parsed.error);
      const p = parsed.data;
      return change(itemId, (i) => ({
        ...i,
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(p.department !== undefined ? { department: p.department as GroceryDepartment } : {}),
        ...(p.amount !== undefined ? { amount: p.amount } : {}),
        ...(p.note !== undefined ? { note: p.note } : {}),
      }));
    },
    async setChecked(itemId, checked) {
      return change(itemId, (i) => ({ ...i, checked, checkedAt: checked ? now() : null }));
    },
    async remove(itemId) {
      const items = await load();
      return (await store(items.filter((i) => i.id !== itemId))) ? { ok: true, data: null } : { ok: false, message: SAVE_FAILED };
    },
    async clearChecked() {
      const items = await load();
      return (await store(items.filter((i) => !i.checked))) ? { ok: true, data: null } : { ok: false, message: SAVE_FAILED };
    },
    async replacePlanItems(listId, lines) {
      const parsed = planGroceryLinesSchema.safeParse(lines);
      if (!parsed.success) return { ok: false, message: "Couldn't build the list from this plan." };
      const items = await load();
      const bought = new Set(items.filter((i) => i.source === "plan" && i.checked && i.key).map((i) => i.key));
      const kept = items.filter((i) => i.source !== "plan" || i.checked);
      const at = now();
      const added: GroceryItem[] = parsed.data
        .filter((l) => !bought.has(l.key))
        .map((l, index) => ({
          id: newId(),
          listId,
          name: l.name,
          department: l.department as GroceryDepartment,
          amount: l.amount,
          note: l.note,
          source: "plan",
          key: l.key,
          neededFor: l.neededFor,
          quantity: l.quantity ?? null,
          checked: false,
          addedBy: null,
          checkedBy: null,
          checkedAt: null,
          position: index,
          createdAt: at,
          updatedAt: at,
        }));
      return (await store([...kept, ...added])) ? { ok: true, data: { added: added.length } } : { ok: false, message: SAVE_FAILED };
    },
  };
}

/** GroceryLine (from @kitchen-pantry/meal-planner) → what replacePlanItems accepts. */
export function toPlanLines(
  lines: ReadonlyArray<{
    key: string;
    name: string;
    department: string;
    amount: string | null;
    note: string | null;
    neededFor: readonly string[];
    quantities?: readonly Quantity[];
  }>,
) {
  return lines.map((l) => ({
    // One comparable amount is kept for store package math; mixed units (3 cloves + 1 tbsp) aren't combined.
    quantity: l.quantities?.length === 1 && l.quantities[0]!.value > 0 ? { value: Math.round(l.quantities[0]!.value * 10_000) / 10_000, unit: l.quantities[0]!.unit } : null,
    key: l.key.slice(0, 120),
    // Recipe ingredient names are lower-case ("baby spinach"); lists read better capitalised.
    name: (l.name.charAt(0).toUpperCase() + l.name.slice(1)).slice(0, 120),
    department: l.department,
    amount: l.amount ? l.amount.slice(0, 60) : null,
    note: l.note ? l.note.slice(0, 200) : null,
    neededFor: l.neededFor.slice(0, 14).map((n) => n.slice(0, 160)),
  }));
}
