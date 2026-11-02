import { applyGroceryChange, subscribeToGroceryList, upsertGroceryItem, type Result } from "@kitchen-pantry/database";
import type { GroceryItem } from "@kitchen-pantry/shared-types";
import type { GroceryItemInput, PlanGroceryLine } from "@kitchen-pantry/validation";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useApp } from "./app-state";

export type SyncState = "live" | "connecting" | "offline" | "local";

/**
 * Same behaviour as the web hook: the household's shared list with live
 * updates through Supabase Realtime, instant local changes, and a reload
 * when the app returns to the foreground or the connection comes back.
 */
export function useGrocery() {
  const { mode, grocery: repo, realtime } = useApp();
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
    const r = await repo.items(list.data.id);
    if (r.ok) {
      setItems(r.data);
      setError(null);
    } else setError(r.message);
    setLoading(false);
  }, [repo]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!realtime || !listId) return;
    let wasDown = false;
    const sub = subscribeToGroceryList(realtime, listId, {
      onChange: (change) => setItems((prev) => applyGroceryChange(prev, change, listId)),
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          setSync("live");
          if (wasDown) void reload();
          wasDown = false;
        } else {
          setSync(status === "CLOSED" ? "offline" : "connecting");
          wasDown = true;
        }
      },
    });
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") void reload();
    });
    return () => {
      appState.remove();
      sub.unsubscribe();
    };
  }, [realtime, listId, reload]);

  const add = useCallback(
    async (input: GroceryItemInput): Promise<Result<GroceryItem>> => {
      if (!listRef.current) return { ok: false, message: "The list is still loading." };
      const r = await repo.add(listRef.current, input);
      if (r.ok) setItems((prev) => upsertGroceryItem(prev, r.data));
      return r;
    },
    [repo],
  );
  const update = useCallback(
    async (id: string, patch: Partial<GroceryItemInput>): Promise<Result<GroceryItem>> => {
      const r = await repo.update(id, patch);
      if (r.ok) setItems((prev) => upsertGroceryItem(prev, r.data));
      return r;
    },
    [repo],
  );
  const toggle = useCallback(
    async (item: GroceryItem): Promise<Result<GroceryItem>> => {
      const checked = !item.checked;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i)));
      const r = await repo.setChecked(item.id, checked);
      if (r.ok) setItems((prev) => upsertGroceryItem(prev, r.data));
      else setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
      return r;
    },
    [repo],
  );
  const remove = useCallback(
    async (id: string): Promise<Result<null>> => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      const r = await repo.remove(id);
      if (!r.ok) await reload();
      return r;
    },
    [repo, reload],
  );
  const clearChecked = useCallback(async (): Promise<Result<null>> => {
    if (!listRef.current) return { ok: true, data: null };
    setItems((prev) => prev.filter((i) => !i.checked));
    const r = await repo.clearChecked(listRef.current);
    if (!r.ok) await reload();
    return r;
  }, [repo, reload]);
  const addPlan = useCallback(
    async (lines: PlanGroceryLine[], planId: string | null): Promise<Result<{ added: number }>> => {
      if (!listRef.current) return { ok: false, message: "The list is still loading." };
      const r = await repo.replacePlanItems(listRef.current, lines, planId);
      if (r.ok) await reload();
      return r;
    },
    [repo, reload],
  );

  const stats = useMemo(() => ({ left: items.filter((i) => !i.checked).length, checked: items.filter((i) => i.checked).length }), [items]);
  return { listId, items, loading, error, sync, stats, reload, add, update, toggle, remove, clearChecked, addPlan };
}
