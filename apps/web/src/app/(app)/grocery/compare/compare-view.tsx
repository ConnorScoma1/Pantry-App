"use client";

import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { hoursToday, miles, type SavedShopping, type StrategyComparison, type StrategyId, type TripPlan } from "@kitchen-pantry/shopping-optimizer";
import { ArrowLeft, Check, ChevronDown, Clock, Fuel, LocateFixed, MapPin, Route, Sparkles, Star, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { Segmented, Switch, TextInput } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { useGrocery } from "@/lib/grocery/use-grocery";
import { useShopping, type Comparison } from "@/lib/shopping/use-shopping";

/**
 * One Store vs. Best Deals (spec 03). The page shows what the server
 * calculated — store prices from the retailer, drive times from the routing
 * service, the shopper's own fuel price and value of time — and says plainly
 * what's missing. Choosing a plan organises the shared list by store.
 */

const money = (c: number) => formatCents(c);
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

export function CompareView() {
  const grocery = useGrocery();
  const toBuy = useMemo(() => grocery.items.filter((i) => !i.checked), [grocery.items]);
  const shop = useShopping(grocery.items);
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const r = shop.result;
  const live = shop.status?.livePrices ?? false;

  const choose = async (strategy: StrategyId, plan: TripPlan) => {
    const res = await shop.choose(strategy, plan);
    if (res.ok) {
      setChosen(strategy);
      router.push("/grocery?view=stores");
    }
  };
  const canChoose = r ? !r.isSample || shop.mode === "preview" : false;

  return (
    <div className="animate-enter">
      <Link href="/grocery" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Grocery list
      </Link>
      <PageHeader title="One store or best deals?" subtitle="Compare your list across nearby stores — groceries, fuel and your time — before you leave." />

      {shop.status && !live ? (
        <p className="mb-4 rounded-2xl border border-price-estimated/40 bg-price-estimated/10 px-4 py-3 text-[15px]">
          <span className="font-semibold">Practice comparison.</span> Store prices aren&apos;t connected on this server yet, so this uses three made-up sample
          stores, sample prices and sample drive times — not real ones.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {live ? (
            <Segmented
              label="Which stores"
              options={[
                { value: "live", label: "Real stores" },
                { value: "practice", label: "Practice (sample data)" },
              ]}
              value={shop.practice ? "practice" : "live"}
              onChange={(v) => shop.setPractice(v === "practice")}
            />
          ) : null}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[16px]">
                <span className="font-semibold">{toBuy.length} items</span> <span className="text-muted">left to buy on your list</span>
              </p>
              <Button
                size="lg"
                disabled={!shop.loaded || shop.busy === "compare" || toBuy.length === 0 || (!shop.practice && shop.saved.compareStoreIds.length === 0)}
                onClick={() => void shop.compare()}
                icon={<Route className={cn("size-5", shop.busy === "compare" && "animate-pulse")} aria-hidden />}
              >
                {shop.busy === "compare" ? "Comparing…" : r ? "Compare again" : "Compare stores"}
              </Button>
            </div>
            {!shop.practice && shop.saved.compareStoreIds.length === 0 ? <Hint>Choose the stores to compare first.</Hint> : null}
            {toBuy.length === 0 && !grocery.loading ? <Hint>Your list is empty — add things to compare.</Hint> : null}
            {shop.error ? (
              <p role="alert" className="mt-3 text-[15px] text-danger">
                {shop.error}
              </p>
            ) : null}
          </Card>

          {r ? (
            <>
              <Recommendation r={r} shop={shop} />
              <ComparisonTable r={r} />
              <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                {r.oneStore ? <PlanCard title="One store" id="one_store" plan={r.oneStore} r={r} canChoose={canChoose} busy={shop.busy === "trip"} chosen={chosen === "one_store"} onChoose={choose} itemNames={shop.itemNames} /> : null}
                {r.bestDeals && r.bestDeals.storeKeys.join() !== r.oneStore?.storeKeys.join() ? (
                  <PlanCard title="Best deals" id="best_deals" plan={r.bestDeals} r={r} canChoose={canChoose} busy={shop.busy === "trip"} chosen={chosen === "best_deals"} onChoose={choose} itemNames={shop.itemNames} />
                ) : null}
                {r.bestValue && r.bestValue.storeKeys.join() !== r.bestDeals?.storeKeys.join() && r.bestValue.storeKeys.join() !== r.oneStore?.storeKeys.join() ? (
                  <PlanCard title="Best overall value" id="best_value" plan={r.bestValue} r={r} canChoose={canChoose} busy={shop.busy === "trip"} chosen={chosen === "best_value"} onChoose={choose} itemNames={shop.itemNames} />
                ) : null}
              </div>
              {r.isSample && shop.mode !== "preview" ? <Hint>Practice plans can&apos;t organise your real list. Compare real stores to do that.</Hint> : null}
              <SinglesCard r={r} />
              <ItemsCard r={r} itemNames={shop.itemNames} />
              <Limitations r={r} />
            </>
          ) : null}
        </div>

        <div className={cn("flex min-w-0 flex-col gap-4", !r && "order-first lg:order-none")}>
          {!shop.practice ? <StoresCard shop={shop} /> : <SampleStoresCard />}
          <TripSettingsCard shop={shop} />
        </div>
      </div>
    </div>
  );
}

type Shop = ReturnType<typeof useShopping>;

function ConfidenceBadge({ r }: { r: Comparison }) {
  const label = r.isSample ? "Sample data" : r.confidence === "complete" ? "Complete prices" : r.confidence === "partial" ? "Partial data" : "Not enough data";
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-3 text-[13px] font-semibold",
        r.isSample || r.confidence !== "complete" ? "bg-price-estimated/15 text-price-estimated" : "bg-price-verified/15 text-price-verified",
      )}
    >
      {label}
    </span>
  );
}

