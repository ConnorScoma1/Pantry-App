import type { GroceryItem } from "@kitchen-pantry/shared-types";
import { rowToGroceryItem, sortGroceryItems, type GroceryItemRow } from "./grocery";

/**
 * Live updates for the shared grocery list, via Supabase Realtime
 * (Postgres changes). Realtime applies row-level security, so a member only
 * receives changes for lists in their own household.
 *
 * The reducer is pure so both apps (and the tests) share it. It is safe to
 * apply an event that the local optimistic update already applied, and it
 * ignores events that arrive out of order.
 */

export type GroceryChange =
  | { eventType: "INSERT"; new: Partial<GroceryItemRow>; old?: unknown }
  | { eventType: "UPDATE"; new: Partial<GroceryItemRow>; old?: unknown }
  | { eventType: "DELETE"; new?: unknown; old: { id?: string } };

function isRow(value: unknown): value is GroceryItemRow {
  const v = value as Partial<GroceryItemRow> | null;
  return Boolean(v && typeof v.id === "string" && typeof v.grocery_list_id === "string" && typeof v.name === "string" && typeof v.updated_at === "string");
}

export function applyGroceryChange(items: readonly GroceryItem[], change: GroceryChange, listId: string): GroceryItem[] {
  if (change.eventType === "DELETE") {
    const removed = change.old?.id;
    if (!removed || !items.some((i) => i.id === removed)) return items as GroceryItem[];
    return items.filter((i) => i.id !== removed);
  }
  if (!isRow(change.new)) return items as GroceryItem[];
  const incoming = rowToGroceryItem(change.new);
  if (incoming.listId !== listId) {
    // Moved to another list (or not ours): drop it if we had it.
    return items.some((i) => i.id === incoming.id) ? items.filter((i) => i.id !== incoming.id) : (items as GroceryItem[]);
  }
  const existing = items.find((i) => i.id === incoming.id);
  if (existing) {
    // Older or identical version (e.g. our own optimistic write): ignore.
    if (Date.parse(existing.updatedAt) >= Date.parse(incoming.updatedAt)) return items as GroceryItem[];
    return sortGroceryItems(items.map((i) => (i.id === incoming.id ? incoming : i)));
  }
  return sortGroceryItems([...items, incoming]);
}

// ---------------------------------------------------------------------------
// Subscription helper. Typed against the small slice of supabase-js it uses
// so tests can pass a fake channel.
// ---------------------------------------------------------------------------
export type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export interface RealtimeChannelLike {
  on(
    type: "postgres_changes",
    filter: { event: "*"; schema: string; table: string; filter?: string },
    callback: (payload: { eventType: string; new: unknown; old: unknown }) => void,
  ): RealtimeChannelLike;
  subscribe(callback?: (status: string, error?: Error) => void): RealtimeChannelLike;
}

export interface RealtimeClientLike {
  channel(name: string): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): unknown;
}

export interface GroceryListSubscription {
  unsubscribe(): void;
}

/**
 * Listen for changes to one list. `onChange` gets every insert/update/delete;
 * `onStatus` reports the connection so the UI can say "Live" or "Reconnecting…"
 * and reload when it comes back (events missed while offline aren't replayed).
 */
export function subscribeToGroceryList(
  client: RealtimeClientLike,
  listId: string,
  handlers: { onChange: (change: GroceryChange) => void; onStatus?: (status: RealtimeStatus) => void },
): GroceryListSubscription {
  const channel = client.channel(`grocery-list:${listId}`);
  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "grocery_list_items", filter: `grocery_list_id=eq.${listId}` }, (payload) => {
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        handlers.onChange({ eventType: payload.eventType, new: payload.new as Partial<GroceryItemRow> });
      } else if (payload.eventType === "DELETE") {
        handlers.onChange({ eventType: "DELETE", old: (payload.old ?? {}) as { id?: string } });
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "TIMED_OUT" || status === "CLOSED" || status === "CHANNEL_ERROR") handlers.onStatus?.(status);
    });
  let closed = false;
  return {
    unsubscribe() {
      if (closed) return;
      closed = true;
      void client.removeChannel(channel);
    },
  };
}

/** Put a server-confirmed item into local state (newer versions win). */
export function upsertGroceryItem(items: readonly GroceryItem[], item: GroceryItem): GroceryItem[] {
  const existing = items.find((i) => i.id === item.id);
  if (existing && Date.parse(existing.updatedAt) > Date.parse(item.updatedAt)) return items as GroceryItem[];
  return sortGroceryItems(existing ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]);
}

/**
 * Live Smart Cart review: any change to the household's cart (RLS limits
 * what arrives) tells the page to reload it.
 */
export function subscribeToCartDrafts(client: RealtimeClientLike, onChange: () => void): { unsubscribe(): void } {
  const channel = client.channel("cart-drafts");
  channel.on("postgres_changes", { event: "*", schema: "public", table: "cart_drafts" }, () => onChange()).subscribe(() => {});
  let closed = false;
  return {
    unsubscribe() {
      if (closed) return;
      closed = true;
      void client.removeChannel(channel);
    },
  };
}

/** Live "who's eating": any answer or guest change in the household (RLS limits what arrives). */
export function subscribeToAttendance(client: RealtimeClientLike, onChange: () => void): { unsubscribe(): void } {
  const channel = client.channel("meal-attendance");
  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "meal_attendance" }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "meal_guests" }, () => onChange())
    .subscribe(() => {});
  let closed = false;
  return {
    unsubscribe() {
      if (closed) return;
      closed = true;
      void client.removeChannel(channel);
    },
  };
}
