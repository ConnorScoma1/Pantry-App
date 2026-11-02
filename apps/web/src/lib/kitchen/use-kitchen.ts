"use client";

import type { PantryItem, RemovalReason } from "@kitchen-pantry/shared-types";
import type { PantryItemInput, PantryOrigin } from "@kitchen-pantry/validation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addPantryItemAction,
  addPantryItemsAction,
  addStaplesAction,
  listPantryItemsAction,
  removePantryItemAction,
  searchIngredientsAction,
  updatePantryItemAction,
} from "@/app/(app)/kitchen/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { previewKitchenRepository } from "./preview-repository";
import type { KitchenRepository, Result } from "./types";

const supabaseKitchenRepository: KitchenRepository = {
  list: () => listPantryItemsAction(),
  add: (input, origin) => addPantryItemAction(input, origin),
  addMany: (inputs, origin) => addPantryItemsAction(inputs, origin),
  update: (id, input) => updatePantryItemAction(id, input),
  remove: (id, reason) => removePantryItemAction(id, reason),
  addStaples: (names) => addStaplesAction(names),
  searchIngredients: (query) => searchIngredientsAction(query),
};

/** Local calendar date (YYYY-MM-DD) — urgency is about the user's day, not UTC's. */
export function todayIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export interface KitchenState {
  items: PantryItem[];
  loading: boolean;
  error: string | null;
  today: string;
  repository: KitchenRepository;
  add: (input: PantryItemInput, origin?: PantryOrigin) => Promise<Result<PantryItem>>;
  addMany: (inputs: PantryItemInput[], origin: PantryOrigin) => Promise<Result<PantryItem[]>>;
  update: (id: string, input: PantryItemInput) => Promise<Result<PantryItem>>;
  remove: (id: string, reason: RemovalReason) => Promise<Result<null>>;
  addStaples: (names: string[]) => Promise<Result<PantryItem[]>>;
  reload: () => Promise<void>;
}

export function useKitchen(): KitchenState {
  const { mode } = useProfile();
  const repository = mode === "preview" ? previewKitchenRepository : supabaseKitchenRepository;
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(() => todayIso());

  const reload = useCallback(async () => {
    const result = await repository.list();
    if (result.ok) {
      setItems(result.data);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
    setToday(todayIso());
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (input: PantryItemInput, origin?: PantryOrigin) => {
      const result = await repository.add(input, origin);
      if (result.ok) setItems((prev) => [...prev, result.data]);
      return result;
    },
    [repository],
  );

  const addMany = useCallback(
    async (inputs: PantryItemInput[], origin: PantryOrigin) => {
      const result = await repository.addMany(inputs, origin);
      if (result.ok) setItems((prev) => [...prev, ...result.data]);
      return result;
    },
    [repository],
  );

  const update = useCallback(
    async (id: string, input: PantryItemInput) => {
      const result = await repository.update(id, input);
      if (result.ok) setItems((prev) => prev.map((i) => (i.id === id ? result.data : i)));
      return result;
    },
    [repository],
  );

  const remove = useCallback(
    async (id: string, reason: RemovalReason) => {
      setItems((prev) => prev.filter((i) => i.id !== id)); // optimistic
      const result = await repository.remove(id, reason);
      if (!result.ok) await reload(); // put back whatever the store still has
      return result;
    },
    [repository, reload],
  );

  const addStaples = useCallback(
    async (names: string[]) => {
      const result = await repository.addStaples(names);
      if (result.ok) setItems((prev) => [...prev, ...result.data]);
      return result;
    },
    [repository],
  );

  return useMemo(
    () => ({ items, loading, error, today, repository, add, addMany, update, remove, addStaples, reload }),
    [items, loading, error, today, repository, add, addMany, update, remove, addStaples, reload],
  );
}
