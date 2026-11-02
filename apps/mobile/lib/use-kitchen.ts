import type { Result } from "@kitchen-pantry/database";
import type { PantryItem, RemovalReason } from "@kitchen-pantry/shared-types";
import type { PantryItemInput, PantryOrigin } from "@kitchen-pantry/validation";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useApp } from "./app-state";

/** Local calendar date (YYYY-MM-DD): use-by urgency follows the user's day. */
export function todayIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Same behaviour as the web hook: shared repository, optimistic removes. */
export function useKitchen() {
  const { kitchen } = useApp();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(todayIso());

  const reload = useCallback(async () => {
    const result = await kitchen.list();
    if (result.ok) {
      setItems(result.data);
      setError(null);
    } else setError(result.message);
    setLoading(false);
    setToday(todayIso());
  }, [kitchen]);

  // Refresh whenever the tab comes into view (another tab may have changed things).
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const add = useCallback(
    async (input: PantryItemInput, origin?: PantryOrigin): Promise<Result<PantryItem>> => {
      const r = await kitchen.add(input, origin);
      if (r.ok) setItems((prev) => [...prev, r.data]);
      return r;
    },
    [kitchen],
  );

  const addMany = useCallback(
    async (inputs: PantryItemInput[], origin: PantryOrigin): Promise<Result<PantryItem[]>> => {
      const r = await kitchen.addMany(inputs, origin);
      if (r.ok) setItems((prev) => [...prev, ...r.data]);
      return r;
    },
    [kitchen],
  );

  const update = useCallback(
    async (id: string, input: PantryItemInput): Promise<Result<PantryItem>> => {
      const r = await kitchen.update(id, input);
      if (r.ok) setItems((prev) => prev.map((i) => (i.id === id ? r.data : i)));
      return r;
    },
    [kitchen],
  );

  const remove = useCallback(
    async (id: string, reason: RemovalReason): Promise<Result<null>> => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      const r = await kitchen.remove(id, reason);
      if (!r.ok) await reload();
      return r;
    },
    [kitchen, reload],
  );

  const addStaples = useCallback(
    async (names: string[]): Promise<Result<PantryItem[]>> => {
      const r = await kitchen.addStaples(names);
      if (r.ok) setItems((prev) => [...prev, ...r.data]);
      return r;
    },
    [kitchen],
  );

  return { items, loading, error, today, repository: kitchen, reload, add, addMany, update, remove, addStaples };
}
