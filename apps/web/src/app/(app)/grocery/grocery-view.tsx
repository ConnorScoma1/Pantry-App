"use client";

import { groupGroceryItems, personName, toPlanLines } from "@kitchen-pantry/database";
import { formatCents, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import { buildGroceryList, departmentFor, nightsLeft, type GroceryListDraft } from "@kitchen-pantry/meal-planner";
import { groceryDepartments, priceStatuses, type GroceryDepartment, type GroceryItem } from "@kitchen-pantry/shared-types";
import { organizeByStore } from "@kitchen-pantry/shopping-optimizer";
import { Check, ChevronDown, ListPlus, MapPin, Pencil, Plus, RefreshCw, Route, ShoppingBasket, Store, Tag, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { SavedListsCard } from "@/components/grocery/saved-lists-card";
import { Avatar } from "@/components/household/avatar";
import { useProfile } from "@/components/profile/profile-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { Segmented, TextInput } from "@/components/ui/controls";
import { PriceStatusBadge } from "@/components/ui/price-status";
import { Sheet } from "@/components/ui/sheet";
import { useWeekOptions } from "@/components/ui/week-tabs";
import { cn } from "@/lib/cn";
import { useGrocery, type SyncState } from "@/lib/grocery/use-grocery";
import { useSavedLists } from "@/lib/grocery/use-saved-lists";
import { useHousehold } from "@/lib/household/use-household";
import { useMealPlan } from "@/lib/meal-plan/use-meal-plan";
import { usePricing } from "@/lib/pricing/use-pricing";
import { useActiveTrip } from "@/lib/shopping/use-shopping";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const selectClass =
  "h-13 w-full rounded-control border border-border bg-background px-4 text-[17px] outline-none focus:border-foreground";

export function GroceryView() {
  const grocery = useGrocery();
  const saved = useSavedLists(grocery.listId, grocery.items, grocery.reload);
  const household = useHousehold();
  const pricing = usePricing(grocery.items);
  const weeks = useWeekOptions();
  const startIndex = nightsLeft(weeks[0]!.weekStart, localToday()) < 2 ? 1 : 0;
  const [weekStart, setWeekStart] = useState(weeks[startIndex]!.weekStart);
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const others = household.members.filter((m) => !m.isYou);
  const subtitle =
    others.length === 0
      ? "Everything you need for the week, grouped by aisle."
      : `Shared with ${others.map((m) => m.displayName).join(", ").replace(/, ([^,]*)$/, " and $1")}. Changes show up for everyone right away.`;

  const groups = useMemo(() => groupGroceryItems(grocery.items), [grocery.items]);
  const you = household.you?.userId ?? null;
  const trip = useActiveTrip();
  const params = useSearchParams();
  const [view, setView] = useState<"aisle" | "stores">(params.get("view") === "stores" ? "stores" : "aisle");
  const byStore = useMemo(
    () => (trip.trip ? organizeByStore(grocery.items, trip.trip.stops.map((s) => s.storeKey), new Map(Object.entries(trip.trip.assignment))) : []),
    [grocery.items, trip.trip],
  );
  const showStores = view === "stores" && trip.trip !== null;
  const row = (item: GroceryItem) => (
    <GroceryRow
      key={item.id}
      item={item}
      addedBy={personName(item.addedBy, household.names, you)}
      checkedBy={personName(item.checkedBy, household.names, you)}
      shared={others.length > 0}
      price={showStores ? null : (pricing.lines.get(item.id) ?? null)}
      onToggle={async () => {
        const r = await grocery.toggle(item);
        if (!r.ok) setMessage(r.message);
      }}
      onEdit={() => setEditing(item)}
    />
  );

  return (
    <div className="animate-enter">
      <PageHeader title="Grocery List" subtitle={subtitle} action={<SyncBadge state={grocery.sync} />} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <AddItemForm onAdd={grocery.add} disabled={grocery.loading || !grocery.listId} />
          {message ? (
            <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-[15px]">
              {message}
            </p>
          ) : null}

          {grocery.error ? (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
              {grocery.error}
            </p>
          ) : null}

          {grocery.loading ? (
            <Card aria-busy="true" className="h-64 animate-pulse" />
          ) : grocery.items.length === 0 ? (
            <Card className="flex flex-col items-center py-12 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-background text-muted">
                <ShoppingBasket className="size-7" aria-hidden />
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">Your list is empty</h2>
              <p className="mt-2 max-w-sm text-[16px] text-muted">
                Add things as you think of them, or bring in everything this week&apos;s dinners need — with what&apos;s
                already in your kitchen taken off.
              </p>
            </Card>
          ) : (
            <Card className="p-0 sm:p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <p className="text-[16px]">
                  <span className="font-semibold">{grocery.stats.left} to get</span>
                  {grocery.stats.checked > 0 ? <span className="text-muted"> · {grocery.stats.checked} in the cart</span> : null}
                  {pricing.basket && pricing.basket.pricedCount > 0 ? (
                    <span className="text-muted">
                      {" "}
                      · <span className="font-semibold text-foreground">{formatCents(pricing.basket.totalCents)}</span>
                      {pricing.basket.missingCount > 0 ? ` for ${pricing.basket.pricedCount} priced` : ""}
                    </span>
                  ) : null}
                </p>
                {grocery.stats.checked > 0 ? (
                  <Button
                    variant="ghost"
                    className="-mr-3"
                    onClick={async () => {
                      const r = await grocery.clearChecked();
                      if (!r.ok) setMessage(r.message);
                    }}
                  >
                    Clear checked
                  </Button>
                ) : null}
              </div>
              {trip.trip ? (
                <div className="border-b border-border px-5 py-3 sm:px-6">
                  <Segmented
                    label="Group the list"
                    options={[
                      { value: "aisle", label: "By aisle" },
                      { value: "stores", label: trip.trip.stops.length === 1 ? "My store" : `By store (${trip.trip.stops.length})` },
                    ]}
                    value={view}
                    onChange={setView}
                  />
                </div>
              ) : null}
              {showStores
                ? byStore.map((section, si) => {
                    const stop = trip.trip!.stops.find((x) => x.storeKey === section.storeKey);
                    return (
                      <section key={section.storeKey ?? "unassigned"} aria-labelledby={`store-${si}`}>
                        <div id={`store-${si}`} className="border-t border-border px-5 pt-4 pb-2 first:border-t-0 sm:px-6">
                          <p className="text-[18px] font-bold">
                            {stop ? `${trip.trip!.stops.length > 1 ? `${si + 1}. ` : ""}${stop.name}` : "Not assigned to a store"}
                          </p>
                          <p className="text-[14px] text-muted">
                            {stop?.address ?? (stop ? "" : "Added after the trip was planned, or no store priced it")}
                            {section.count ? ` · ${section.count} item${section.count === 1 ? "" : "s"}` : ""}
                          </p>
                        </div>
                        {section.departments.map((d) => (
                          <div key={d.department}>
                            <h3 className="bg-surface-strong/50 px-5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted sm:px-6">
                              {groceryDepartments.find((x) => x.code === d.department)?.label ?? d.department}
                            </h3>
                            <ul>{d.items.map(row)}</ul>
                          </div>
                        ))}
                      </section>
                    );
                  })
                : groups.map((group) => (
                <section key={group.department} aria-labelledby={`dept-${group.department}`}>
                  <h2
                    id={`dept-${group.department}`}
                    className="flex items-baseline justify-between bg-surface-strong/50 px-5 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted sm:px-6"
                  >
                    {group.label}
                    <span className="font-medium normal-case tracking-normal">{group.remaining > 0 ? `${group.remaining} left` : "Done"}</span>
                  </h2>
                  <ul>{group.items.map(row)}</ul>
                </section>
              ))}
            </Card>
          )}

        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <CompareCard trip={trip} hasItems={grocery.stats.left > 0} onMessage={setMessage} />
          <PricesCard pricing={pricing} hasItems={grocery.stats.left > 0} />
          {grocery.stats.left > 0 ? (
            <Link href="/cart" className="flex min-h-14 items-center justify-between gap-3 rounded-card bg-foreground px-5 font-semibold text-background">
              <span>Build my cart</span>
              <span className="text-[14px] font-medium opacity-80">Send to your store →</span>
            </Link>
          ) : null}
          <PlanCard
            weeks={weeks.slice(0, 2)}
            weekStart={weekStart}
            onWeek={setWeekStart}
            hasPlanItems={grocery.items.some((i) => i.source === "plan" && !i.checked)}
            onAdd={async (lines, planId) => {
              const r = await grocery.addPlan(lines, planId);
              setMessage(
                r.ok
                  ? r.data.added === 0
                    ? "Everything from the plan is already on the list or in the cart."
                    : `Added ${r.data.added} item${r.data.added === 1 ? "" : "s"} from the meal plan.`
                  : r.message,
              );
            }}
          />
          <SavedListsCard saved={saved} onMessage={setMessage} />
          <HouseholdCard household={household} />
        </div>
      </div>

      <EditItemSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          const r = await grocery.update(editing.id, patch);
          if (r.ok) setEditing(null);
          else setMessage(r.message);
        }}
        onRemove={async () => {
          if (!editing) return;
          const id = editing.id;
          setEditing(null);
          const r = await grocery.remove(id);
          if (!r.ok) setMessage(r.message);
        }}
      />
    </div>
  );
}

