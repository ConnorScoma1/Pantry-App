import { parseCartDraft, type CartDraft } from "@kitchen-pantry/grocery-pricing";
import type { IsoDate, PantryOutcome, SpendingEntry } from "@kitchen-pantry/shared-types";
import { issuesToFieldErrors, spendingInputSchema } from "@kitchen-pantry/validation";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { LOCAL_CART_KEY } from "./cart";
import { LOCAL_PANTRY_LOG_KEY, randomUuid } from "./kitchen";

/**
 * Smart Savings data, shared by web and mobile: the pantry log (what left
 * the kitchen and why), shops the household logged, and carts sent to a
 * store. All household-shared; nothing here is estimated.
 */
export interface SavingsData {
  pantry: PantryOutcome[];
  spending: SpendingEntry[];
  carts: CartDraft[];
}

export interface SavingsRepository {
  overview(since: IsoDate): Promise<Result<SavingsData>>;
  addSpending(input: unknown): Promise<Result<SpendingEntry>>;
  updateSpending(id: string, input: unknown): Promise<Result<SpendingEntry>>;
  removeSpending(id: string): Promise<Result<null>>;
}

const LOAD_FAILED = "Couldn't load your savings. Please try again.";
const SAVE_FAILED = "Couldn't save that shop. Please try again.";
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function toOutcome(raw: unknown): PantryOutcome | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.at !== "string" || !["consumed", "discarded", "expired"].includes(String(r.reason))) return null;
  const price = r.pricePaidCents === null || r.pricePaidCents === undefined ? null : Number(r.pricePaidCents);
  return {
    itemName: typeof r.itemName === "string" ? r.itemName.slice(0, 120) : "Item",
    reason: r.reason as PantryOutcome["reason"],
    pricePaidCents: price !== null && Number.isFinite(price) && price >= 0 ? Math.round(price) : null,
    useBy: isDate(r.useBy) ? r.useBy.slice(0, 10) : null,
    at: r.at,
  };
}

function toEntry(raw: unknown): SpendingEntry | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.id !== "string" || !isDate(r.spentOn)) return null;
  const amount = Number(r.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return {
    id: r.id,
    spentOn: r.spentOn.slice(0, 10),
    amountCents: amount,
    storeName: typeof r.storeName === "string" ? r.storeName : null,
    note: typeof r.note === "string" ? r.note : null,
    cartDraftId: typeof r.cartDraftId === "string" ? r.cartDraftId : null,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
  };
}

const clean = <T,>(list: unknown, map: (x: unknown) => T | null): T[] => (Array.isArray(list) ? list.map(map).filter((x): x is T => x !== null) : []);

function invalid(error: Parameters<typeof issuesToFieldErrors>[0]): Result<never> {
  return { ok: false, message: error.issues[0]?.message ?? "Please check the amount and date.", fieldErrors: issuesToFieldErrors(error) };
}

interface SpendingRow {
  id: string;
  spent_on: string;
  amount_cents: number;
  store_name: string | null;
  note: string | null;
  cart_draft_id: string | null;
  created_at: string;
}
const SPENDING_COLUMNS = "id, spent_on, amount_cents, store_name, note, cart_draft_id, created_at";
const rowToEntry = (r: SpendingRow): SpendingEntry => ({
  id: r.id, spentOn: r.spent_on, amountCents: r.amount_cents, storeName: r.store_name, note: r.note, cartDraftId: r.cart_draft_id, createdAt: r.created_at,
});

