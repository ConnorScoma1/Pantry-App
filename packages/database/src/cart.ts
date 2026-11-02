import {
  cartLinesSchema,
  parseCartDraft,
  transferItems,
  transferResultSchema,
  type CartDraft,
  type CartLine,
  type FulfillmentMethod,
  type RetailerCartAdapter,
  type TransferResult,
} from "@kitchen-pantry/grocery-pricing";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { randomUuid } from "./kitchen";

/**
 * Smart Cart drafts: one open cart per household, reviewed by everyone,
 * approved once, sent once. Supabase does the state changes in SQL
 * (supabase/migrations/…1200_smart_cart.sql); preview mode keeps the same
 * rules on the device.
 */
export interface CartDraftInput {
  id: string | null;
  retailer: string;
  storeId: string | null;
  storeName: string | null;
  fulfillment: FulfillmentMethod;
  lines: CartLine[];
  /** The version this edit started from (null for a new cart). */
  expectedVersion: number | null;
}

export type BeginAction = "go" | "done" | "busy" | "unknown" | "invalid";

export interface CartRepository {
  current(): Promise<Result<CartDraft | null>>;
  save(input: CartDraftInput): Promise<Result<CartDraft>>;
  approve(id: string, version: number): Promise<Result<CartDraft>>;
  begin(id: string, key: string): Promise<Result<{ action: BeginAction; draft: CartDraft }>>;
  finish(id: string, key: string, outcome: "sent" | "link_ready" | "not_sent" | "unknown", result: TransferResult | null, error: string | null): Promise<Result<CartDraft>>;
  resolve(id: string, itemsWereAdded: boolean): Promise<Result<CartDraft>>;
  setPurchase(id: string, ordered: boolean): Promise<Result<CartDraft>>;
  discard(id: string): Promise<Result<null>>;
}

const HINTS: Record<string, string> = {
  stale: "Someone else changed this cart. It's been reloaded with their changes.",
  cart_locked: "This cart is being sent or was already sent, so it can't be changed.",
  not_sending: "This send is no longer active.",
  not_unknown: "There's nothing to check.",
  not_sent: "Send the cart first.",
};

function fail(context: string, error: { code?: string; message?: string; hint?: string }, fallback: string): Result<never> {
  if (error.hint && HINTS[error.hint]) return { ok: false, message: HINTS[error.hint]! };
  if (error.code === "P0002") return { ok: false, message: "That cart no longer exists." };
  return dbFailure(context, error, fallback);
}

function asDraft(data: unknown): Result<CartDraft> {
  const d = parseCartDraft(data);
  return d ? { ok: true, data: d } : { ok: false, message: "The cart came back in an unexpected shape." };
}

function validLines(lines: unknown): Result<CartLine[]> {
  const parsed = cartLinesSchema.safeParse(lines);
  return parsed.success ? { ok: true, data: parsed.data as CartLine[] } : { ok: false, message: "Some cart lines aren't valid. Rebuild the cart." };
}

/**
 * @param options.actingUser — server only (service-role client): the member
 *   the server is sending for. The database checks they belong to the cart's
 *   household; only the server may send to a real retailer.
 */
