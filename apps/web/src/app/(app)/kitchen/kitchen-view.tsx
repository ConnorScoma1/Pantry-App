"use client";

import { filterItems, groupByCategory, summarizeKitchen } from "@kitchen-pantry/inventory-engine";
import { storageLocations, type PantryItem, type StorageLocation } from "@kitchen-pantry/shared-types";
import { ListChecks, Plus, Refrigerator, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { ItemRow } from "@/components/kitchen/item-row";
import { ItemSheet } from "@/components/kitchen/item-sheet";
import { StaplesSheet } from "@/components/kitchen/staples-sheet";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useKitchen } from "@/lib/kitchen/use-kitchen";

type Editing = { kind: "new" } | { kind: "edit"; item: PantryItem } | null;

export function KitchenView() {
  const kitchen = useKitchen();
  const { items, loading, error, today } = kitchen;
  const [editing, setEditing] = useState<Editing>(null);
  const [staplesOpen, setStaplesOpen] = useState(false);
  const [location, setLocation] = useState<StorageLocation | "all">("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => summarizeKitchen(items, today), [items, today]);
  const groups = useMemo(
    () => groupByCategory(filterItems(items, { query, location }), today),
    [items, query, location, today],
  );

  const editingItem = editing?.kind === "edit" ? editing.item : null;

  return (
    <div className="animate-enter">
      <PageHeader
        title="My Kitchen"
        subtitle="Tick what you already have. It comes straight off your grocery list — and stays off."
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-[15px]">
          {notice}
        </p>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card className="flex flex-col justify-between gap-5">
          <div className="flex items-end gap-6">
            <div>
              <p className="text-[40px] font-bold leading-none tracking-tight tabular-nums">{loading ? "–" : summary.total}</p>
              <p className="mt-1 text-[15px] text-muted">{summary.total === 1 ? "item" : "items"} in your kitchen</p>
            </div>
            {summary.useSoon.length > 0 ? (
              <div>
                <p className="text-[40px] font-bold leading-none tracking-tight text-warning tabular-nums">
                  {summary.useSoon.length}
                </p>
                <p className="mt-1 text-[15px] text-muted">to use soon</p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditing({ kind: "new" })} icon={<Plus className="size-5" aria-hidden />}>
              Add an item
            </Button>
            <Button
              variant="secondary"
              onClick={() => setStaplesOpen(true)}
              icon={<ListChecks className="size-5" aria-hidden />}
            >
              Mark staples
            </Button>
          </div>
        </Card>

        <Card>
          <Eyebrow>Use it before you lose it</Eyebrow>
          {summary.useSoon.length === 0 ? (
            <p className="mt-2 text-[16px] text-muted">
              Nothing urgent. Add use-by dates to fresh food and the most urgent items show up here first.
            </p>
          ) : (
            <ul className="-mx-2 mt-2">
              {summary.useSoon.slice(0, 4).map((view) => (
                <ItemRow key={view.item.id} view={view} onOpen={() => setEditing({ kind: "edit", item: view.item })} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {summary.pastDate.length > 0 ? (
        <Card className="mb-4 border border-danger/20 bg-danger/5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-danger" aria-hidden />
            <Eyebrow className="text-danger!">Past its use-by date</Eyebrow>
          </div>
          <p className="mt-1.5 text-[15px] text-muted">
            We won&apos;t plan meals around these. Tap one to remove it from your kitchen.
          </p>
          <ul className="-mx-2 mt-2">
            {summary.pastDate.map((view) => (
              <ItemRow key={view.item.id} view={view} onOpen={() => setEditing({ kind: "edit", item: view.item })} />
            ))}
          </ul>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <label className="flex h-12 flex-1 items-center gap-3 rounded-full bg-surface px-5">
            <Search className="size-5 text-subtle" aria-hidden />
            <span className="sr-only">Search your kitchen</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your kitchen"
              className="h-full flex-1 bg-transparent text-[17px] outline-none placeholder:text-subtle"
            />
          </label>
          <div role="group" aria-label="Filter by location" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 md:pb-0">
            {[{ code: "all" as const, label: "All" }, ...storageLocations].map((loc) => {
              const count = loc.code === "all" ? summary.total : summary.byLocation[loc.code];
              const active = location === loc.code;
              return (
                <button
                  key={loc.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLocation(loc.code)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-full border px-4 text-[15px] font-medium transition-[border-color,box-shadow]",
                    active ? "border-foreground shadow-[inset_0_0_0_1px_rgb(var(--kp-foreground))]" : "border-border",
                  )}
                >
                  {loc.label} <span className="text-muted tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your kitchen">
          <div className="h-16 animate-pulse rounded-card bg-surface" />
          <div className="h-16 animate-pulse rounded-card bg-surface" />
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-background text-muted">
            <Refrigerator className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Your kitchen is empty</h2>
          <p className="mt-2 max-w-sm text-[16px] text-muted">
            Start with the staples you always have — it takes a minute and they&apos;ll stay off every grocery list.
          </p>
          <Button className="mt-5" onClick={() => setStaplesOpen(true)} icon={<ListChecks className="size-5" aria-hidden />}>
            Mark staples
          </Button>
        </Card>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-[16px] text-muted">Nothing matches that search.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`cat-${group.category}`}>
              <h2 id={`cat-${group.category}`} className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
                {group.label} <span className="tabular-nums">· {group.items.length}</span>
              </h2>
              <ul className="overflow-hidden rounded-card bg-surface">
                {group.items.map((view) => (
                  <ItemRow
                    key={view.item.id}
                    view={view}
                    showLocation={location === "all"}
                    onOpen={() => setEditing({ kind: "edit", item: view.item })}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ItemSheet
        open={editing !== null}
        item={editingItem}
        today={today}
        repository={kitchen.repository}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          const result = editingItem ? await kitchen.update(editingItem.id, input) : await kitchen.add(input);
          if (result.ok) setNotice(editingItem ? `Updated ${result.data.name}.` : `Added ${result.data.name}.`);
          return result;
        }}
        onRemove={async (reason) => {
          if (!editingItem) return { ok: true, data: null };
          const result = await kitchen.remove(editingItem.id, reason);
          if (result.ok) setNotice(`Removed ${editingItem.name}.`);
          return result;
        }}
      />

      <StaplesSheet
        open={staplesOpen}
        items={items}
        onClose={() => setStaplesOpen(false)}
        onApply={async (toAdd, toRemove) => {
          if (toAdd.length > 0) {
            const result = await kitchen.addStaples(toAdd);
            if (!result.ok) return result;
          }
          for (const item of toRemove) {
            const result = await kitchen.remove(item.id, "consumed");
            if (!result.ok) return result;
          }
          setNotice(
            [toAdd.length ? `Added ${toAdd.length} staple${toAdd.length === 1 ? "" : "s"}` : null,
             toRemove.length ? `removed ${toRemove.length}` : null]
              .filter(Boolean)
              .join(", ") + ".",
          );
          return { ok: true, data: null };
        }}
      />
    </div>
  );
}
