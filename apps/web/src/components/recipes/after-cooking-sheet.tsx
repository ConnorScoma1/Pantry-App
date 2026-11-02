"use client";

import type { KitchenUpdate } from "@kitchen-pantry/recipe-engine";
import { pantryItemToInput } from "@kitchen-pantry/validation";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { KitchenState } from "@/lib/kitchen/use-kitchen";

const amount = (n: number, unit: string | null) => `${n} ${unit ?? ""}`.trim();

/**
 * After cooking: "Update My Kitchen?" (spec 01 §5). Lists what the recipe
 * used from the kitchen. Comparable amounts start ticked; the rest start
 * unticked and say "used it all?" — nothing changes until "Update".
 */
export function AfterCookingSheet({ open, updates, kitchen, onClose }: { open: boolean; updates: KitchenUpdate[]; kitchen: KitchenState; onClose: (message: string | null) => void }) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(Object.fromEntries(updates.map((u) => [u.item.id, u.selected])));
      setError(null);
    }
  }, [open, updates]);

  async function apply() {
    setBusy(true);
    let changed = 0;
    for (const u of updates) {
      if (!picked[u.item.id]) continue;
      const r =
        u.kind === "reduce" && u.remaining !== null
          ? await kitchen.update(u.item.id, { ...pantryItemToInput(u.item), quantity: u.remaining, estimatedRemainingPct: null })
          : await kitchen.remove(u.item.id, "consumed");
      if (!r.ok) {
        setBusy(false);
        setError(`${u.item.name}: ${r.message}`);
        return;
      }
      changed++;
    }
    setBusy(false);
    onClose(changed ? `Updated ${changed} item${changed === 1 ? "" : "s"} in My Kitchen.` : null);
  }

  return (
    <Sheet
      open={open}
      onClose={() => onClose(null)}
      title="Update My Kitchen?"
      description="Here's what this recipe used from your kitchen. Untick anything you didn't use — nothing changes until you tap Update."
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="text-center text-[15px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void apply()}>
            {busy ? "Updating…" : "Update My Kitchen"}
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => onClose(null)}>
            Not now
          </Button>
        </div>
      }
    >
      <ul className="space-y-2">
        {updates.map((u) => {
          const on = Boolean(picked[u.item.id]);
          const what =
            u.kind === "reduce"
              ? `${amount(u.item.quantity!, u.item.unit)} → ${amount(u.remaining!, u.item.unit)} left`
              : u.kind === "use_up"
                ? "All used up — remove it"
                : "Used it all? (we can't tell from the amounts)";
          return (
            <li key={u.item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked((p) => ({ ...p, [u.item.id]: !on }))}
                className={cn("flex w-full items-start gap-3 rounded-2xl bg-background px-4 py-3 text-left", !on && "opacity-70")}
              >
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2", on ? "border-foreground bg-foreground text-background" : "border-border")}>
                  {on ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{u.item.name}</span>
                  <span className="block text-[14px] text-muted">{what}</span>
                  <span className="block text-[13px] text-subtle">Recipe: {u.lines.join("; ")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
