"use client";

import { summarizeBasket, type SpendingWeek } from "@kitchen-pantry/meal-planner";
import type { SpendingEntry } from "@kitchen-pantry/shared-types";
import { BadgeCheck, Leaf, Pencil, Plus, Receipt, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { Segmented, TextInput, FieldError } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { formatMoney, plural } from "@/lib/format";
import { useGrocery } from "@/lib/grocery/use-grocery";
import { usePricing } from "@/lib/pricing/use-pricing";
import { useSavings, type SavingsRange } from "@/lib/savings/use-savings";

const RANGES: ReadonlyArray<{ value: SavingsRange; label: string }> = [
  { value: "week", label: "This week" },
  { value: "eight_weeks", label: "Last 8 weeks" },
];

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Tag({ tone, children }: { tone: "verified" | "estimate" | "value"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
        tone === "verified" ? "bg-accent-soft text-accent" : tone === "estimate" ? "bg-warning/12 text-warning" : "bg-surface-strong text-muted",
      )}
    >
      {tone === "verified" ? <BadgeCheck className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[34px] font-bold leading-tight tracking-tight tabular-nums">{children}</p>;
}

export function SavingsView() {
  const s = useSavings();
  const [editing, setEditing] = useState<{ entry: SpendingEntry | null; cartId: string | null; amountCents: number | null; storeName: string | null } | null>(null);
  const rangeLabel = s.range === "week" ? "this week" : "in the last 8 weeks";

  return (
    <div className="animate-enter">
      <PageHeader
        title="Savings"
        subtitle="What you spend, save and use up. Verified numbers and estimates are always kept apart."
        action={
          <Button icon={<Plus className="size-5" aria-hidden />} onClick={() => setEditing({ entry: null, cartId: null, amountCents: null, storeName: null })}>
            Log a shop
          </Button>
        }
      />

      <BudgetCard budget={s.budget} />

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold tracking-tight">Savings and food use</h2>
        <div className="w-full sm:w-[280px]">
          <Segmented label="Period" options={RANGES} value={s.range} onChange={s.setRange} />
        </div>
      </div>

      {s.error ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {s.error}
        </p>
      ) : null}

      {!s.summary ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Loading savings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>Sale savings</Eyebrow>
              <Tag tone="verified">Verified</Tag>
            </div>
            <Big>{formatMoney(s.summary.carts.verifiedCents)}</Big>
            <p className="text-[15px] text-muted">
              {s.summary.carts.verifiedItems > 0
                ? `On ${plural(s.summary.carts.verifiedItems, "item")} in ${plural(s.summary.carts.orderedCarts, "order")} you placed ${rangeLabel}.`
                : `None verified ${rangeLabel}.`}
            </p>
            {s.summary.carts.estimatedCents > 0 ? (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[15px]">
                <Tag tone="estimate">Estimate</Tag>
                <span>
                  {formatMoney(s.summary.carts.estimatedCents)} more on {plural(s.summary.carts.estimatedItems, "item")} — orders not marked as placed, items sold by weight, or older prices.
                </span>
              </p>
            ) : null}
            <Hint className="mt-3">
              Counted only when the store reported both the regular and sale price, you sent the cart to the store, and you marked it as ordered.
              {s.summary.carts.practiceCarts > 0 ? " Practice carts never count." : ""}{" "}
              <Link href="/cart" className="font-semibold text-foreground underline decoration-border underline-offset-4">
                Build my cart
              </Link>
            </Hint>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>Food used from your kitchen</Eyebrow>
              <Tag tone="value">Value, not savings</Tag>
            </div>
            <Big>{formatMoney(s.summary.pantry.usedValueCents)}</Big>
            <p className="text-[15px] text-muted">
              {s.summary.pantry.usedCount > 0
                ? `What you paid for ${plural(s.summary.pantry.usedCount - s.summary.pantry.usedUnpriced, "item")} you used up ${rangeLabel}.`
                : `Nothing marked "Used it up" ${rangeLabel}.`}
              {s.summary.pantry.usedUnpriced > 0 ? ` ${plural(s.summary.pantry.usedUnpriced, "more item")} had no price.` : ""}
            </p>
            <Hint className="mt-3">
              This food was already bought, so it isn&apos;t counted as money saved. Add what you paid when you add items to My Kitchen to see their value here.
            </Hint>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>Waste avoided</Eyebrow>
              <Tag tone="estimate">Potential</Tag>
            </div>
            <Big>{plural(s.summary.pantry.rescuedCount, "item")}</Big>
            <p className="text-[15px] text-muted">
              {s.summary.pantry.rescuedCount > 0
                ? `Used up close to their use-by date: ${s.summary.pantry.rescuedNames.join(", ")}${s.summary.pantry.rescuedValueCents > 0 ? ` (${formatMoney(s.summary.pantry.rescuedValueCents)} paid)` : ""}.`
                : `Nothing used up within 3 days of its use-by date ${rangeLabel}.`}
            </p>
            <p className="mt-3 flex items-start gap-2 text-[15px]">
              <Leaf className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                {s.summary.pantry.wastedCount > 0
                  ? `Thrown out or expired: ${plural(s.summary.pantry.wastedCount, "item")} (${s.summary.pantry.wastedNames.join(", ")})${s.summary.pantry.wastedValueCents > 0 ? ` — up to ${formatMoney(s.summary.pantry.wastedValueCents)}` : ""}.`
                  : "Nothing thrown out. Nice."}
              </span>
            </p>
          </Card>
        </div>
      )}

      {s.summary ? (
        <SpendingCard
          weeks={s.summary.byWeek}
          trend={s.summary.trend}
          budget={s.budget}
          entries={s.data?.spending ?? []}
          orders={s.summary.orders}
          onEdit={(entry) => setEditing({ entry, cartId: entry.cartDraftId, amountCents: entry.amountCents, storeName: entry.storeName })}
          onLogOrder={(cartId, amountCents, storeName) => setEditing({ entry: null, cartId, amountCents, storeName })}
        />
      ) : null}

      <ShopSheet
        key={editing ? (editing.entry?.id ?? editing.cartId ?? "new") : "closed"}
        state={editing}
        today={s.today}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          const r = editing?.entry ? await s.updateSpending(editing.entry.id, input) : await s.addSpending(input);
          if (r.ok) setEditing(null);
          return r.ok ? null : r.message;
        }}
        onDelete={
          editing?.entry
            ? async () => {
                const r = await s.removeSpending(editing.entry!.id);
                if (r.ok) setEditing(null);
              }
            : undefined
        }
      />
    </div>
  );
}