export function createSupabaseSavingsRepository(db: SupabaseLike): SavingsRepository {
  return {
    async overview(since) {
      if (!isDate(since)) return { ok: false, message: LOAD_FAILED };
      const { data, error } = await db.rpc("savings_overview", { since });
      if (error) return dbFailure("savings overview", error, LOAD_FAILED);
      const r = (data ?? {}) as Record<string, unknown>;
      return { ok: true, data: { pantry: clean(r.pantry, toOutcome), spending: clean(r.spending, toEntry), carts: clean(r.carts, parseCartDraft) } };
    },
    async addSpending(input) {
      const parsed = spendingInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const v = parsed.data;
      const { data, error } = await db
        .from("grocery_spending")
        .insert({ spent_on: v.spentOn, amount_cents: v.amountCents, store_name: v.storeName || null, note: v.note || null, cart_draft_id: v.cartDraftId })
        .select(SPENDING_COLUMNS)
        .single();
      if (error) {
        if (error.code === "23505") return { ok: false, message: "That order is already logged." };
        if (/future/i.test(error.message ?? "")) return { ok: false, message: "That date is in the future." };
        return dbFailure("add spending", error, SAVE_FAILED);
      }
      return { ok: true, data: rowToEntry(data as SpendingRow) };
    },
    async updateSpending(id, input) {
      const parsed = spendingInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      if (!isUuid(id)) return { ok: false, message: "That shop no longer exists." };
      const v = parsed.data;
      const { data, error } = await db
        .from("grocery_spending")
        .update({ spent_on: v.spentOn, amount_cents: v.amountCents, store_name: v.storeName || null, note: v.note || null })
        .eq("id", id)
        .select(SPENDING_COLUMNS)
        .maybeSingle();
      if (error) return dbFailure("update spending", error, SAVE_FAILED);
      if (!data) return { ok: false, message: "That shop no longer exists." };
      return { ok: true, data: rowToEntry(data as SpendingRow) };
    },
    async removeSpending(id) {
      if (!isUuid(id)) return { ok: true, data: null };
      const { error } = await db.from("grocery_spending").delete().eq("id", id);
      if (error) return dbFailure("remove spending", error, "Couldn't remove that shop.");
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode (on-device)
// ---------------------------------------------------------------------------
export const LOCAL_SPENDING_KEY = "kp-preview-spending-v1";

export function createLocalSavingsRepository(storage: KeyValueStorage, now: () => Date = () => new Date()): SavingsRepository {
  async function read<T>(key: string, map: (x: unknown) => T | null): Promise<T[]> {
    try {
      const raw = await storage.getItem(key);
      return clean(raw ? JSON.parse(raw) : [], map);
    } catch {
      return [];
    }
  }
  const spending = () => read(LOCAL_SPENDING_KEY, toEntry);
  const write = (list: SpendingEntry[]) => storage.setItem(LOCAL_SPENDING_KEY, JSON.stringify(list.slice(0, 1000)));
  const today = () => {
    const d = now();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const future = (day: string) => day > today();
  return {
    async overview(since) {
      const [pantry, entries, carts] = await Promise.all([read(LOCAL_PANTRY_LOG_KEY, toOutcome), spending(), read(LOCAL_CART_KEY, parseCartDraft)]);
      return {
        ok: true,
        data: {
          pantry: pantry.filter((p) => p.at.slice(0, 10) >= since),
          spending: entries.filter((e) => e.spentOn >= since).sort((a, b) => b.spentOn.localeCompare(a.spentOn)),
          carts: carts.filter((c) => (c.status === "sent" || c.status === "link_ready") && c.createdAt.slice(0, 10) >= since),
        },
      };
    },
    async addSpending(input) {
      const parsed = spendingInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const v = parsed.data;
      if (future(v.spentOn)) return { ok: false, message: "That date is in the future." };
      const list = await spending();
      if (v.cartDraftId && list.some((e) => e.cartDraftId === v.cartDraftId)) return { ok: false, message: "That order is already logged." };
      const entry: SpendingEntry = { id: randomUuid(), spentOn: v.spentOn, amountCents: v.amountCents, storeName: v.storeName || null, note: v.note || null, cartDraftId: v.cartDraftId, createdAt: now().toISOString() };
      await write([entry, ...list]);
      return { ok: true, data: entry };
    },
    async updateSpending(id, input) {
      const parsed = spendingInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const v = parsed.data;
      if (future(v.spentOn)) return { ok: false, message: "That date is in the future." };
      const list = await spending();
      const old = list.find((e) => e.id === id);
      if (!old) return { ok: false, message: "That shop no longer exists." };
      const next: SpendingEntry = { ...old, spentOn: v.spentOn, amountCents: v.amountCents, storeName: v.storeName || null, note: v.note || null };
      await write(list.map((e) => (e.id === id ? next : e)));
      return { ok: true, data: next };
    },
    async removeSpending(id) {
      await write((await spending()).filter((e) => e.id !== id));
      return { ok: true, data: null };
    },
  };
}