function Recommendation({ r, shop }: { r: Comparison; shop: Shop }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Recommendation</Eyebrow>
        <ConfidenceBadge r={r} />
      </div>
      <p className="mt-2 text-[20px] font-semibold leading-snug" aria-live="polite">
        {r.recommendation.text}
      </p>
      {shop.advice ? (
        <div className="mt-4 rounded-2xl bg-background p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
            <Sparkles className="size-4" aria-hidden /> {shop.advice.source === "ai" ? "AI advisor" : "In short"}
          </p>
          <p className="mt-1.5 text-[16px] leading-relaxed">{shop.advice.summary}</p>
          {shop.advice.tips.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-muted">
              {shop.advice.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          {shop.advice.notice ? <Hint className="mt-2">{shop.advice.notice}</Hint> : null}
          {shop.advice.source === "ai" ? <p className="mt-2 text-[13px] text-subtle">Explains the numbers above; it can&apos;t change a price or a distance.</p> : null}
        </div>
      ) : shop.status?.advisor && r.adviceToken ? (
        <Button variant="secondary" className="mt-4" disabled={shop.busy === "advice"} onClick={() => void shop.explain()} icon={<Sparkles className="size-4" aria-hidden />}>
          {shop.busy === "advice" ? "Thinking…" : "Explain this"}
        </Button>
      ) : null}
      <p className="mt-3 text-[13px] text-subtle">
        {r.isSample ? "Sample prices and drive times." : `Prices from Kroger${r.oldestPriceAt ? `, checked ${new Date(r.oldestPriceAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}.`}{" "}
        {r.travelProvider ? `Drive times from ${r.travelProvider}.` : ""} Tax and fees aren&apos;t included.
      </p>
      {r.routingNote ? <Hint>{r.routingNote}</Hint> : null}
    </Card>
  );
}

function cell(key: string, v: ReactNode) {
  return (
    <td key={key} className="px-2 py-2 text-right tabular-nums">
      {v}
    </td>
  );
}

function ComparisonTable({ r }: { r: Comparison }) {
  const cols: Array<{ label: string; plan: TripPlan; vs: StrategyComparison | null }> = [];
  if (r.oneStore) cols.push({ label: "One store", plan: r.oneStore, vs: null });
  if (r.bestDeals && r.bestDeals.storeKeys.join() !== r.oneStore?.storeKeys.join()) cols.push({ label: "Best deals", plan: r.bestDeals, vs: r.dealsVsOne });
  if (r.bestValue && !cols.some((c) => c.plan.storeKeys.join() === r.bestValue!.storeKeys.join())) cols.push({ label: "Best value", plan: r.bestValue, vs: r.valueVsOne });
  if (cols.length === 0) return null;
  const row = (label: string, render: (c: (typeof cols)[number]) => ReactNode, note?: string) => (
    <tr className="border-t border-border">
      <th scope="row" className="px-2.5 py-2.5 text-left font-medium sm:px-3">
        {label}
        {note ? <span className="block text-[12px] font-normal text-subtle">{note}</span> : null}
      </th>
      {cols.map((c) => (
        <td key={c.label} className="px-2.5 py-2.5 text-right tabular-nums sm:px-3">
          {render(c)}
        </td>
      ))}
    </tr>
  );
  const dash = <span className="text-subtle">—</span>;
  return (
    <Card className="overflow-x-auto p-0 sm:p-0">
      <table className="w-full min-w-[330px] text-[14px] sm:text-[15px]">
        <caption className="sr-only">Shopping strategies compared</caption>
        <thead>
          <tr>
            <td className="px-3 py-3" />
            {cols.map((c) => (
              <th key={c.label} scope="col" className="px-2.5 py-3 text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-muted sm:px-3 sm:text-[13px]">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row("Grocery total", (c) => (
            <span>
              <span className="font-semibold">{money(c.plan.groceryCents)}</span>
              {c.plan.pricedCount < c.plan.itemCount ? <span className="block text-[12px] text-muted">{c.plan.pricedCount} of {c.plan.itemCount} items</span> : null}
            </span>
          ))}
          {row("Stores visited", (c) => c.plan.storeKeys.length)}
          {row("Drive time", (c) => (c.plan.travel ? mins(Math.round(c.plan.travel.driveSeconds / 60)) : dash))}
          {row("Fuel", (c) => (c.plan.travel?.fuelCents != null ? money(c.plan.travel.fuelCents) : dash), r.travelAvailable ? undefined : "needs drive times")}
          {row("Total cash cost", (c) => (c.plan.cashCents !== null ? <span className="font-semibold">{money(c.plan.cashCents)}</span> : dash), "groceries + fuel")}
          {row("Cash savings", (c) => {
            if (!c.vs) return dash;
            const v = c.vs.netSavingsCents ?? c.vs.grocerySavingsCents;
            return (
              <span className={cn("font-semibold", v > 0 ? "text-success" : "text-muted")}>
                {v >= 0 ? money(v) : `−${money(-v)}`}
                {c.vs.netSavingsCents === null ? <span className="block text-[12px] font-normal text-muted">before fuel</span> : null}
              </span>
            );
          }, "vs one store, same items")}
          {row("Extra time", (c) => (c.vs?.extraMinutes != null ? (c.vs.extraMinutes > 0 ? `+${mins(c.vs.extraMinutes)}` : "—") : dash), "driving + in store")}
        </tbody>
      </table>
    </Card>
  );
}

function storeName(r: Comparison, key: string) {
  return r.stores.find((s) => s.key === key)?.name ?? "Store";
}

function PlanCard({
  title,
  id,
  plan,
  r,
  canChoose,
  busy,
  chosen,
  onChoose,
  itemNames,
}: {
  title: string;
  id: StrategyId;
  plan: TripPlan;
  r: Comparison;
  canChoose: boolean;
  busy: boolean;
  chosen: boolean;
  onChoose: (s: StrategyId, p: TripPlan) => void;
  itemNames: Map<string, string>;
}) {
  const recommended = r.recommendation.strategy === id;
  return (
    <Card className={cn(recommended && "ring-2 ring-foreground")}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        {recommended ? <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[12px] font-semibold text-background">Recommended</span> : null}
      </div>
      <p className="mt-1 text-[28px] font-bold tabular-nums tracking-tight">{money(plan.groceryCents)}</p>
      <p className="text-[14px] text-muted">
        {plan.storeKeys.length === 1 ? "1 store" : `${plan.storeKeys.length} stores`}
        {plan.travel ? ` · ${mins(plan.travel.totalMinutes)} with driving · ${miles(plan.travel.meters).toFixed(1)} mi` : ""}
      </p>
      <ol className="mt-3 space-y-2">
        {plan.stops.map((s, i) => {
          const store = r.stores.find((x) => x.key === s.storeKey);
          const hours = store ? hoursToday(store.hours, new Date()) : null;
          return (
            <li key={s.storeKey} className="rounded-2xl bg-background px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 font-semibold">
                  {plan.stops.length > 1 ? `${i + 1}. ` : ""}
                  {storeName(r, s.storeKey)}
                </span>
                <span className="shrink-0 tabular-nums">{money(s.subtotalCents)}</span>
              </div>
              <p className="text-[13px] text-muted">
                {s.itemIds.length} item{s.itemIds.length === 1 ? "" : "s"}
                {hours ? ` · ${hours}` : ""}
              </p>
              {s.arrivalNote ? <p className="mt-1 text-[13px] font-medium text-danger">{s.arrivalNote}</p> : null}
              {plan.stops.length > 1 ? (
                <p className="mt-1 line-clamp-2 text-[13px] text-subtle">{s.itemIds.map((x) => itemNames.get(x) ?? "item").join(", ")}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {plan.missingIds.length ? (
        <Hint>
          Not priced here: {plan.missingIds.slice(0, 5).map((x) => itemNames.get(x) ?? "item").join(", ")}
          {plan.missingIds.length > 5 ? ` and ${plan.missingIds.length - 5} more` : ""}.
        </Hint>
      ) : null}
      {plan.saleNotCountedCents > 0 ? <Hint>{money(plan.saleNotCountedCents)} in sale prices not counted — they may need a loyalty card.</Hint> : null}
      {plan.saleSavingsCents > 0 ? <Hint className="text-success">Includes {money(plan.saleSavingsCents)} in sale prices.</Hint> : null}
      {canChoose ? (
        <Button variant={recommended ? "primary" : "secondary"} className="mt-4 w-full" disabled={busy} onClick={() => onChoose(id, plan)} icon={chosen ? <Check className="size-4" aria-hidden /> : undefined}>
          {plan.storeKeys.length === 1 ? "Shop here" : "Split my list this way"}
        </Button>
      ) : null}
    </Card>
  );
}

function SinglesCard({ r }: { r: Comparison }) {
  if (r.singles.length < 2) return null;
  return (
    <Card>
      <Eyebrow>Each store on its own</Eyebrow>
      <ul className="mt-3 divide-y divide-border">
        {r.singles.map((p, i) => (
          <li key={p.storeKeys[0]} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {storeName(r, p.storeKeys[0]!)}
              </span>
              <span className="block text-[13px] text-muted">
                {i === 0 ? <span className="font-semibold text-success">Best single store · </span> : null}
                {p.pricedCount} of {p.itemCount} items priced{p.travel ? ` · ${mins(Math.round(p.travel.driveSeconds / 60))} round trip` : ""}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{money(p.groceryCents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ItemsCard({ r, itemNames }: { r: Comparison; itemNames: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  const ids = [...new Set(r.lines.map((l) => l.itemId))];
  const missing = [...itemNames.keys()].filter((id) => !ids.includes(id) && (r.oneStore?.missingIds.includes(id) || r.bestDeals?.missingIds.includes(id)));
  const at = (id: string, key: string) => r.lines.find((l) => l.itemId === id && l.storeKey === key) ?? null;
  return (
    <Card>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full min-h-10 items-center justify-between text-left">
        <Eyebrow>Item by item</Eyebrow>
        <ChevronDown className={cn("size-5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[14px]">
            <thead>
              <tr>
                <th scope="col" className="py-2 pr-3 text-left font-semibold">
                  Item
                </th>
                {r.stores.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-2 text-right font-semibold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...ids, ...missing].map((id) => {
                const prices = r.stores.map((s) => at(id, s.key)?.cents ?? null).filter((c): c is number => c !== null);
                const best = prices.length ? Math.min(...prices) : null;
                return (
                  <tr key={id} className="border-t border-border">
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {itemNames.get(id) ?? "Item"}
                    </th>
                    {r.stores.map((s) => {
                      const l = at(id, s.key);
                      if (!l) return cell(s.key, <span className="text-subtle">—</span>);
                      return cell(
                        s.key,
                        <span className={cn(l.cents === best && prices.length > 1 && "font-semibold text-success")}>
                          {money(l.cents)}
                          {l.saleNeedsMembership ? <span title="Sale price may need a card — regular price shown">*</span> : null}
                          {l.onSale ? <span className="block text-[11px] font-semibold text-success">Sale</span> : null}
                        </span>,
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[13px] text-subtle">— no usable price at that store. * A sale price may need a loyalty card, so the regular price is shown.</p>
        </div>
      ) : null}
    </Card>
  );
}

function Limitations({ r }: { r: Comparison }) {
  if (!r.limitations.length) return null;
  return (
    <Card>
      <Eyebrow>What this doesn&apos;t include</Eyebrow>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-muted">
        {r.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </Card>
  );
}

function SampleStoresCard() {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Store className="size-5 text-muted" aria-hidden />
        <Eyebrow>Sample stores</Eyebrow>
      </div>
      <ul className="mt-3 space-y-1.5 text-[15px]">
        <li>Sample Supermarket A — sales open to everyone</li>
        <li>Sample Discount B — cheaper, card-only sales</li>
        <li>Sample Produce Market C — produce only</li>
      </ul>
      <Hint>Made-up stores, prices and drive times so you can try the comparison. Nothing here is real.</Hint>
    </Card>
  );
}

function StoresCard({ shop }: { shop: Shop }) {
  const ids = shop.saved.compareStoreIds;
  const s = shop.saved.settings;
  const known = useMemo(() => {
    const m = new Map<string, { name: string; address: string }>();
    for (const st of shop.result?.stores ?? []) m.set(st.storeId, { name: st.name, address: st.address ?? "" });
    for (const st of shop.nearby ?? []) m.set(st.locationId, { name: st.name, address: [st.address, st.city].filter(Boolean).join(", ") });
    return m;
  }, [shop.nearby, shop.result]);
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 6 ? ids : [...ids, id];
    void shop.save({ ...shop.saved, compareStoreIds: next, settings: { ...s, excludedStores: s.excludedStores.filter((k) => k !== `kroger:${id}`) } });
  };
  const star = (id: string) => {
    const key = `kroger:${id}`;
    const preferredStores = s.preferredStores.includes(key) ? s.preferredStores.filter((k) => k !== key) : [...s.preferredStores, key].slice(0, 10);
    void shop.save({ ...shop.saved, settings: { ...s, preferredStores } });
  };
  const exclude = (id: string) => {
    const key = `kroger:${id}`;
    const excludedStores = s.excludedStores.includes(key) ? s.excludedStores.filter((k) => k !== key) : [...s.excludedStores, key].slice(0, 20);
    void shop.save({ ...shop.saved, compareStoreIds: ids.filter((x) => x !== id), settings: { ...s, excludedStores } });
  };
  const list = shop.nearby ? shop.nearby.map((n) => n.locationId) : ids;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Store className="size-5 text-muted" aria-hidden />
        <Eyebrow>Stores to compare</Eyebrow>
      </div>
      <Hint className="mt-1">Kroger-family stores with live prices (up to 6). Other chains appear once their prices can be read legitimately.</Hint>
      <ul className="mt-3 space-y-2">
        {list.map((id) => {
          const info = known.get(id);
          const on = ids.includes(id);
          const preferred = s.preferredStores.includes(`kroger:${id}`);
          const excluded = s.excludedStores.includes(`kroger:${id}`);
          return (
            <li key={id} className={cn("flex items-center gap-2 rounded-2xl bg-background px-3 py-2", excluded && "opacity-60")}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border-2", on ? "border-foreground bg-foreground text-background" : "border-border")}>
                  {on ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{info?.name ?? `Store ${id}`}</span>
                  {info?.address ? <span className="block truncate text-[13px] text-muted">{info.address}</span> : null}
                  {shop.usualStoreKey === `kroger:${id}` ? <span className="block text-[12px] font-semibold text-muted">Your usual store</span> : null}
                </span>
              </button>
              <button type="button" aria-pressed={preferred} aria-label={`Prefer ${info?.name ?? "this store"}`} onClick={() => star(id)} className="grid size-11 place-items-center rounded-full hover:bg-surface">
                <Star className={cn("size-5", preferred ? "fill-current text-foreground" : "text-subtle")} aria-hidden />
              </button>
              <button type="button" aria-pressed={excluded} onClick={() => exclude(id)} className="min-h-11 rounded-full px-2 text-[13px] font-medium text-muted hover:bg-surface">
                {excluded ? "Excluded" : "Exclude"}
              </button>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" className="mt-3 w-full" disabled={shop.busy === "stores"} onClick={() => void shop.findNearby()} icon={<MapPin className="size-4" aria-hidden />}>
        {shop.busy === "stores" ? "Finding…" : shop.nearby ? "Refresh nearby stores" : "Find stores near me"}
      </Button>
      <Hint>Star the stores you prefer — when two trips cost about the same, the one with your favourites wins.</Hint>
    </Card>
  );
}

function NumberField({ label, value, onCommit, suffix, prefix, step = 1, min, max, placeholder, hint }: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  suffix?: string;
  prefix?: string;
  step?: number;
  min: number;
  max: number;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const commit = () => {
    const t = text.trim();
    if (t === "") return onCommit(null);
    const n = Number(t);
    if (!Number.isFinite(n)) return setText(value === null ? "" : String(value));
    onCommit(Math.min(max, Math.max(min, n)));
  };
  return (
    <div>
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        {prefix ? <span className="text-muted">{prefix}</span> : null}
        <TextInput id={id} inputMode="decimal" step={step} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))} onBlur={commit} />
        {suffix ? <span className="shrink-0 text-[15px] text-muted">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-[13px] text-subtle">{hint}</p> : null}
    </div>
  );
}

function TripSettingsCard({ shop }: { shop: Shop }) {
  const s = shop.saved.settings;
  const set = (patch: Partial<SavedShopping["settings"]>) => void shop.save({ ...shop.saved, settings: { ...s, ...patch } });
  const addressId = useId();
  const [address, setAddress] = useState(shop.saved.startAddress ?? "");
  useEffect(() => setAddress(shop.saved.startAddress ?? ""), [shop.saved.startAddress]);
  const card = shop.practice ? { key: "sample discount", label: "I have a Sample Discount card" } : { key: "kroger", label: "I have a Kroger family loyalty card" };
  const hasCard = s.loyaltyRetailers.includes(card.key);
  const [more, setMore] = useState(false);
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Route className="size-5 text-muted" aria-hidden />
        <Eyebrow>Your trip</Eyebrow>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-[15px] font-medium">Most stores to visit</p>
          <Segmented
            label="Most stores to visit"
            options={[
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
            ]}
            value={String(s.maxStops)}
            onChange={(v) => set({ maxStops: Number(v) as 1 | 2 | 3 | 4 })}
          />
        </div>

        {!shop.practice ? (
          <div>
            <label htmlFor={addressId} className="text-[15px] font-medium">
              Starting from
            </label>
            {shop.devicePoint ? (
              <p className="mt-1 flex items-center justify-between gap-2 rounded-2xl bg-background px-4 py-3 text-[15px]">
                <span className="flex items-center gap-2">
                  <LocateFixed className="size-4" aria-hidden /> Your current location (not saved)
                </span>
                <Button variant="ghost" className="-mr-3" onClick={shop.clearDevicePoint}>
                  Use address
                </Button>
              </p>
            ) : (
              <>
                <TextInput
                  id={addressId}
                  className="mt-1"
                  value={address}
                  maxLength={200}
                  placeholder="Home address or ZIP"
                  autoComplete="street-address"
                  onChange={(e) => setAddress(e.target.value)}
                  onBlur={() => {
                    const t = address.trim();
                    if ((t || null) !== shop.saved.startAddress && (t.length === 0 || t.length >= 3)) void shop.save({ ...shop.saved, startAddress: t || null });
                  }}
                />
                <Button variant="ghost" className="mt-1 -ml-3" onClick={shop.locateMe} icon={<LocateFixed className="size-4" aria-hidden />}>
                  Use my current location
                </Button>
              </>
            )}
            <p className="mt-1 text-[13px] text-subtle">
              {shop.status?.routing ? "Used only to get drive times for this comparison; your address is saved for you alone." : "Drive times need a routing service on the server — without one, fuel and time aren't included."}
            </p>
          </div>
        ) : null}

        <Switch label="Include the drive home" checked={s.returnHome} onChange={(v) => set({ returnHome: v })} />

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Fuel price" prefix="$" suffix="/gal" min={0.5} max={20} step={0.01} value={s.fuelCentsPerGallon === null ? null : s.fuelCentsPerGallon / 100} placeholder="e.g. 3.29" onCommit={(v) => set({ fuelCentsPerGallon: v === null ? null : Math.round(v * 100) })} hint="What you pay — we don't guess." />
          <NumberField label="Your car" suffix="mpg" min={5} max={150} value={s.milesPerGallon} onCommit={(v) => set({ milesPerGallon: v })} />
        </div>
        <NumberField label="Your time is worth" prefix="$" suffix="/hour" min={0} max={500} value={s.valueOfTimeCentsPerHour / 100} onCommit={(v) => set({ valueOfTimeCentsPerHour: Math.round((v ?? 0) * 100) })} hint="Used for Best overall value. Set 0 to ignore time." />

        <Switch label={card.label} checked={hasCard} onChange={(v) => set({ loyaltyRetailers: v ? [...new Set([...s.loyaltyRetailers, card.key])] : s.loyaltyRetailers.filter((x) => x !== card.key) })} description="Sale prices count only with the card." />

        <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="inline-flex min-h-10 items-center gap-1 self-start text-[15px] font-medium text-muted hover:text-foreground">
          More limits <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} aria-hidden />
        </button>
        {more ? (
          <div className="flex flex-col gap-4">
            <NumberField label="Time in each store" suffix="min" min={0} max={90} value={s.minutesPerStop} onCommit={(v) => set({ minutesPerStop: Math.round(v ?? 0) })} hint="Your estimate for parking and checkout." />
            <NumberField label="Most extra time" suffix="min" min={0} max={240} value={s.maxExtraMinutes} placeholder="No limit" onCommit={(v) => set({ maxExtraMinutes: v === null ? null : Math.round(v) })} />
            <NumberField label="Most driving" suffix="mi" min={1} max={200} value={s.maxDriveMiles} placeholder="No limit" onCommit={(v) => set({ maxDriveMiles: v })} />
            <NumberField label="Stores within" suffix="mi" min={1} max={50} value={s.radiusMiles} onCommit={(v) => set({ radiusMiles: v ?? 10 })} />
            <Switch label="I use digital coupons" checked={s.digitalCoupons} onChange={(v) => set({ digitalCoupons: v })} description="No coupon source is connected yet, so coupons aren't counted." />
          </div>
        ) : null}
        <p className="flex items-center gap-1.5 text-[13px] text-subtle">
          <Fuel className="size-3.5" aria-hidden /> <Clock className="size-3.5" aria-hidden /> Your settings are yours alone — other household members don&apos;t see them.
        </p>
      </div>
    </Card>
  );
}
