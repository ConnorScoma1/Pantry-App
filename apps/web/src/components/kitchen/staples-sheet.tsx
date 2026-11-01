"use client";

import { stapleChecklist } from "@kitchen-pantry/inventory-engine";
import { pantryCategories, type PantryItem } from "@kitchen-pantry/shared-types";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/kitchen/types";

/**
 * "Tick everything you already have." Ticking adds a staple (no amount
 * tracked); unticking a staple you'd added removes it as used up.
 */
export function StaplesSheet({
  open,
  items,
  onClose,
  onApply,
}: {
  open: boolean;
  items: PantryItem[];
  onClose: () => void;
  onApply: (toAdd: string[], toRemove: PantryItem[]) => Promise<Result<unknown>>;
}) {
  const staples = useMemo(() => stapleChecklist(), []);
  const owned = useMemo(() => {
    const map = new Map<string, PantryItem>();
    for (const i of items) map.set(i.name.toLowerCase(), i);
    return map;
  }, [items]);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChecked(new Set(staples.filter((s) => owned.has(s.name.toLowerCase())).map((s) => s.name)));
    setError(null);
  }, [open, staples, owned]);

  const groups = pantryCategories
    .map((c) => ({ ...c, staples: staples.filter((s) => s.category === c.code) }))
    .filter((g) => g.staples.length > 0);

  const toAdd = staples.filter((s) => checked.has(s.name) && !owned.has(s.name.toLowerCase())).map((s) => s.name);
  const toRemove = staples
    .filter((s) => !checked.has(s.name))
    .map((s) => owned.get(s.name.toLowerCase()))
    .filter((i): i is PantryItem => Boolean(i && i.isStaple));
  const changes = toAdd.length + toRemove.length;

  async function apply() {
    setBusy(true);
    const result = await onApply(toAdd, toRemove);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.message);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What do you already have?"
      description="Tick your staples. They come straight off future grocery lists."
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="text-center text-[15px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button size="lg" className="w-full" onClick={apply} disabled={busy || changes === 0}>
            {busy ? "Saving…" : changes === 0 ? "No changes" : `Save ${changes} change${changes === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setChecked(new Set(staples.map((s) => s.name)))}
          className="text-[15px] font-semibold text-accent hover:underline"
        >
          Tick all
        </button>
        {groups.map((group) => (
          <section key={group.code}>
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</h3>
            <ul className="overflow-hidden rounded-2xl bg-surface">
              {group.staples.map((s) => {
                const on = checked.has(s.name);
                return (
                  <li key={s.name} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.name)) next.delete(s.name);
                          else next.add(s.name);
                          return next;
                        })
                      }
                      className="flex min-h-13 w-full items-center gap-3 px-4 text-left text-[17px]"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
                          on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background",
                        )}
                      >
                        {on ? <Check className="size-4" strokeWidth={3} /> : null}
                      </span>
                      <span className={on ? "font-medium" : undefined}>{s.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