function BudgetCard({ budget }: { budget: number | null }) {
  const grocery = useGrocery();
  const pricing = usePricing(grocery.items);
  const b = pricing.basket;
  const summary = b ? summarizeBasket(b.lines.map((l) => ({ totalCents: l.lineTotalCents, status: l.status })), budget) : null;
  const left = grocery.items.filter((i) => !i.checked).length;

  let verdict: ReactNode = null;
  if (summary && budget !== null) {
    const diff = Math.abs(budget - summary.totalCents);
    verdict =
      summary.verdict === "within_budget" ? (
        <Tag tone="verified">{formatMoney(diff)} under budget</Tag>
      ) : summary.verdict === "over_budget" ? (
        <Tag tone="estimate">{formatMoney(diff)} over budget</Tag>
      ) : summary.verdict === "incomplete" ? (
        <Tag tone="value">Can&apos;t compare yet — {plural(summary.unpricedLines, "item")} without a price</Tag>
      ) : (
        <Tag tone="estimate">Estimate — probably {summary.verdict === "estimate_within_budget" ? "within" : "over"} budget</Tag>
      );
  }

  return (
    <Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Eyebrow>Weekly grocery budget</Eyebrow>
          <Big>{budget === null ? "None set" : formatMoney(budget)}</Big>
          <p className="text-[15px] text-muted">
            {budget === null ? (
              <>
                Add one in{" "}
                <Link href="/plan?settings=weekly" className="font-semibold text-foreground underline decoration-border underline-offset-4">
                  Planning settings
                </Link>{" "}
                to compare.
              </>
            ) : (
              "From your planning settings."
            )}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Estimated basket (grocery list)</Eyebrow>
            <Tag tone="estimate">Estimate</Tag>
          </div>
          {grocery.loading || pricing.enabled === null ? (
            <div className="mt-3 h-10 w-40 animate-pulse rounded-xl bg-surface-strong" />
          ) : left === 0 ? (
            <p className="mt-3 text-[15px] text-muted">Your grocery list is empty, so there&apos;s nothing to estimate.</p>
          ) : !pricing.enabled ? (
            <p className="mt-3 text-[15px] text-muted">Store prices aren&apos;t connected, so there&apos;s no estimate. We never guess prices.</p>
          ) : !pricing.store ? (
            <p className="mt-3 text-[15px] text-muted">
              <Link href="/grocery" className="font-semibold text-foreground underline decoration-border underline-offset-4">
                Choose your store
              </Link>{" "}
              on the Grocery List to estimate the basket.
            </p>
          ) : pricing.busy === "prices" && !b ? (
            <p className="mt-3 text-[15px] text-muted">Checking prices at {pricing.store.name}…</p>
          ) : b && summary ? (
            <>
              <Big>{formatMoney(summary.totalCents)}</Big>
              <p className="text-[15px] text-muted">
                {b.pricedCount} of {b.pricedCount + b.missingCount} items priced at {pricing.store.name}
                {b.oldestObservedAt ? `, as of ${new Date(b.oldestObservedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}.
                {b.saleSavingsCents > 0 ? ` Includes ${formatMoney(b.saleSavingsCents)} in current sale prices.` : ""}
              </p>
              {verdict ? <p className="mt-2">{verdict}</p> : null}
            </>
          ) : (
            <p className="mt-3 text-[15px] text-muted">{pricing.error ?? "No prices yet."}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function SpendingCard({
  weeks,
  trend,
  budget,
  entries,
  orders,
  onEdit,
  onLogOrder,
}: {
  weeks: SpendingWeek[];
  trend: { averageCents: number | null; loggedWeeks: number; direction: "up" | "down" | "steady" | null };
  budget: number | null;
  entries: SpendingEntry[];
  orders: Array<{ cart: { id: string; storeName: string | null; createdAt: string }; estimateCents: number }>;
  onEdit: (e: SpendingEntry) => void;
  onLogOrder: (cartId: string, amountCents: number, storeName: string | null) => void;
}) {
  const max = Math.max(budget ?? 0, ...weeks.map((w) => w.spentCents), 1);
  const chartId = useId();
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Grocery spending</Eyebrow>
          <p className="mt-1.5 text-[16px]">
            {trend.averageCents === null
              ? "Log your shops to see your spending over time."
              : `About ${formatMoney(trend.averageCents)} a week across ${plural(trend.loggedWeeks, "logged week")}.`}
            {trend.direction === "up" ? " Trending up." : trend.direction === "down" ? " Trending down." : trend.direction === "steady" ? " Holding steady." : ""}
          </p>
        </div>
        {trend.direction === "up" ? <TrendingUp className="size-6 text-warning" aria-hidden /> : trend.direction === "down" ? <TrendingDown className="size-6 text-accent" aria-hidden /> : <Wallet className="size-6 text-muted" aria-hidden />}
      </div>

      <figure className="mt-5" aria-labelledby={chartId}>
        <figcaption id={chartId} className="sr-only">
          Spending per week for the last 8 weeks{budget !== null ? `, against a weekly budget of ${formatMoney(budget)}` : ""}.
        </figcaption>
        <div className="relative flex h-44 items-end gap-2 sm:gap-3">
          {budget !== null ? (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-subtle" style={{ bottom: `${(budget / max) * 100}%` }} aria-hidden>
              <span className="absolute -top-5 right-0 text-[12px] font-semibold text-muted">Budget {formatMoney(budget)}</span>
            </div>
          ) : null}
          {weeks.map((w) => (
            <div key={w.weekStart} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div
                role="img"
                aria-label={`Week of ${shortDate(w.weekStart)}: ${w.shops > 0 ? formatMoney(w.spentCents) : "nothing logged"}`}
                className={cn("w-full rounded-t-lg", w.shops === 0 ? "h-1 bg-surface-strong" : w.overBudget ? "bg-warning" : "bg-accent")}
                style={w.shops > 0 ? { height: `${Math.max((w.spentCents / max) * 100, 3)}%` } : undefined}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 sm:gap-3" aria-hidden>
          {weeks.map((w, i) => (
            <span key={w.weekStart} className="min-w-0 flex-1 truncate text-center text-[12px] text-muted">
              {i === weeks.length - 1 ? (
                "Now"
              ) : (
                <>
                  <span className="sm:hidden">{Number(w.weekStart.slice(5, 7))}/{Number(w.weekStart.slice(8, 10))}</span>
                  <span className="hidden sm:inline">{shortDate(w.weekStart)}</span>
                </>
              )}
            </span>
          ))}
        </div>
      </figure>

      {orders.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-surface-strong/60 p-4">
          <p className="text-[15px] font-semibold">Orders you placed that aren&apos;t logged yet</p>
          <ul className="mt-2 space-y-2">
            {orders.slice(0, 3).map((o) => (
              <li key={o.cart.id} className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                <span>
                  {o.cart.storeName ?? "Store order"} · {shortDate(o.cart.createdAt.slice(0, 10))} · cart estimate {formatMoney(o.estimateCents)}
                </span>
                <Button variant="secondary" onClick={() => onLogOrder(o.cart.id, o.estimateCents, o.cart.storeName)}>
                  Log what I paid
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 text-[15px] font-semibold">Logged shops</p>
        {entries.length === 0 ? (
          <p className="text-[15px] text-muted">None yet. Spending here only ever comes from shops you log — we never guess it.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.slice(0, 12).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <Receipt className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{e.storeName ?? "Groceries"}</span>
                  <span className="block truncate text-[14px] text-muted">
                    {shortDate(e.spentOn)}
                    {e.note ? ` · ${e.note}` : ""}
                    {e.cartDraftId ? " · from an order" : ""}
                  </span>
                </span>
                <span className="text-[16px] font-semibold tabular-nums">{formatMoney(e.amountCents)}</span>
                <button type="button" aria-label={`Edit ${e.storeName ?? "shop"} on ${shortDate(e.spentOn)}`} onClick={() => onEdit(e)} className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface">
                  <Pencil className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ShopSheet({
  state,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  state: { entry: SpendingEntry | null; cartId: string | null; amountCents: number | null; storeName: string | null } | null;
  today: string;
  onClose: () => void;
  onSave: (input: unknown) => Promise<string | null>;
  onDelete?: () => Promise<void>;
}) {
  const [date, setDate] = useState(state?.entry?.spentOn ?? today);
  const [amount, setAmount] = useState(state?.amountCents ? (state.amountCents / 100).toFixed(2) : "");
  const [store, setStore] = useState(state?.storeName ?? "");
  const [note, setNote] = useState(state?.entry?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromOrder = Boolean(state?.cartId && !state.entry);
  const ids = { date: useId(), amount: useId(), store: useId(), note: useId(), err: useId() };

  async function save() {
    const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter the amount you spent.");
    setBusy(true);
    const message = await onSave({ spentOn: date, amountCents: cents, storeName: store.trim() || null, note: note.trim() || null, cartDraftId: state?.cartId ?? null });
    setBusy(false);
    setError(message);
  }

  return (
    <Sheet
      open={state !== null}
      onClose={onClose}
      title={state?.entry ? "Edit shop" : "Log a shop"}
      description={fromOrder ? "Prefilled with the cart's estimate — change it to your receipt total." : "What you actually spent. This is the only source for spending trends."}
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {onDelete ? (
            <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void onDelete()} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={ids.amount} className="mb-1.5 block text-[15px] font-semibold">
            Amount spent
          </label>
          <TextInput id={ids.amount} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(error)} aria-describedby={error ? ids.err : undefined} />
          <FieldError id={ids.err} message={error ?? undefined} />
        </div>
        <div>
          <label htmlFor={ids.date} className="mb-1.5 block text-[15px] font-semibold">
            Date
          </label>
          <TextInput id={ids.date} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor={ids.store} className="mb-1.5 block text-[15px] font-semibold">
            Store <span className="font-normal text-muted">(optional)</span>
          </label>
          <TextInput id={ids.store} maxLength={120} value={store} onChange={(e) => setStore(e.target.value)} />
        </div>
        <div>
          <label htmlFor={ids.note} className="mb-1.5 block text-[15px] font-semibold">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <TextInput id={ids.note} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}