/** One Store vs. Best Deals: the way in, and the household's chosen trip. */
function CompareCard({ trip, hasItems, onMessage }: { trip: ReturnType<typeof useActiveTrip>; hasItems: boolean; onMessage: (m: string) => void }) {
  const t = trip.trip;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Route className="size-5 text-muted" aria-hidden />
        <Eyebrow>One store or best deals</Eyebrow>
      </div>
      {t ? (
        <>
          <p className="mt-2 text-xl font-bold">{t.stops.length === 1 ? `Shopping at ${t.stops[0]!.name}` : `Shopping at ${t.stops.length} stores`}</p>
          {t.stops.length > 1 ? <p className="text-[14px] text-muted">{t.stops.map((s) => s.name).join(" → ")}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/grocery/compare" className={buttonClasses("secondary")}>
              Compare again
            </Link>
            <Button
              variant="ghost"
              onClick={async () => {
                const r = await trip.end("done");
                onMessage(r.ok ? "Trip finished. The list is grouped by aisle again." : r.message);
              }}
            >
              Finish trip
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[16px]">See whether splitting your list across nearby stores is worth the extra drive — after fuel and your time.</p>
          <Link href="/grocery/compare" aria-disabled={!hasItems} className={cn(buttonClasses("primary", "md", "mt-3 w-full"), !hasItems && "pointer-events-none opacity-45")}>
            Compare stores
          </Link>
        </>
      )}
    </Card>
  );
}

