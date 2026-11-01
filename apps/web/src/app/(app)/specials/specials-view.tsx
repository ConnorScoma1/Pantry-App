"use client";

import { formatCents, type Special } from "@kitchen-pantry/grocery-pricing";
import { viewSpecials, type ShownSpecial, type SpecialsSort } from "@kitchen-pantry/meal-planner";
import { groceryDepartments, labelFor, type GroceryDepartment } from "@kitchen-pantry/shared-types";
import { Check, ExternalLink, Leaf, ListPlus, RefreshCw, Search, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/profile/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { Chip, ChipGroup, Segmented, Switch, TextInput } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { useSpecials } from "@/lib/specials/use-specials";

const DISCOUNTS = [
  { value: "0", label: "Any" },
  { value: "20", label: "20%+" },
  { value: "33", label: "33%+" },
  { value: "50", label: "50%+" },
] as const;
const SORTS: ReadonlyArray<{ value: SpecialsSort; label: string }> = [
  { value: "relevant", label: "For you" },
  { value: "discount", label: "Most off" },
  { value: "unit_price", label: "Unit price" },
];

/** "19¢/oz", "$3.00/lb". */
export function unitLabel(cents: number, per: string): string {
  return cents < 100 ? `${cents}¢/${per}` : `${formatCents(cents)}/${per}`;
}

const dayFmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function SpecialsView() {
  const { profile } = useProfile();
  const s = useSpecials();
  const [department, setDepartment] = useState<GroceryDepartment | null>(null);
  const [discount, setDiscount] = useState<(typeof DISCOUNTS)[number]["value"]>("0");
  const [fitsDiet, setFitsDiet] = useState(true);
  const [sort, setSort] = useState<SpecialsSort>("relevant");
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const view = useMemo(
    () =>
      s.result
        ? viewSpecials(s.result.specials, { profile, listNames: s.listNames, seasonal: s.seasonal }, { department, minPercentOff: Number(discount), fitsDiet, query, sort })
        : null,
    [s.result, profile, s.listNames, s.seasonal, department, discount, fitsDiet, query, sort],
  );

  const subtitle = s.store ? `Sale prices at ${s.store.name}.` : "Sale prices at your store.";

  return (
    <div className="animate-enter">
      <PageHeader
        title="Specials"
        subtitle={subtitle}
        action={
          s.store && s.enabled ? (
            <Button variant="secondary" disabled={s.busy} onClick={() => void s.refresh()} icon={<RefreshCw className={cn("size-4", s.busy && "animate-spin")} aria-hidden />}>
              {s.busy ? "Checking…" : "Refresh"}
            </Button>
          ) : null
        }
      />

      {s.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading specials">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
      ) : !s.enabled ? (
        <Card>
          <Eyebrow>Not connected yet</Eyebrow>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Specials need a store price connection</h2>
          <p className="mt-2 max-w-2xl text-[16px] text-muted">
            Specials come straight from your store&apos;s own prices, so nothing is shown until the server has Kroger API keys (see the README).
            We never make up a sale.
          </p>
        </Card>
      ) : !s.store ? (
        <Card>
          <Eyebrow>Choose your store</Eyebrow>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Which store do you shop at?</h2>
          <p className="mt-2 max-w-2xl text-[16px] text-muted">
            Pick a Kroger-family store (Kroger, Pick &apos;n Save, Ralphs, Fred Meyer, King Soopers and more) on the Grocery List and its sale prices show up here.
          </p>
          <Link href="/grocery" className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
            Choose a store on the Grocery List →
          </Link>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            <label className="relative block">
              <span className="sr-only">Search specials</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search specials" className="pl-12" />
            </label>
            <ChipGroup label="Department">
              <Chip selected={department === null} onToggle={() => setDepartment(null)}>
                All
              </Chip>
              {groceryDepartments
                .filter((d) => view?.departments.some((x) => x.code === d.code))
                .map((d) => (
                  <Chip key={d.code} selected={department === d.code} onToggle={() => setDepartment(department === d.code ? null : d.code)}>
                    {d.label}
                    <span className="text-[13px] text-muted">{view?.departments.find((x) => x.code === d.code)?.count}</span>
                  </Chip>
                ))}
            </ChipGroup>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full md:w-[320px]">
                <Segmented label="Discount" value={discount} onChange={setDiscount} options={DISCOUNTS} />
              </div>
              <div className="w-full md:w-[340px]">
                <Segmented label="Sort" value={sort} onChange={setSort} options={SORTS} />
              </div>
              <div className="w-full md:ml-auto md:w-auto">
                <Switch
                  label="Fits our diet"
                  description={view && view.hiddenForDiet > 0 ? `${view.hiddenForDiet} hidden` : undefined}
                  checked={fitsDiet}
                  onChange={setFitsDiet}
                />
              </div>
            </div>
          </div>

          {s.error ? <p className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">{s.error}</p> : null}
          {s.result?.warning && s.result.failed > 0 ? (
            <p className="mt-4 rounded-2xl bg-warning/10 px-4 py-3 text-[15px]">
              {s.result.warning} {s.result.failed} of {s.result.checked} items couldn&apos;t be checked.
            </p>
          ) : null}

          {view && view.shown.length > 0 ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {view.shown.map((x) => (
                <li key={x.special.id}>
                  <SpecialCard
                    x={x}
                    added={added.has(x.special.id)}
                    onAdd={async () => {
                      const r = await s.addToList(x.special);
                      if (r.ok) setAdded((cur) => new Set(cur).add(x.special.id));
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : s.result ? (
            <Card className="mt-5">
              <h2 className="text-xl font-bold tracking-tight">
                {s.result.specials.length === 0 ? `Nothing we checked is on sale at ${s.store.name} right now` : "No specials match these filters"}
              </h2>
              <Hint>
                {s.result.specials.length === 0
                  ? "Try again later — stores change sale prices through the week."
                  : "Try another department, a smaller discount, or switch off “Fits our diet”."}
              </Hint>
            </Card>
          ) : null}

          {s.result ? (
            <Card className="mt-6">
              <Eyebrow>Where these come from</Eyebrow>
              <p className="mt-2 text-[15px] text-muted">
                {s.store.name}&apos;s own prices from the Kroger API, checked at {timeFmt(s.result.fetchedAt)} for {s.result.checked} items — what&apos;s on
                your grocery list, this season&apos;s produce and everyday staples. A special is shown only when the store reports a sale price below its
                regular price. It isn&apos;t the full weekly ad: buy-one-get-one, digital coupon and loyalty-card details aren&apos;t in this source, so
                we don&apos;t guess them. &ldquo;Fits our diet&rdquo; reads product names only — always check the label for allergens.
              </p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function SpecialCard({ x, added, onAdd }: { x: ShownSpecial; added: boolean; onAdd: () => Promise<void> }) {
  const sp: Special = x.special;
  const [busy, setBusy] = useState(false);
  return (
    <article className="flex h-full flex-col rounded-card bg-surface p-5">
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
        <span className="uppercase tracking-[0.12em] text-muted">{labelFor(groceryDepartments, sp.department)}</span>
        {x.onList ? <Badge tone="accent">On your list</Badge> : null}
        {x.inSeason ? (
          <Badge tone="accent">
            <Leaf className="size-3.5" aria-hidden /> In season
          </Badge>
        ) : null}
        {sp.availability === "limited" ? <Badge tone="warning">Low stock</Badge> : null}
      </div>
      <h3 className="mt-2 text-[17px] font-semibold leading-snug">{sp.name}</h3>
      <p className="text-[14px] text-muted">{[sp.brand, sp.sizeLabel].filter(Boolean).join(" · ") || " "}</p>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-accent">
          {formatCents(sp.saleCents)}
          {sp.soldByWeight ? <span className="text-[15px] font-semibold">/lb</span> : null}
        </span>
        <span className="text-[15px] tabular-nums text-muted line-through">{formatCents(sp.regularCents)}</span>
      </div>
      <p className="flex items-center gap-1.5 text-[14px] font-medium">
        <Tag className="size-3.5 shrink-0 text-accent" aria-hidden />
        Save {formatCents(sp.regularCents - sp.saleCents)} ({sp.percentOff}% off)
      </p>
      {sp.unitPrice && !sp.soldByWeight && sp.unitPrice.saleCents !== sp.saleCents ? (
        <p className="text-[14px] text-muted">
          {unitLabel(sp.unitPrice.saleCents, sp.unitPrice.per)} <span className="line-through">{unitLabel(sp.unitPrice.regularCents, sp.unitPrice.per)}</span>
        </p>
      ) : null}
      <p className="mt-1 text-[13px] text-muted">
        {sp.endsOn ? `Ends ${dayFmt(sp.endsOn)}` : "End date not given by the store"}
        {sp.requiresMembership === null ? " · Card or coupon not stated" : sp.requiresMembership ? " · Needs the store card" : ""}
      </p>
      {x.conflicts.length > 0 ? <p className="mt-1 text-[13px] text-warning">{x.conflicts.join(" · ")}</p> : null}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
        {x.onList ? (
          <span className="inline-flex min-h-10 items-center gap-1.5 text-[14px] font-medium text-muted">
            <Check className="size-4" aria-hidden /> On your list
          </span>
        ) : (
          <Button
            variant="secondary"
            disabled={busy || added}
            onClick={async () => {
              setBusy(true);
              await onAdd();
              setBusy(false);
            }}
            icon={added ? <Check className="size-4" aria-hidden /> : <ListPlus className="size-4" aria-hidden />}
          >
            {added ? "Added" : "Add to list"}
          </Button>
        )}
        {sp.sourceUrl ? (
          <a href={sp.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[14px] font-medium text-accent hover:underline">
            View at store <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Badge({ tone, children }: { tone: "accent" | "warning"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", tone === "accent" ? "bg-accent-soft text-accent" : "bg-warning/12 text-warning")}>
      {children}
    </span>
  );
}
