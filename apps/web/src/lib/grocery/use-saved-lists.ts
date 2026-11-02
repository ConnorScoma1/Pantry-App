"use client";

import { createLocalSavedListRepository, itemsToSave, type Result, type SavedListRepository } from "@kitchen-pantry/database";
import type { GroceryItem, SavedGroceryList } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useState } from "react";
import { addSavedListAction, removeSavedListAction, renameSavedListAction, saveListAction, savedListsAction } from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";

const supabaseSaved: SavedListRepository = {
  list: () => savedListsAction(),
  save: (i) => saveListAction(i),
  rename: (id, name) => renameSavedListAction(id, name),
  remove: (id) => removeSavedListAction(id),
  addToList: (id, target) => addSavedListAction(id, target),
};
let previewSaved: SavedListRepository | null = null;

/** Saved lists ("Weekly basics"): keep the current list under a name and add it back later. */
export function useSavedLists(listId: string | null, items: readonly GroceryItem[], reload: () => Promise<void>) {
  const { mode } = useProfile();
  const repo = mode === "preview" ? (previewSaved ??= createLocalSavedListRepository(browserStorage)) : supabaseSaved;
  const [lists, setLists] = useState<SavedGroceryList[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await repo.list();
    if (r.ok) setLists(r.data);
    setLoading(false);
  }, [repo]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (name: string): Promise<Result<{ id: string }>> => {
      setBusy("save");
      const r = await repo.save({ name, items: itemsToSave(items) });
      setBusy(null);
      if (r.ok) await refresh();
      return r;
    },
    [repo, items, refresh],
  );
  const addToList = useCallback(
    async (id: string): Promise<Result<{ added: number }>> => {
      if (!listId) return { ok: false, message: "The list is still loading." };
      setBusy(id);
      const r = await repo.addToList(id, listId);
      setBusy(null);
      if (r.ok) await reload();
      return r;
    },
    [repo, listId, reload],
  );
  const rename = useCallback(
    async (id: string, name: string) => {
      const r = await repo.rename(id, name);
      if (r.ok) await refresh();
      return r;
    },
    [repo, refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      const r = await repo.remove(id);
      if (r.ok) setLists((l) => l.filter((x) => x.id !== id));
      return r;
    },
    [repo],
  );
  return { lists, loading, busy, save, addToList, rename, remove, canSave: itemsToSave(items).length > 0 };
}