function SyncBadge({ state }: { state: SyncState }) {
  const label = { live: "Live", connecting: "Connecting…", offline: "Offline — will catch up", local: "On this device" }[state];
  return (
    <span
      role="status"
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-border px-3.5 text-[14px] font-medium"
    >
      <span
        aria-hidden
        className={cn(
          "size-2.5 rounded-full",
          state === "live" ? "bg-success" : state === "local" ? "bg-subtle" : "animate-pulse bg-warning",
        )}
      />
      {label}
    </span>
  );
}

function AddItemForm({ onAdd, disabled }: { onAdd: (input: { name: string; amount: string | null; department: GroceryDepartment }) => Promise<{ ok: boolean; message?: string }>; disabled: boolean }) {
  const ids = { name: useId(), amount: useId(), dept: useId() };
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState<GroceryDepartment>("other");
  const [manualDept, setManualDept] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!manualDept) setDepartment(name.trim() ? departmentFor(name) : "other");
  }, [name, manualDept]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const r = await onAdd({ name, amount: amount.trim() || null, department });
    setSaving(false);
    if (r.ok) {
      setName("");
      setAmount("");
      setManualDept(false);
      setError(null);
    } else setError(r.message ?? "Couldn't add that.");
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={submit}>
        <label htmlFor={ids.name} className="sr-only">
          Add an item
        </label>
        <div className="flex gap-2">
          <TextInput
            id={ids.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add an item…"
            maxLength={120}
            autoComplete="off"
            enterKeyHint="done"
            invalid={Boolean(error)}
            disabled={disabled}
          />
          <Button type="submit" className="h-13 shrink-0 px-5" disabled={disabled || saving || !name.trim()} icon={<Plus className="size-5" aria-hidden />}>
            Add
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="mt-2 inline-flex min-h-10 items-center gap-1 text-[15px] font-medium text-muted hover:text-foreground"
        >
          Amount and aisle
          {!more && name.trim() ? <span className="text-subtle">· {groceryDepartments.find((d) => d.code === department)?.label}</span> : null}
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} aria-hidden />
        </button>
        {more ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.amount} className="mb-1.5 block text-[15px] font-medium">
                Amount <span className="font-normal text-muted">(optional)</span>
              </label>
              <TextInput id={ids.amount} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 2 lb" maxLength={60} />
            </div>
            <div>
              <label htmlFor={ids.dept} className="mb-1.5 block text-[15px] font-medium">
                Aisle
              </label>
              <select
                id={ids.dept}
                value={department}
                onChange={(e) => {
                  setManualDept(true);
                  setDepartment(e.target.value as GroceryDepartment);
                }}
                className={selectClass}
              >
                {groceryDepartments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function GroceryRow({
  item,
  addedBy,
  checkedBy,
  shared,
  price,
  onToggle,
  onEdit,
}: {
  item: GroceryItem;
  addedBy: string | null;
  checkedBy: string | null;
  shared: boolean;
  price: PricedLine | null;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const showPrice = price && !item.checked;
  const product =
    showPrice && price.product
      ? `${price.product.name}${price.product.size ? ` · ${price.product.size}` : ""}${price.packages && price.packages > 1 ? ` × ${price.packages}` : ""}`
      : null;
  const meta = [
    product,
    showPrice ? price.note : null,
    item.neededFor.length > 0 ? `For ${item.neededFor.slice(0, 2).join(", ")}${item.neededFor.length > 2 ? ` +${item.neededFor.length - 2}` : ""}` : null,
    item.note,
    shared && item.checked && checkedBy ? `Got by ${checkedBy}` : shared && addedBy ? `Added by ${addedBy}` : null,
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-1 border-b border-border last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        onClick={onToggle}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3.5 py-2.5 pl-5 pr-2 text-left transition-colors hover:bg-surface-strong/50 sm:pl-6"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
            item.checked ? "border-foreground bg-foreground text-background" : "border-subtle",
          )}
        >
          {item.checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[17px] font-medium", item.checked && "text-muted line-through decoration-1")}>
            {item.name}
            {item.amount ? <span className="ml-2 font-normal text-muted no-underline">{item.amount}</span> : null}
          </span>
          {meta.length > 0 ? <span className="block truncate text-[14px] text-muted">{meta.join(" · ")}</span> : null}
        </span>
        {showPrice ? <PriceTag line={price} /> : null}
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${item.name}`}
        title="Edit"
        className="mr-3 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-strong hover:text-foreground sm:mr-4"
      >
        <Pencil className="size-4.5" aria-hidden />
      </button>
    </li>
  );
}

function EditItemSheet({
  item,
  onClose,
  onSave,
  onRemove,
}: {
  item: GroceryItem | null;
  onClose: () => void;
  onSave: (patch: { name: string; amount: string | null; note: string | null; department: GroceryDepartment }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const ids = { name: useId(), amount: useId(), note: useId(), dept: useId() };
  const [form, setForm] = useState({ name: "", amount: "", note: "", department: "other" as GroceryDepartment });
  useEffect(() => {
    if (item) setForm({ name: item.name, amount: item.amount ?? "", note: item.note ?? "", department: item.department });
  }, [item]);
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title="Edit item"
      description={item?.source === "plan" ? "From the meal plan. Updating the list from the plan replaces plan items you haven't checked." : undefined}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => void onRemove()}>
            Remove
          </Button>
          <Button
            className="flex-1"
            disabled={!form.name.trim()}
            onClick={() => void onSave({ name: form.name, amount: form.amount.trim() || null, note: form.note.trim() || null, department: form.department })}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <label htmlFor={ids.name} className="mb-1.5 block text-[15px] font-medium">
            Item
          </label>
          <TextInput id={ids.name} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.amount} className="mb-1.5 block text-[15px] font-medium">
              Amount
            </label>
            <TextInput id={ids.amount} value={form.amount} maxLength={60} placeholder="e.g. 2 lb" onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label htmlFor={ids.dept} className="mb-1.5 block text-[15px] font-medium">
              Aisle
            </label>
            <select id={ids.dept} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value as GroceryDepartment })} className={selectClass}>
              {groceryDepartments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={ids.note} className="mb-1.5 block text-[15px] font-medium">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <TextInput id={ids.note} value={form.note} maxLength={200} placeholder="e.g. the big bag" onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
    </Sheet>
  );
}

export function PlanCard({
  weeks,
  weekStart,
  onWeek,
  hasPlanItems,
  onAdd,
}: {
  weeks: Array<{ weekStart: string; label: string }>;
  weekStart: string;
  onWeek: (w: string) => void;
  hasPlanItems: boolean;
  onAdd: (lines: ReturnType<typeof toPlanLines>, planId: string | null) => Promise<void>;
}) {
  const plan = useMealPlan(weekStart);
  const [busy, setBusy] = useState(false);
  const [showHave, setShowHave] = useState(false);

  const recipeMeals = [...plan.draft.meals, ...plan.draft.desserts].filter((m) => m.recipeId && plan.byId.get(m.recipeId));
  const dessertCount = plan.draft.desserts.filter((m) => m.recipeId && plan.byId.get(m.recipeId)).length;
  const dinnerCount = recipeMeals.length - dessertCount;
  const custom = plan.draft.meals.length - dinnerCount;
  const draft: GroceryListDraft | null = useMemo(() => {
    if (recipeMeals.length === 0) return null;
    return buildGroceryList({
      meals: recipeMeals.map((m) => ({ recipe: plan.byId.get(m.recipeId!)!.recipe, servings: m.servings })),
      pantry: plan.recipesData.context.pantry,
      today: plan.today,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.draft.meals, plan.draft.desserts, plan.byId, plan.recipesData.context.pantry, plan.today]);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <ListPlus className="size-5 text-muted" aria-hidden />
        <Eyebrow>From your meal plan</Eyebrow>
      </div>
      <div className="mt-3">
        <Segmented label="Week" value={weekStart} onChange={onWeek} options={weeks.map((w) => ({ value: w.weekStart, label: w.label }))} />
      </div>
      {plan.loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-2xl bg-background" />
      ) : !draft ? (
        <>
          <p className="mt-4 text-[16px] text-muted">No recipe dinners planned for this week yet.</p>
          <Link href="/plan" className="mt-2 inline-flex min-h-11 items-center text-[16px] font-semibold underline underline-offset-4">
            Plan the week
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-[17px]">
            <span className="font-semibold">
              {dinnerCount} dinner{dinnerCount === 1 ? "" : "s"}
              {dessertCount > 0 ? ` and ${dessertCount} dessert${dessertCount === 1 ? "" : "s"}` : ""}
            </span>{" "}
            need{" "}
            <span className="font-semibold">{draft.toBuy.length} item{draft.toBuy.length === 1 ? "" : "s"}</span>.
          </p>
          <Hint className="mt-1">
            {draft.inKitchen.length > 0 ? `${draft.inKitchen.length} already in your kitchen ${draft.inKitchen.length === 1 ? "is" : "are"} left off. ` : ""}
            {custom > 0 ? `${custom} meal${custom === 1 ? "" : "s"} of your own aren't included. ` : ""}
            Amounts are what the recipes call for, not package sizes.
          </Hint>
          <Button
            className="mt-4 w-full"
            disabled={busy || draft.toBuy.length === 0}
            onClick={async () => {
              setBusy(true);
              await onAdd(toPlanLines(draft.toBuy), plan.plan?.id ?? null);
              setBusy(false);
            }}
          >
            {busy ? "Adding…" : hasPlanItems ? "Update list from plan" : "Add to list"}
          </Button>
          {draft.inKitchen.length > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={showHave}
                onClick={() => setShowHave((v) => !v)}
                className="inline-flex min-h-10 items-center gap-1 text-[15px] font-medium text-muted hover:text-foreground"
              >
                Already in your kitchen <ChevronDown className={cn("size-4 transition-transform", showHave && "rotate-180")} aria-hidden />
              </button>
              {showHave ? (
                <ul className="mt-1 space-y-1 text-[15px] text-muted">
                  {draft.inKitchen.map((l) => (
                    <li key={l.key}>
                      {l.name}
                      {l.amount ? ` · ${l.amount}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function HouseholdCard({ household }: { household: ReturnType<typeof useHousehold> }) {
  const { mode } = useProfile();
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Users className="size-5 text-muted" aria-hidden />
        <Eyebrow>Household</Eyebrow>
      </div>
      {mode === "preview" ? (
        <Hint className="mt-2">Sharing the list with your household needs accounts. Connect Supabase (see the README) to invite people.</Hint>
      ) : (
        <>
          <p className="mt-2 text-xl font-bold">{household.active?.name ?? "Your household"}</p>
          <div className="mt-3 flex items-center">
            {household.members.map((m) => (
              <Avatar key={m.userId} name={m.displayName} className="-ml-2 first:ml-0" />
            ))}
            <span className="ml-3 text-[15px] text-muted">
              {household.members.length} {household.members.length === 1 ? "person" : "people"}
            </span>
          </div>
          <Link
            href="/household"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-[15px] font-semibold hover:bg-background"
          >
            {household.isOwner && household.seatsLeft > 0 ? (
              <>
                <UserPlus className="size-4" aria-hidden /> Invite someone
              </>
            ) : (
              "Manage household"
            )}
          </Link>
        </>
      )}
    </Card>
  );
}

function PriceTag({ line }: { line: PricedLine }) {
  if (line.lineTotalCents === null) {
    return <span className="shrink-0 text-right text-[14px] text-muted">No price</span>;
  }
  const status = priceStatuses.find((p) => p.code === line.status)!;
  return (
    <span className="shrink-0 text-right">
      <span className="block text-[16px] font-semibold tabular-nums">{formatCents(line.lineTotalCents)}</span>
      <span className="block text-[12px] font-semibold">
        {line.saleCents !== null ? (
          <span className="text-success">Sale</span>
        ) : (
          <span className={line.status === "verified" ? "text-price-verified" : line.status === "cached" ? "text-price-cached" : "text-price-estimated"}>
            {status.label}
          </span>
        )}
      </span>
    </span>
  );
}

function PricesCard({ pricing, hasItems }: { pricing: ReturnType<typeof usePricing>; hasItems: boolean }) {
  const { profile } = useProfile();
  const zipId = useId();
  const [zip, setZip] = useState(profile.household.country === "US" ? profile.household.postalCode.slice(0, 5) : "");
  const [changing, setChanging] = useState(false);
  const b = pricing.basket;
  const budget = profile.budget.period === "week" ? profile.budget.amountCents : null;
  const checkedAt = b?.oldestObservedAt ? new Date(b.oldestObservedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;

  const header = (
    <div className="flex items-center gap-2">
      <Store className="size-5 text-muted" aria-hidden />
      <Eyebrow>Store prices</Eyebrow>
    </div>
  );

  if (pricing.enabled === null) {
    return (
      <Card>
        {header}
        <div className="mt-4 h-12 animate-pulse rounded-2xl bg-background" />
      </Card>
    );
  }

  if (!pricing.enabled) {
    return (
      <Card>
        {header}
        <p className="mt-2 text-xl font-bold">Not connected yet</p>
        <Hint className="mt-1">
          Prices come live from Kroger-family stores once the server has Kroger API keys (see the README). Until then the list shows no
          prices — never guesses.
        </Hint>
        <PriceLegend />
      </Card>
    );
  }

  if (!pricing.store || changing) {
    return (
      <Card>
        {header}
        <p className="mt-2 text-[16px]">Pick a Kroger-family store (Kroger, Ralphs, Fred Meyer, King Soopers, Pick &rsquo;n Save, Mariano&rsquo;s…) to see its prices.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void pricing.findStores(zip);
          }}
        >
          <label htmlFor={zipId} className="sr-only">
            ZIP code
          </label>
          <TextInput id={zipId} value={zip} inputMode="numeric" maxLength={5} placeholder="ZIP code" onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
          <Button type="submit" className="h-13 shrink-0" disabled={zip.length !== 5 || pricing.busy === "stores"} icon={<MapPin className="size-4" aria-hidden />}>
            {pricing.busy === "stores" ? "Finding…" : "Find stores"}
          </Button>
        </form>
        {pricing.error ? (
          <p role="alert" className="mt-2 text-[15px] text-danger">
            {pricing.error}
          </p>
        ) : null}
        {pricing.stores ? (
          pricing.stores.length === 0 ? (
            <Hint>No Kroger-family stores within 15 miles of that ZIP.</Hint>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {pricing.stores.map((s) => (
                <li key={s.locationId}>
                  <button
                    type="button"
                    disabled={pricing.busy === "store"}
                    onClick={async () => {
                      const r = await pricing.chooseStore(s.locationId);
                      if (r.ok) setChanging(false);
                    }}
                    className="w-full rounded-2xl bg-background px-4 py-3 text-left hover:bg-surface-strong disabled:opacity-50"
                  >
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block text-[14px] text-muted">{[s.address, s.city, s.region].filter(Boolean).join(", ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {changing ? (
          <Button variant="ghost" className="mt-2 -ml-3" onClick={() => setChanging(false)}>
            Keep {pricing.store?.name}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{pricing.store.name}</p>
          {pricing.store.address ? <p className="truncate text-[14px] text-muted">{pricing.store.address}</p> : null}
        </div>
        <Button variant="ghost" className="-mr-3 shrink-0 px-3" onClick={() => setChanging(true)}>
          Change
        </Button>
      </div>

      {!hasItems ? (
        <Hint>Prices show up here once there&apos;s something on the list.</Hint>
      ) : b ? (
        <div className="mt-4 rounded-2xl bg-background p-4">
          <p className="text-[15px] text-muted">{b.missingCount > 0 ? `${b.pricedCount} of ${b.pricedCount + b.missingCount} items` : "Everything left to buy"}</p>
          <p className="text-[32px] font-bold leading-tight tracking-tight tabular-nums">{formatCents(b.totalCents)}</p>
          <ul className="mt-2 space-y-1 text-[14px] text-muted">
            {b.saleSavingsCents > 0 ? (
              <li className="flex items-center gap-1.5 text-success">
                <Tag className="size-3.5" aria-hidden /> Includes {formatCents(b.saleSavingsCents)} in sale prices
              </li>
            ) : null}
            {b.missingCount > 0 ? <li>{b.missingCount} without a price at this store — not included</li> : null}
            {b.assumedCount > 0 ? <li>{b.assumedCount} priced as one package — check the amounts</li> : null}
            {budget !== null && b.missingCount === 0 ? (
              <li>
                {b.totalCents <= budget
                  ? `${formatCents(budget - b.totalCents)} under your ${formatCents(budget)} weekly budget`
                  : `${formatCents(b.totalCents - budget)} over your ${formatCents(budget)} weekly budget`}
              </li>
            ) : budget !== null ? (
              <li>Your weekly budget is {formatCents(budget)}; the full total isn&apos;t known yet</li>
            ) : null}
          </ul>
          <p className="mt-3 text-[13px] text-subtle">
            Prices from Kroger{checkedAt ? `, checked ${checkedAt}` : ""}. Shelf prices can change; tax not included.
          </p>
        </div>
      ) : null}

      {pricing.error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {pricing.error}
        </p>
      ) : null}
      {b?.warning && b.pricedCount > 0 ? <Hint>{b.warning} Some items show no price.</Hint> : null}

      {hasItems ? (
        <Button
          variant={pricing.stale || !b ? "primary" : "secondary"}
          className="mt-4 w-full"
          disabled={pricing.busy === "prices"}
          onClick={() => void pricing.refresh()}
          icon={<RefreshCw className={cn("size-4", pricing.busy === "prices" && "animate-spin")} aria-hidden />}
        >
          {pricing.busy === "prices" ? "Checking prices…" : pricing.stale ? "List changed — update prices" : b ? "Refresh prices" : "Check prices"}
        </Button>
      ) : null}
      <PriceLegend />
    </Card>
  );
}

function PriceLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 items-center gap-1 text-[15px] font-medium text-muted hover:text-foreground"
      >
        How prices are labelled <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ul className="mt-2 space-y-2.5">
          {priceStatuses.map((status) => (
            <li key={status.code} className="flex items-start gap-3">
              <PriceStatusBadge status={status.code} className="mt-0.5 w-[92px] shrink-0 justify-center" />
              <span className="text-[14px] leading-snug text-muted">{status.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