export function createSupabaseCartRepository(db: SupabaseLike, options: { actingUser?: string } = {}): CartRepository {
  const acting = options.actingUser ? { acting_user: options.actingUser } : {};
  const call = async (fn: string, args: Record<string, unknown>, context: string, fallback: string): Promise<Result<CartDraft>> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) return fail(context, error as { code?: string; hint?: string; message?: string }, fallback);
    return asDraft(data);
  };
  return {
    async current() {
      const { data, error } = await db.rpc("current_cart_draft");
      if (error) return fail("current cart", error as { code?: string }, "Couldn't load the cart.");
      return data === null ? { ok: true, data: null } : asDraft(data);
    },
    async save(input) {
      const lines = validLines(input.lines);
      if (!lines.ok) return lines;
      return call(
        "save_cart_draft",
        {
          draft: input.id,
          retailer: input.retailer,
          store_id: input.storeId,
          store_name: input.storeName,
          fulfillment: input.fulfillment,
          lines: lines.data,
          expected_version: input.expectedVersion,
        },
        "save cart",
        "Couldn't save the cart. Please try again.",
      );
    },
    approve: (id, version) => call("approve_cart_draft", { draft: id, expected_version: version }, "approve cart", "Couldn't approve the cart."),
    async begin(id, key) {
      const { data, error } = await db.rpc("begin_cart_transfer", { draft: id, key, ...acting });
      if (error) return fail("begin send", error as { code?: string }, "Couldn't start sending the cart.");
      const r = data as { action?: BeginAction; draft?: unknown } | null;
      const draft = asDraft(r?.draft);
      if (!draft.ok || !r?.action) return { ok: false, message: "Couldn't start sending the cart." };
      return { ok: true, data: { action: r.action, draft: draft.data } };
    },
    finish: (id, key, outcome, result, error) =>
      call("finish_cart_transfer", { draft: id, key, outcome, result, error, ...acting }, "finish send", "Couldn't record what happened. Check your retailer cart."),
    resolve: (id, added) => call("resolve_cart_transfer", { draft: id, items_were_added: added }, "resolve send", "Couldn't save that."),
    setPurchase: (id, ordered) => call("set_cart_purchase", { draft: id, ordered }, "purchase status", "Couldn't save that."),
    async discard(id) {
      const { error } = await db.rpc("discard_cart_draft", { draft: id });
      if (error) return fail("discard cart", error as { code?: string; hint?: string }, "Couldn't remove the cart.");
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode: the same state machine, on this device.
// ---------------------------------------------------------------------------
export const LOCAL_CART_KEY = "kp-preview-cart-v1";
const OPEN = new Set(["draft", "approved", "sending", "unknown", "failed"]);

export function createLocalCartRepository(storage: KeyValueStorage, now: () => Date = () => new Date()): CartRepository {
  async function read(): Promise<CartDraft[]> {
    try {
      const raw = await storage.getItem(LOCAL_CART_KEY);
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      return list.map(parseCartDraft).filter((d): d is CartDraft => d !== null);
    } catch {
      return [];
    }
  }
  async function write(list: CartDraft[]) {
    try {
      await storage.setItem(LOCAL_CART_KEY, JSON.stringify(list.slice(0, 10)));
    } catch {
      // storage unavailable
    }
  }
  async function update(id: string, change: (d: CartDraft) => Result<CartDraft>): Promise<Result<CartDraft>> {
    const list = await read();
    const i = list.findIndex((d) => d.id === id);
    if (i < 0) return { ok: false, message: "That cart no longer exists." };
    const r = change(list[i]!);
    if (!r.ok) return r;
    list[i] = { ...r.data, updatedAt: now().toISOString() };
    await write(list);
    return { ok: true, data: list[i]! };
  }
  const locked = { ok: false as const, message: HINTS.cart_locked! };
  const stale = { ok: false as const, message: HINTS.stale! };

  return {
    async current() {
      const list = await read();
      return { ok: true, data: list.find((d) => OPEN.has(d.status)) ?? list[0] ?? null };
    },
    async save(input) {
      const lines = validLines(input.lines);
      if (!lines.ok) return lines;
      if (input.id === null) {
        const list = await read();
        if (list.some((d) => OPEN.has(d.status))) return stale;
        const at = now().toISOString();
        const draft: CartDraft = {
          id: randomUuid(), retailer: input.retailer, storeId: input.storeId, storeName: input.storeName, fulfillment: input.fulfillment, lines: lines.data,
          status: "draft", version: 1, createdBy: null, approvedBy: null, approvedAt: null, transferKey: null, result: null, lastError: null,
          purchase: "not_ordered", createdAt: at, updatedAt: at,
        };
        await write([draft, ...list]);
        return { ok: true, data: draft };
      }
      return update(input.id, (d) => {
        if (!["draft", "approved", "failed"].includes(d.status)) return locked;
        if (input.expectedVersion !== null && input.expectedVersion !== d.version) return stale;
        return {
          ok: true,
          data: { ...d, retailer: input.retailer, storeId: input.storeId, storeName: input.storeName, fulfillment: input.fulfillment, lines: lines.data, status: "draft", approvedAt: null, approvedBy: null, transferKey: null, lastError: null, version: d.version + 1 },
        };
      });
    },
    approve: (id, version) =>
      update(id, (d) => {
        if (!["draft", "failed"].includes(d.status)) return locked;
        if (version !== d.version) return stale;
        return { ok: true, data: { ...d, status: "approved", approvedAt: now().toISOString(), transferKey: d.transferKey ?? randomUuid(), lastError: null, version: d.version + 1 } };
      }),
    async begin(id, key) {
      let action: BeginAction = "invalid";
      const r = await update(id, (d) => {
        if (d.transferKey !== key) action = "invalid";
        else if (d.status === "sent" || d.status === "link_ready") action = "done";
        else if (d.status === "sending" || d.status === "unknown") {
          action = "unknown";
          return { ok: true, data: { ...d, status: "unknown", lastError: "The send was interrupted." } };
        } else if (d.status === "approved") {
          action = "go";
          return { ok: true, data: { ...d, status: "sending" } };
        }
        return { ok: true, data: d };
      });
      return r.ok ? { ok: true, data: { action, draft: r.data } } : r;
    },
    finish: (id, key, outcome, result, error) =>
      update(id, (d) => {
        if (d.transferKey !== key || d.status !== "sending") return { ok: false, message: HINTS.not_sending! };
        return { ok: true, data: { ...d, status: outcome === "not_sent" ? "failed" : outcome, result: outcome === "sent" || outcome === "link_ready" ? result : null, lastError: error } };
      }),
    resolve: (id, added) =>
      update(id, (d) => {
        if (d.status !== "unknown") return { ok: false, message: HINTS.not_unknown! };
        return added
          ? { ok: true, data: { ...d, status: "sent", result: { kind: "cart_confirmed", added: null, checkoutUrl: null, confirmedBy: "household", at: now().toISOString() }, lastError: null } }
          : { ok: true, data: { ...d, status: "approved", transferKey: randomUuid(), lastError: null } };
      }),
    setPurchase: (id, ordered) =>
      update(id, (d) => (d.status === "sent" || d.status === "link_ready" ? { ok: true, data: { ...d, purchase: ordered ? "ordered" : "not_ordered" } } : { ok: false, message: HINTS.not_sent! })),
    async discard(id) {
      const list = await read();
      const d = list.find((x) => x.id === id);
      if (d && (d.status === "sending" || d.status === "unknown")) return locked;
      await write(list.filter((x) => x.id !== id));
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Sending: one implementation for the server (Supabase) and preview mode.
// ---------------------------------------------------------------------------
export interface SendCartResult {
  draft: CartDraft;
  /** Plain-language summary for the screen. */
  message: string;
  /** The person must reconnect their retailer account. */
  needsAuth: boolean;
}

/**
 * Send an approved cart through a retailer adapter, exactly once per key:
 * the database decides whether this attempt may run, a retry after success
 * gets the stored result, and an attempt that may have reached the
 * retailer becomes "unknown" until a person checks.
 */
export async function sendCartDraft(input: {
  repo: CartRepository;
  adapter: RetailerCartAdapter;
  draftId: string;
  key: string;
  /** Fetched only after this attempt is allowed to run (so one refresh per send). */
  getAccessToken?: () => Promise<{ ok: true; token: string | null } | { ok: false; message: string; needsAuth: boolean }>;
  title: string;
}): Promise<Result<SendCartResult>> {
  const begun = await input.repo.begin(input.draftId, input.key);
  if (!begun.ok) return begun;
  const { action, draft } = begun.data;
  if (action === "done") return { ok: true, data: { draft, message: "Already sent — nothing was added twice.", needsAuth: false } };
  if (action === "busy") return { ok: false, message: "This cart is being sent right now. Give it a moment." };
  if (action === "unknown") return { ok: true, data: { draft, message: "A send was interrupted. Check your retailer cart, then tell us what you see.", needsAuth: false } };
  if (action === "invalid") {
    return {
      ok: false,
      message: draft.status === "failed" ? "The last send didn't go through. Approve the cart again to retry." : "This cart changed since it was approved. Review and approve it again.",
    };
  }
  if (draft.retailer !== input.adapter.id) {
    const r = await input.repo.finish(draft.id, input.key, "not_sent", null, "That retailer isn't available.");
    return r.ok ? { ok: true, data: { draft: r.data, message: "That retailer isn't available.", needsAuth: false } } : r;
  }

  let accessToken: string | null = null;
  if (input.getAccessToken) {
    const t = await input.getAccessToken();
    if (!t.ok) {
      const r = await input.repo.finish(draft.id, input.key, "not_sent", null, t.message);
      return r.ok ? { ok: true, data: { draft: r.data, message: t.message, needsAuth: t.needsAuth } } : r;
    }
    accessToken = t.token;
  }
  const outcome = await input.adapter.transfer({
    items: transferItems(draft.lines),
    fulfillment: draft.fulfillment,
    storeId: draft.storeId,
    accessToken,
    title: input.title,
  });
  if (outcome.ok) {
    const checked = transferResultSchema.safeParse(outcome.result);
    const result = checked.success ? (checked.data as TransferResult) : outcome.result;
    const r = await input.repo.finish(draft.id, input.key, result.kind === "link" ? "link_ready" : "sent", result, null);
    if (!r.ok) return r;
    const message =
      result.kind === "link"
        ? `Your list is ready at ${input.adapter.displayName}.`
        : result.confirmedBy === "mock"
          ? `Practice run: ${result.added} items "added" to ${input.adapter.displayName}. Nothing was sent to a real store.`
          : `${input.adapter.displayName} accepted ${result.added} items into your cart.`;
    return { ok: true, data: { draft: r.data, message, needsAuth: false } };
  }
  const r = await input.repo.finish(draft.id, input.key, outcome.error === "unknown" ? "unknown" : "not_sent", null, outcome.message);
  if (!r.ok) return r;
  return { ok: true, data: { draft: r.data, message: outcome.message, needsAuth: outcome.error === "auth_required" || outcome.error === "auth_expired" } };
}
