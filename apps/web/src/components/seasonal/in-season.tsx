"use client";

import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { seasonalPicks, type RankedRecipe, type SeasonalContext } from "@kitchen-pantry/recipe-engine";
import { ArrowRight, CakeSlice, CalendarDays, Leaf, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { useSeasonalDeals } from "@/lib/seasonal/use-seasonal-deals";

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const produceLabel = (n: string) => n.replace(/\s*&.*$/, "");

/**
 * Home → "In season this week". Works out the season from where the household
 * is and today's date, so it changes by itself. Suggestions only — the full
 * recipe list is always one tap away.
 */
export function InSeasonCard({ seasonal, ranked }: { seasonal: SeasonalContext; ranked: readonly RankedRecipe[] }) {
  const picks = useMemo(() => seasonalPicks(ranked, seasonal), [ranked, seasonal]);
  const { settings } = seasonal;
  const produce = settings.produce ? seasonal.produce.map((p) => p.name) : [];
  const deals = useSeasonalDeals(produce, settings.deals);
  const holidays = picks.holidays;

  return (
    <Card className="mt-4" aria-labelledby="in-season">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Leaf className="size-5 text-accent" aria-hidden />
            <Eyebrow>In season this week</Eyebrow>
          </div>
          <h2 id="in-season" className="mt-1 text-xl font-bold tracking-tight">
            {cap(seasonal.season)} where you are
          </h2>
          <p className="text-[14px] text-muted">Based on {seasonal.region.basis} and today&apos;s date.</p>
        </div>
        <Link href="/profile#seasons" className="text-[15px] font-semibold text-accent hover:underline">
          Seasonal settings
        </Link>
      </div>

      {produce.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="In-season produce">
          {produce.slice(0, 12).map((n) => (
            <li key={n} className="rounded-full bg-background px-3.5 py-1.5 text-[15px] font-medium">
              {produceLabel(n)}
            </li>
          ))}
        </ul>
      ) : null}

      {picks.meals.length > 0 || picks.dessert ? (
        <ul className="mt-4 divide-y divide-border">
          {picks.meals.map((r) => (
            <PickRow key={r.recipe.id} r={r} />
          ))}
          {picks.dessert ? <PickRow r={picks.dessert} dessert /> : null}
        </ul>
      ) : settings.meals || settings.desserts ? (
        <Hint>No seasonal recipes fit your kitchen right now — every recipe is still on the Recipes page.</Hint>
      ) : null}

      {holidays.length > 0 ? (
        <div className="mt-4 space-y-2">
          {holidays.map((h) => (
            <div key={h.code} className="rounded-2xl bg-background px-4 py-3">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <CalendarDays className="size-4 text-accent" aria-hidden />
                {h.label} · <span className="font-normal text-muted">{h.when}</span>
              </p>
              {h.recipes.length > 0 ? (
                <p className="mt-1 text-[15px]">
                  {h.recipes.map((r, i) => (
                    <span key={r.recipe.id}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/recipes/${r.recipe.slug}`} className="underline underline-offset-4">
                        {r.recipe.title}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : (
                <p className="mt-1 text-[14px] text-muted">No recipes for it in your collection yet.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {settings.deals && produce.length > 0 ? <DealsBlock deals={deals} /> : null}

      <Link href="/recipes" className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline">
        All recipes <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

function PickRow({ r, dessert = false }: { r: RankedRecipe; dessert?: boolean }) {
  const why = r.inSeason && r.inSeason.length > 0 ? `Uses ${r.inSeason.slice(0, 2).map((n) => produceLabel(n).toLowerCase()).join(" and ")}` : (r.reasons.find((x) => /favourite|For /.test(x)) ?? null);
  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span className="w-16 shrink-0 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
        {dessert ? (
          <span className="inline-flex items-center gap-1">
            <CakeSlice className="size-3.5" aria-hidden /> Treat
          </span>
        ) : (
          "Dinner"
        )}
      </span>
      <span className="min-w-0 flex-1">
        <Link href={`/recipes/${r.recipe.slug}`} className="block truncate text-[16px] font-medium hover:underline">
          {r.recipe.title}
        </Link>
        {why ? <span className="block text-[14px] text-muted">{why}</span> : null}
      </span>
    </li>
  );
}

function DealsBlock({ deals }: { deals: ReturnType<typeof useSeasonalDeals> }) {
  const { enabled, store, busy, error, check } = deals;
  return (
    <div className="mt-4 rounded-2xl border border-border px-4 py-3">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Tag className="size-4 text-accent" aria-hidden /> Seasonal deals
      </p>
      {enabled === null ? (
        <p className="mt-1 text-[14px] text-muted">Checking your store…</p>
      ) : !enabled ? (
        <p className="mt-1 text-[14px] text-muted">Store prices aren&apos;t connected yet, so we can&apos;t show sale prices.</p>
      ) : !store ? (
        <p className="mt-1 text-[14px] text-muted">
          <Link href="/grocery" className="font-medium text-foreground underline underline-offset-4">
            Choose your store
          </Link>{" "}
          on the Grocery list to see what&apos;s on sale.
        </p>
      ) : deals.deals === null ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => void check()}>
            {busy ? "Checking prices…" : `Check sale prices at ${store.name}`}
          </Button>
          <span className="text-[14px] text-muted">Real store prices — in season doesn&apos;t always mean cheaper.</span>
        </div>
      ) : deals.deals.length === 0 ? (
        <p className="mt-1 text-[14px] text-muted">
          None of this week&apos;s in-season produce is on sale at {store.name} right now.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {deals.deals.map(({ produce, line }) => (
            <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px]">
              <span className="min-w-0">
                <span className="font-medium">{produceLabel(produce)}</span>
                {line.product ? <span className="text-muted"> · {line.product.name}{line.product.size ? `, ${line.product.size}` : ""}</span> : null}
              </span>
              <span className="tabular-nums">
                <span className="font-semibold text-accent">
                  {formatCents(line.saleCents!)}
                  {line.packages === null ? "/lb" : ""}
                </span>{" "}
                <span className="text-[13px] text-muted line-through">{formatCents(line.regularCents!)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-[14px] text-danger">{error}</p> : null}
      {deals.deals !== null && store ? <p className="mt-2 text-[13px] text-muted">Sale prices reported by {store.name}. Prices can change at the store.</p> : null}
    </div>
  );
}
