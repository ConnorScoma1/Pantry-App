"use client";

import {
  applyGroceryChange,
  createLocalGroceryRepository,
  subscribeToGroceryList,
  upsertGroceryItem,
  type GroceryRepository,
  type RealtimeClientLike,
  type Result,
} from "@kitchen-pantry/database";
import type { GroceryItem } from "@kitchen-pantry/shared-types";
import type { GroceryItemInput, PlanGroceryLine } from "@kitchen-pantry/validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addItemAction,
  clearCheckedAction,
  currentListAction,
  listItemsAction,
  removeItemAction,
  replacePlanItemsAction,
  setCheckedAction,
  updateItemAction,
} from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabaseGrocery: GroceryRepository = {
  currentList: () => currentListAction(),
  items: (id) => listItemsAction(id),
  add: (id, input) => addItemAction(id, input),
  update: (id, patch) => updateItemAction(id, patch),
  setChecked: (id, checked) => setCheckedAction(id, checked),
  remove: (id) => removeItemAction(id),
  clearChecked: (id) => clearCheckedAction(id),
  replacePlanItems: (id, lines, planId) => replacePlanItemsAction(id, lines, planId),
};
let previewGrocery: GroceryRepository | null = null;
function previewRepository() {
  previewGrocery ??= createLocalGroceryRepository(browserStorage);
  return previewGrocery;
}

/** "live": syncing with the household; "connecting"/"offline": not right now; "local": preview mode. */
export type SyncState = "live" | "connecting" | "offline" | "local";

/**
 * The household's shared shopping list with live updates. Changes show
 * immediately on this device and reach everyone else through Supabase
 * Realtime; if the connection drops, the list reloads when it comes back.
 */
export function useGrocery() {
  const { mode } = useProfile();
  const repo = mode === "preview" ? previewRepository() : supabaseGrocery;
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>(mode === "preview" ? "local" : "connecting");
  const listRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const list = listRef.current ? ({ ok: true, data: { id: listRef.current } } as const) : await repo.currentList();
    if (!list.ok) {
      setError(list.message);
      setLoading(false);
      return;
    }
    listRef.current = list.data.id;
    setListId(list.data.id);
    const result = await repo.items(list.data.id);
    if (result.ok) {
      setItems(result.data);
      setError(null);
    } else setError(result.message);
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Live updates from other members.
  useEffect(() => {
    if (mode === "preview" || !listId) return;
    const client = getBrowserSupabase();
    if (!client) return;
    let wasDown = false;
    const sub = subscribeToGroceryList(client as unknown as RealtimeClientLike, listId, {
      onChange: (change) => setItems((prev) => applyGroceryChange(prev, change, listId)),
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          setSync("live");
          if (wasDown) void reload(); // catch up on anything missed
          wasDown = false;
        } else {
          setSync(status === "CLOSED" ? "offline" : "connecting");
          wasDown = true;
        }
      },
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sub.unsubscribe();
    };
  }, [mode, listId, reload]);

  const add = useCallback(
    async (input: GroceryItemInput): Promise<Result<GroceryItem>> => {
      if (!listRef.current) return { ok: false, message: "The list is still loading." };
      const result = await repo.add(listRef.current, input);
      if (result.ok) setItems((prev) => upsertGroceryItem(prev, result.data));
      return result;
    },
    [repo],
  );

  const update = useCallback(
    async (id: string, patch: Partial<GroceryItemInput>): Promise<Result<GroceryItem>> => {
      const result = await repo.update(id, patch);
      if (result.ok) setItems((prev) => upsertGroceryItem(prev, result.data));
      return result;
    },
    [repo],
  );

  const toggle = useCallback(
    async (item: GroceryItem): Promise<Result<GroceryItem>> => {
      const checked = !item.checked;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i))); // instant
      const result = await repo.setChecked(item.id, checked);
      if (result.ok) setItems((prev) => upsertGroceryItem(prev, result.data));
      else setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
      return result;
    },
    [repo],
  );

  const remove = useCallback(
    async (id: string): Promise<Result<null>> => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      const result = await repo.remove(id);
      if (!result.ok) await reload();
      return result;
    },
    [repo, reload],
  );

  const clearChecked = useCallback(async (): Promise<Result<null>> => {
    if (!listRef.current) return { ok: true, data: null };
    setItems((prev) => prev.filter((i) => !i.checked));
    const result = await repo.clearChecked(listRef.current);
    if (!result.ok) await reload();
    return result;
  }, [repo, reload]);

  const addPlan = useCallback(
    async (lines: PlanGroceryLine[], planId: string | null): Promise<Result<{ added: number }>> => {
      if (!listRef.current) return { ok: false, message: "The list is still loading." };
      const result = await repo.replacePlanItems(listRef.current, lines, planId);
      if (result.ok) await reload();
      return result;
    },
    [repo, reload],
  );

  const stats = useMemo(
    () => ({ total: items.length, left: items.filter((i) => !i.checked).length, checked: items.filter((i) => i.checked).length }),
    [items],
  );

  return { listId, items, loading, error, sync, stats, reload, add, update, toggle, remove, clearChecked, addPlan };
}
