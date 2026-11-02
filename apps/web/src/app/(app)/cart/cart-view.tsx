"use client";

import {
  approveLine,
  cartAsText,
  cartBlockers,
  cartEstimate,
  chooseOption,
  formatCents,
  fulfillmentMethods,
  selectedProduct,
  setCount,
  setInclude,
  type CartDraft,
  type CartLine,
  type CartProduct,
  type FulfillmentMethod,
} from "@kitchen-pantry/grocery-pricing";
import { TriangleAlert, Check, ChevronDown, Copy, Download, ExternalLink, Minus, Plus, RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { ChoiceCard, Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { useCart } from "@/lib/cart/use-cart";
import { useHousehold } from "@/lib/household/use-household";
import { useWeekOptions } from "@/components/ui/week-tabs";
import { nightsLeft } from "@kitchen-pantry/meal-planner";
import { todayIso } from "@/lib/kitchen/use-kitchen";
import { PlanCard } from "../grocery/grocery-view";

const STEPS = ["List", "Store", "Review", "Send"] as const;
const timeFmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export function CartView() {
  const c = useCart();
  const household = useHousehold();
  const params = useSearchParams();
  const [retailer, setRetailer] = useState<string>("kroger");
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("pickup");
  const [rebuilding, setRebuilding] = useState(false);

  const connectNote = params.get("connect");
  useEffect(() => {
    // Default to the first retailer that can actually take a cart.
    const first = c.retailers.find((r) => r.available);
    if (first && !c.retailers.find((r) => r.id === retailer)?.available) setRetailer(first.id);
  }, [c.retailers, retailer]);

  const d = c.draft;
  const done = d !== null && (d.status === "sent" || d.status === "link_ready");
  const step = !d || rebuilding ? 0 : d.status === "draft" || d.status === "failed" ? 2 : 3;

  return (
    <div className="animate-enter">
      <PageHeader title="Build my cart" subtitle="From your shared grocery list to your store's cart. You approve every product; you pick the time and pay at the store's site." />

      <ol className="mb-5 flex flex-wrap gap-2 text-[14px] font-semibold" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-full px-3 py-1", i <= step ? "bg-accent-soft text-accent" : "bg-surface text-muted")} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {connectNote === "kroger" ? <Note tone="success">Kroger is connected. You can send the cart now.</Note> : null}
      {connectNote === "failed" ? <Note tone="error">Connecting to Kroger didn&apos;t finish. Try again.</Note> : null}
      {c.message ? <Note tone={c.message.tone}>{c.message.text}</Note> : null}

      {c.loading ? (
        <div className="h-64 animate-pulse rounded-card bg-surface" aria-busy="true" aria-label="Loading your cart" />
      ) : !d || rebuilding ? (
        <StartCard
          c={c}
          retailer={retailer}
          setRetailer={setRetailer}
          fulfillment={fulfillment}
          setFulfillment={setFulfillment}
          last={done ? d : null}
          onCancel={rebuilding ? () => setRebuilding(false) : null}
          onBuild={async () => {
            await c.build(retailer, fulfillment);
            setRebuilding(false);
          }}
        />
      ) : done ? (
        <div className="space-y-4">
          <SentView c={c} d={d} />
          <Button variant="secondary" onClick={() => setRebuilding(true)} icon={<ShoppingCart className="size-4" aria-hidden />}>
            Build a new cart
          </Button>
        </div>
      ) : (
        <DraftView c={c} d={d} names={household.names} onRebuild={() => setRebuilding(true)} />
      )}
    </div>
  );
}

type Cart = ReturnType<typeof useCart>;

function Note({ tone, children }: { tone: "info" | "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("mb-4 rounded-2xl px-4 py-3 text-[15px]", tone === "error" ? "bg-danger/10 text-danger" : tone === "success" ? "bg-accent-soft text-accent" : "bg-surface")}
    >
      {children}
    </p>
  );
}

function StartCard({
  c,
  retailer,
  setRetailer,
  fulfillment,
  setFulfillment,
  last,
  onBuild,
  onCancel,
}: {
  c: Cart;
  retailer: string;
  setRetailer: (r: string) => void;
  fulfillment: FulfillmentMethod;
  setFulfillment: (f: FulfillmentMethod) => void;
  last: CartDraft | null;
  onBuild: () => Promise<void>;
  onCancel: (() => void) | null;
}) {
  const chosen = c.retailers.find((r) => r.id === retailer);
  const fulfillmentOptions = fulfillmentMethods.filter((f) => chosen?.fulfillment.includes(f.code));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <Eyebrow>1 · Your list</Eyebrow>
        <h2 className="mt-1 text-xl font-bold tracking-tight">{c.listCount === 0 ? "The grocery list is empty" : `${c.listCount} items on the shared grocery list`}</h2>
        <p className="mt-1 text-[15px] text-muted">
          Duplicates are combined and what&apos;s already in your kitchen is taken off (plan items) or flagged (typed items).{" "}
          <Link href="/grocery" className="font-medium text-foreground underline underline-offset-4">
            {c.listCount === 0 ? "Add this week's meal plan" : "Review the list"}
          </Link>
        </p>

        <div className="mt-4">
          <FromPlan c={c} />
        </div>

        <div className="mt-6">
          <Eyebrow>2 · Where to shop</Eyebrow>
          <div role="radiogroup" aria-label="Retailer" className="mt-3 grid gap-2.5">
            {c.retailers.map((r) => (
              <div key={r.id} className={cn(!r.available && "opacity-60")}>
                <ChoiceCard
                  selected={retailer === r.id}
                  onSelect={() => r.available && setRetailer(r.id)}
                  title={r.name}
                  description={r.note ?? undefined}
                />
              </div>
            ))}
          </div>
          {retailer === "kroger" && chosen?.available ? (
            <p className="mt-3 text-[15px]">
              Prices from <strong>{c.store?.name ?? "—"}</strong>{" "}
              <Link href="/grocery" className="text-accent underline underline-offset-4">
                {c.store ? "Change store" : "Choose your store"}
              </Link>
              . Kroger adds items to the store selected on your Kroger account, so check it matches.
            </p>
          ) : null}
        </div>

        {fulfillmentOptions.length > 0 ? (
          <div className="mt-5">
            <p className="mb-2 text-[15px] font-semibold">Curbside pickup or delivery?</p>
            <Segmented label="Pickup or delivery" value={fulfillment} onChange={setFulfillment} options={fulfillmentOptions.map((f) => ({ value: f.code, label: f.label }))} />
            <Hint>You choose the time slot at the store&apos;s site, where available.</Hint>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={c.busy === "building" || c.listCount === 0 || !chosen?.available} onClick={() => void onBuild()} icon={<ShoppingCart className="size-5" aria-hidden />}>
            {c.busy === "building" ? "Matching products…" : "Build my cart"}
          </Button>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <Eyebrow>How it works</Eyebrow>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>We match each item to the store&apos;s real products, with brand, size, price and stock.</li>
          <li>Anyone in your household can review it. Substitutions and unclear amounts wait for a yes.</li>
          <li>One person approves and sends it — it&apos;s sent once, even if you tap twice or retry.</li>
          <li>You finish at the store&apos;s site: pickup or delivery time, and payment. We never see or store card details.</li>
        </ol>
        {last ? (
          <p className="mt-4 text-[14px] text-muted">
            Last cart: {last.status === "sent" ? "sent" : last.status === "link_ready" ? "list opened" : last.status} {timeFmt(last.updatedAt)}
            {last.purchase === "ordered" ? " · order placed" : ""}.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/** "After creating a meal plan, Build My Cart": put the week's plan on the shared list first. */
function FromPlan({ c }: { c: Cart }) {
  const weeks = useWeekOptions();
  const [weekStart, setWeekStart] = useState(weeks[nightsLeft(weeks[0]!.weekStart, todayIso()) < 2 ? 1 : 0]!.weekStart);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-border">
      <PlanCard
        weeks={weeks.slice(0, 2)}
        weekStart={weekStart}
        onWeek={setWeekStart}
        hasPlanItems={c.hasPlanItems}
        onAdd={async (lines, planId) => {
          const r = await c.addPlan(lines, planId);
          setNote(r.ok ? (r.data.added === 0 ? "Everything from the plan is already on the list." : `Added ${r.data.added} items from the meal plan.`) : r.message);
        }}
      />
      {note ? <p role="status" className="px-5 pb-4 text-[14px] text-muted">{note}</p> : null}
    </div>
  );
}

function DraftView({ c, d, names, onRebuild }: { c: Cart; d: CartDraft; names: ReadonlyMap<string, string>; onRebuild: () => void }) {
  const est = useMemo(() => cartEstimate(d.lines), [d.lines]);
  const blockers = useMemo(() => cartBlockers(d.lines), [d.lines]);
  const editable = d.status === "draft" || d.status === "failed" || d.status === "approved";
  const retailerName = c.retailers.find((r) => r.id === d.retailer)?.name.split(" (")[0] ?? d.retailer;
  const sample = d.retailer === "mock";
  const groups: Array<[string, CartLine[]]> = [
    ["Needs your OK", d.lines.filter((l) => l.include && !l.approved)],
    ["In the cart", d.lines.filter((l) => l.include && l.approved)],
    ["Not in the cart", d.lines.filter((l) => !l.include)],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
      <div className="space-y-4">
        {d.status === "unknown" ? <UnknownCard c={c} d={d} /> : null}
        {groups.map(([title, lines]) =>
          lines.length === 0 ? null : (
            <section key={title} aria-label={title}>
              <h2 className="mb-2 text-[15px] font-semibold uppercase tracking-[0.12em] text-muted">
                {title} · {lines.length}
              </h2>
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li key={l.id}>
                    <LineCard line={l} editable={editable && c.busy !== "sending"} onChange={(fn) => c.editLine(l.id, fn)} />
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <Card>
          <Eyebrow>{sample ? "Practice cart" : `${retailerName} cart`}</Eyebrow>
          <p className="mt-1 text-[15px] text-muted">{d.storeName ?? "Sample Market"}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums">{formatCents(est.estimatedCents)}</p>
          <p className="text-[14px] text-muted">
            Estimate for {est.includedCount} item{est.includedCount === 1 ? "" : "s"}
            {est.unpricedCount ? ` (${est.unpricedCount} without a price)` : ""}
            {est.saleSavingsCents > 0 ? ` · ${formatCents(est.saleSavingsCents)} in sale prices` : ""}
          </p>
          <p className="mt-2 rounded-xl bg-background px-3 py-2 text-[13px] text-muted">
            {sample
              ? "Sample prices — not from any real store."
              : `Not your checkout total. ${retailerName} sets the final price at checkout (weighed items, price changes, taxes and fees).`}
            {est.oldestPriceAt && !sample ? ` Prices as of ${timeFmt(est.oldestPriceAt)}.` : ""}
          </p>

          {editable ? (
            <div className="mt-4">
              <Segmented
                label="Pickup or delivery"
                value={d.fulfillment}
                onChange={(f) => c.setFulfillment(f)}
                options={fulfillmentMethods.map((f) => ({ value: f.code, label: f.label }))}
              />
            </div>
          ) : (
            <p className="mt-3 text-[15px]">{fulfillmentMethods.find((f) => f.code === d.fulfillment)?.label}</p>
          )}

          <div className="mt-5 space-y-3">
            {d.status === "draft" || d.status === "failed" ? (
              <>
                {d.lastError ? <p className="text-[14px] text-danger">{d.lastError}</p> : null}
                <Button className="w-full" size="lg" disabled={blockers.length > 0 || est.includedCount === 0 || c.busy !== null} onClick={() => void c.approve()} icon={<Check className="size-5" aria-hidden />}>
                  {c.busy === "approving" ? "Approving…" : "Approve this cart"}
                </Button>
                <p className="text-[13px] text-muted">
                  {blockers.length > 0
                    ? `${blockers.length} item${blockers.length === 1 ? "" : "s"} need${blockers.length === 1 ? "s" : ""} your OK first.`
                    : "Everyone in your household can see this cart. Approving locks in the products for sending."}
                </p>
              </>
            ) : d.status === "approved" || d.status === "sending" ? (
              <>
                <p className="text-[14px]">
                  <Check className="mr-1 inline size-4 text-accent" aria-hidden />
                  Approved by {d.approvedBy ? (names.get(d.approvedBy) ?? "a household member") : "you"}
                  {d.approvedAt ? ` · ${timeFmt(d.approvedAt)}` : ""}
                </p>
                {d.retailer === "kroger" && !c.krogerConnected ? (
                  <Button className="w-full" size="lg" disabled={c.busy !== null} onClick={() => void c.connectKroger()}>
                    {c.busy === "connecting" ? "Opening Kroger…" : "Connect your Kroger account"}
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" disabled={c.busy !== null || d.status === "sending"} onClick={() => void c.send()} icon={<ShoppingCart className="size-5" aria-hidden />}>
                    {c.busy === "sending" || d.status === "sending" ? "Sending…" : sample ? "Send (practice run)" : `Send to ${retailerName}`}
                  </Button>
                )}
                {c.needsAuth && d.retailer === "kroger" ? (
                  <Button variant="secondary" className="w-full" onClick={() => void c.connectKroger()}>
                    Reconnect Kroger
                  </Button>
                ) : null}
                <p className="text-[13px] text-muted">Changing anything sends the cart back for approval.</p>
              </>
            ) : null}
          </div>
        </Card>

        <ExportCard d={d} />

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!editable || c.busy !== null} onClick={onRebuild} icon={<RefreshCw className="size-4" aria-hidden />}>
            Rebuild from list
          </Button>
          <Button variant="ghost" disabled={d.status === "sending" || d.status === "unknown" || c.busy !== null} onClick={() => void c.discard()} icon={<Trash2 className="size-4" aria-hidden />}>
            Discard
          </Button>
        </div>
      </aside>
    </div>
  );
}

function LineCard({ line, editable, onChange }: { line: CartLine; editable: boolean; onChange: (fn: (l: CartLine) => CartLine) => void }) {
  const [open, setOpen] = useState(false);
  const p = selectedProduct(line);
  const needsOk = line.include && !line.approved;
  return (
    <article className={cn("rounded-2xl bg-surface p-4", needsOk && "ring-2 ring-warning/50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
            {line.name}
            {line.amountText ? <span className="normal-case tracking-normal"> · {line.amountText}</span> : null}
          </p>
          {p ? (
            <>
              <p className="mt-0.5 text-[17px] font-semibold leading-snug">{p.name}</p>
              <p className="text-[14px] text-muted">
                {[p.brand, p.sizeLabel].filter(Boolean).join(" · ")}
                {p.availability === "limited" ? " · Low stock" : ""}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-[16px] text-muted">{line.reason ?? "No product chosen"}</p>
          )}
          {line.neededFor.length > 0 ? <p className="mt-0.5 text-[13px] text-muted">For {line.neededFor.slice(0, 3).join(", ")}</p> : null}
        </div>
        {p ? (
          <div className="text-right">
            <p className="text-[17px] font-semibold tabular-nums">
              {formatCents((p.saleCents ?? p.regularCents) * line.count)}
            </p>
            <p className="text-[13px] text-muted tabular-nums">
              {line.count} × {formatCents(p.saleCents ?? p.regularCents)}
              {p.soldByWeight ? "/lb" : ""}
              {p.saleCents !== null ? <span className="ml-1 line-through">{formatCents(p.regularCents)}</span> : null}
            </p>
          </div>
        ) : null}
      </div>

      {needsOk && line.reason ? (
        <p className="mt-2 flex gap-1.5 text-[14px] text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {line.reason}
        </p>
      ) : null}
      {!needsOk && line.reason && line.include ? <p className="mt-2 text-[14px] text-muted">{line.reason}</p> : null}
            {line.inKitchen && line.include ? <p className="mt-1 text-[14px] text-accent">{line.inKitchen} — skip it if you don&apos;t need more.</p> : null}

      {editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {needsOk ? (
            <Button size="md" onClick={() => onChange(approveLine)} icon={<Check className="size-4" aria-hidden />}>
              {line.state === "substitute" ? "OK, use this" : "Looks right"}
            </Button>
          ) : null}
          {p && line.include ? (
            <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${line.name}`}>
              <button type="button" aria-label="Fewer" disabled={line.count <= 1} onClick={() => onChange((l) => setCount(l, l.count - 1))} className="grid size-9 place-items-center rounded-full border border-border bg-background disabled:opacity-35">
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="min-w-[3.5rem] text-center text-[14px] tabular-nums">
                {line.count}
                {p.soldByWeight ? " lb" : ""}
              </span>
              <button type="button" aria-label="More" disabled={line.count >= 99} onClick={() => onChange((l) => setCount(l, l.count + 1))} className="grid size-9 place-items-center rounded-full border border-border bg-background disabled:opacity-35">
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
          {line.options.length > 0 ? (
            <Button variant="secondary" size="md" aria-expanded={open} onClick={() => setOpen((o) => !o)} icon={<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />}>
              {line.options.length > 1 ? `Change (${line.options.length})` : "Details"}
            </Button>
          ) : null}
          {line.selected ? (
            <Button variant="ghost" size="md" onClick={() => onChange((l) => setInclude(l, !l.include))}>
              {line.include ? "Skip" : "Add back"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <ul className="mt-3 space-y-1.5" aria-label={`Products for ${line.name}`}>
          {line.options.map((o) => (
            <li key={o.productId}>
              <OptionRow o={o} selected={o.productId === line.selected} onPick={() => {
                onChange((l) => chooseOption(l, o.productId));
                setOpen(false);
              }} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function OptionRow({ o, selected, onPick }: { o: CartProduct; selected: boolean; onPick: () => void }) {
  const out = o.availability === "out_of_stock";
  return (
    <button
      type="button"
      disabled={out}
      onClick={onPick}
      aria-pressed={selected}
      className={cn("flex w-full items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-left disabled:opacity-50", selected ? "border-foreground" : "border-border hover:border-subtle")}
    >
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{o.name}</span>
        <span className="block text-[13px] text-muted">
          {[o.brand, o.sizeLabel].filter(Boolean).join(" · ")}
          {out ? " · Out of stock" : o.availability === "limited" ? " · Low stock" : ""}
          {o.suggestedCount ? ` · ${o.suggestedCount} for your amount` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
        {formatCents(o.saleCents ?? o.regularCents)}
        {o.soldByWeight ? "/lb" : ""}
      </span>
    </button>
  );
}

function UnknownCard({ c, d }: { c: Cart; d: CartDraft }) {
  return (
    <Card className="ring-2 ring-warning/50">
      <Eyebrow>Check your store cart</Eyebrow>
      <h2 className="mt-1 text-xl font-bold tracking-tight">We can&apos;t tell whether the items were added</h2>
      <p className="mt-1 text-[15px] text-muted">
        The send was interrupted. To avoid adding everything twice, open your {d.retailer === "kroger" ? "Kroger" : "store"} cart and tell us what you see.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {d.retailer === "kroger" ? (
          <a href="https://www.kroger.com/cart" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 font-semibold">
            Open Kroger cart <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
        <Button onClick={() => void c.resolve(true)}>The items are there</Button>
        <Button variant="secondary" onClick={() => void c.resolve(false)}>
          They&apos;re not — send again
        </Button>
      </div>
    </Card>
  );
}

function ExportCard({ d }: { d: CartDraft }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => cartAsText({ title: "Grocery list", storeName: d.storeName, lines: d.lines }), [d.lines, d.storeName]);
  return (
    <Card>
      <Eyebrow>Shopping list export</Eyebrow>
      <p className="mt-1 text-[14px] text-muted">For any store without a cart connection.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          icon={<Copy className="size-4" aria-hidden />}
        >
          {copied ? "Copied" : "Copy list"}
        </Button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="grocery-list.txt"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-[15px] font-semibold"
        >
          <Download className="size-4" aria-hidden /> Download
        </a>
      </div>
    </Card>
  );
}

/** Shown after a send: where to finish, and the household's own order status. */
export function SentView({ c, d }: { c: Cart; d: CartDraft }) {
  const r = d.result;
  return (
    <Card>
      <Eyebrow>{r?.kind === "cart_confirmed" && r.confirmedBy === "mock" ? "Practice run finished" : "Sent"}</Eyebrow>
      {r?.kind === "cart_confirmed" ? (
        <>
          <h2 className="mt-1 text-xl font-bold tracking-tight">
            {r.confirmedBy === "mock"
              ? "Nothing was sent to a real store"
              : r.confirmedBy === "household"
                ? "You confirmed the items are in your cart"
                : `The store accepted ${r.added} item${r.added === 1 ? "" : "s"} into your cart`}
          </h2>
          <p className="mt-1 text-[15px] text-muted">
            {r.confirmedBy === "mock"
              ? "This was the practice retailer — try it with a real store once it's connected."
              : "Open your cart to check it, pick a pickup or delivery time, and pay on the store's site."}
          </p>
          {r.checkoutUrl ? (
            <a href={r.checkoutUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-5 font-semibold text-background">
              Open your cart <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
        </>
      ) : r?.kind === "link" ? (
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-5 font-semibold text-background">
          {r.label} <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : null}

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-[15px] font-semibold">Did you place the order?</p>
        <p className="text-[14px] text-muted">Only you can tell us — we never see the checkout. This doesn&apos;t change the grocery list.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={d.purchase === "ordered" ? "primary" : "secondary"} onClick={() => void c.setPurchase(d.purchase !== "ordered")} icon={d.purchase === "ordered" ? <Check className="size-4" aria-hidden /> : undefined}>
            {d.purchase === "ordered" ? "Order placed" : "I placed the order"}
          </Button>
          {d.purchase === "ordered" ? (
            <Button variant="secondary" onClick={() => void c.checkOffList()}>
              Tick these off the grocery list
            </Button>
          ) : null}
        </div>
        {d.purchase === "ordered" && d.retailer !== "mock" ? (
          <p className="mt-3 text-[14px] text-muted">
            Sale savings on this order now count on{" "}
            <Link href="/savings" className="font-semibold text-foreground underline decoration-border underline-offset-4">
              Savings
            </Link>
            , where you can also log what you paid.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
