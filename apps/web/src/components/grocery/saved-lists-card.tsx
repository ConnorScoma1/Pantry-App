"use client";

import { BookmarkPlus, ListPlus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import type { useSavedLists } from "@/lib/grocery/use-saved-lists";

/**
 * Saved lists (spec 01 §9 "Save lists"): keep what's on the list under a
 * name ("Weekly basics", "Costco run") and add it back in one tap later.
 * Shared with the household; adding skips anything already on the list.
 */
export function SavedListsCard({ saved, onMessage }: { saved: ReturnType<typeof useSavedLists>; onMessage: (m: string) => void }) {
  const nameId = useId();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Card>
      <Eyebrow>Saved lists</Eyebrow>
      {saved.loading ? (
        <div className="mt-3 h-12 animate-pulse rounded-2xl bg-background" />
      ) : saved.lists.length === 0 ? (
        <p className="mt-2 text-[15px] text-muted">Save the things you buy every week, then add them back in one tap.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {saved.lists.map((l) => (
            <li key={l.id} className="rounded-2xl bg-background px-4 py-3">
              {renaming?.id === l.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await saved.rename(l.id, renaming.name);
                    if (r.ok) setRenaming(null);
                    else onMessage(r.message);
                  }}
                >
                  <TextInput aria-label="New name" value={renaming.name} maxLength={60} autoFocus onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} className="h-11 text-[16px]" />
                  <Button type="submit" className="h-11 shrink-0">
                    Save
                  </Button>
                  <Button type="button" variant="ghost" className="h-11 shrink-0 px-3" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold">{l.name}</p>
                      <p className="text-[14px] text-muted">
                        {l.items.length} item{l.items.length === 1 ? "" : "s"}
                        {l.items.length > 0 ? ` · ${l.items.slice(0, 3).map((i) => i.name).join(", ")}${l.items.length > 3 ? "…" : ""}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      disabled={saved.busy !== null}
                      icon={<ListPlus className="size-4" aria-hidden />}
                      onClick={async () => {
                        const r = await saved.addToList(l.id);
                        onMessage(r.ok ? (r.data.added === 0 ? `Everything from “${l.name}” is already on the list.` : `Added ${r.data.added} item${r.data.added === 1 ? "" : "s"} from “${l.name}”.`) : r.message);
                      }}
                    >
                      {saved.busy === l.id ? "Adding…" : "Add"}
                    </Button>
                  </div>
                  <div className="mt-1 flex gap-4 text-[14px]">
                    <button type="button" className="min-h-9 font-semibold text-muted hover:text-foreground" onClick={() => setRenaming({ id: l.id, name: l.name })}>
                      Rename
                    </button>
                    <button
                      type="button"
                      className="min-h-9 font-semibold text-muted hover:text-danger"
                      onClick={async () => {
                        if (confirmDelete !== l.id) return setConfirmDelete(l.id);
                        setConfirmDelete(null);
                        const r = await saved.remove(l.id);
                        if (!r.ok) onMessage(r.message);
                      }}
                    >
                      {confirmDelete === l.id ? "Tap again to delete" : "Delete"}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {saved.canSave ? (
        <form
          className="mt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await saved.save(name);
            if (r.ok) {
              onMessage(`Saved “${name.trim()}”. Saving again under the same name updates it.`);
              setName("");
            } else onMessage(r.message);
          }}
        >
          <label htmlFor={nameId} className="text-[15px] font-semibold">
            Save this list as
          </label>
          <div className="mt-1.5 flex gap-2">
            <TextInput id={nameId} value={name} maxLength={60} placeholder="e.g. Weekly basics" onChange={(e) => setName(e.target.value)} className="h-12 text-[16px]" />
            <Button type="submit" className="h-12 shrink-0" disabled={!name.trim() || saved.busy !== null} icon={<BookmarkPlus className="size-4" aria-hidden />}>
              {saved.busy === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
          <Hint className="mt-1.5">Saves each item on the list once — not whether it&apos;s been bought. Your household can use it too.</Hint>
        </form>
      ) : null}
    </Card>
  );
}
