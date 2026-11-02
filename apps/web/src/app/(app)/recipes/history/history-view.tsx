"use client";

import type { CookingHistoryData } from "@kitchen-pantry/database";
import { cookingHistory, monthLabel, type CookEntry } from "@kitchen-pantry/recipe-engine";
import type { RecipeRating } from "@kitchen-pantry/shared-types";
import { ArrowLeft, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RecipeArt } from "@/components/recipes/recipe-art";
import { Card, Eyebrow, Hint, PageHeader } from "@/components/ui/card";
import { useKitchen } from "@/lib/kitchen/use-kitchen";
import { useRecipes } from "@/lib/recipes/use-recipes";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "size-3.5 fill-current text-warning" : "size-3.5 text-border"} aria-hidden />
      ))}
    </span>
  );
}

function ratingLine(r: RecipeRating): string {
  const bits: string[] = [];
  if (r.wouldCookAgain === true) bits.push("would cook again");
  if (r.wouldCookAgain === false) bits.push("wouldn't cook again");
  if (r.actualMinutes) bits.push(`took ${r.actualMinutes} min`);
  if (r.familyApproval) bits.push(`family ${r.familyApproval}/5`);
  return bits.join(" · ");
}

/** Cooking history (spec 01 Phase 6): what the household cooked, with its ratings and notes. */
export function HistoryView() {
  const data = useRecipes();
  const { today } = useKitchen();
  const [raw, setRaw] = useState<{ history: CookingHistoryData; ratings: RecipeRating[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([data.repo.history(), data.repo.myRatings()]).then(([h, r]) => {
      if (cancelled) return;
      if (!h.ok) return setError(h.message);
      if (!r.ok) return setError(r.message);
      setRaw({ history: h.data, ratings: r.data });
    });
    return () => {
      cancelled = true;
    };
  }, [data.repo]);

  const h = useMemo(() => (raw ? cookingHistory({ cooked: raw.history.cooked, ratings: raw.ratings, recipes: raw.history.recipes, today }) : null), [raw, today]);
  const months = useMemo(() => {
    const groups: Array<{ label: string; entries: CookEntry[] }> = [];
    for (const e of h?.entries ?? []) {
      const label = monthLabel(e.cookedAt);
      const g = groups.at(-1);
      if (g && g.label === label) g.entries.push(e);
      else groups.push({ label, entries: [e] });
    }
    return groups;
  }, [h]);

  return (
    <div className="animate-enter">
      <Link href="/recipes" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Recipes
      </Link>
      <PageHeader title="Cooking history" subtitle="What your household has cooked, and what you thought of it." />
      {error ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}

      {!h ? (
        !error ? <div className="h-32 animate-pulse rounded-card bg-surface" aria-busy="true" aria-label="Loading your history" /> : null
      ) : h.entries.length === 0 ? (
        <Card>
          <p className="text-[17px] font-semibold">Nothing cooked yet</p>
          <Hint className="mt-1">When you finish a recipe in cooking mode or rate it, it shows up here.</Hint>
          <Link href="/recipes" className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
            Find something to cook →
          </Link>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <p className="text-[32px] font-bold leading-none tabular-nums">{h.stats.last30}</p>
              <p className="mt-1 text-[14px] text-muted">meals cooked in the last 30 days</p>
            </Card>
            <Card>
              <p className="text-[32px] font-bold leading-none tabular-nums">{h.stats.different30}</p>
              <p className="mt-1 text-[14px] text-muted">different recipes</p>
            </Card>
            <Card>
              <p className="text-[32px] font-bold leading-none tabular-nums">{h.stats.averageRating ?? "–"}</p>
              <p className="mt-1 text-[14px] text-muted">{h.stats.ratedCount ? `average rating (${h.stats.ratedCount} rated)` : "no ratings yet"}</p>
            </Card>
            <Card>
              <p className="text-[17px] font-bold leading-tight">{h.stats.topCuisines.map((c) => c.label).join(", ") || "–"}</p>
              <p className="mt-1 text-[14px] text-muted">cuisines you cook most</p>
            </Card>
          </div>

          {h.comeBack.length > 0 ? (
            <Card className="mb-4">
              <Eyebrow>Worth making again</Eyebrow>
              <p className="mt-1 text-[15px] text-muted">You loved these but haven&apos;t made them for a while.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {h.comeBack.map((c) => (
                  <li key={c.recipe.id}>
                    <Link href={`/recipes/${c.recipe.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-background px-4 py-2 text-[15px] font-medium hover:bg-surface-strong">
                      {c.recipe.title}
                      <span className="text-[13px] text-muted">{c.daysAgo >= 60 ? `${Math.floor(c.daysAgo / 30)} months ago` : `${Math.floor(c.daysAgo / 7)} weeks ago`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {months.map((m) => (
            <section key={m.label} className="mb-5" aria-label={m.label}>
              <h2 className="mb-2 text-[15px] font-semibold uppercase tracking-widest text-muted">{m.label}</h2>
              <ul className="space-y-2">
                {m.entries.map((e, i) => (
                  <li key={`${e.recipeId}-${e.cookedAt}-${i}`} className="flex gap-3 rounded-2xl bg-surface p-3">
                    {e.recipe ? <RecipeArt recipe={e.recipe} className="size-16 shrink-0 rounded-xl" /> : <div className="size-16 shrink-0 rounded-xl bg-surface-strong" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-muted">{day(e.cookedAt)}</p>
                      {e.recipe ? (
                        <Link href={`/recipes/${e.recipe.slug}`} className="text-[17px] font-semibold leading-snug hover:underline">
                          {e.recipe.title}
                        </Link>
                      ) : (
                        <p className="text-[17px] font-semibold text-muted">A recipe that&apos;s no longer available</p>
                      )}
                      {e.rating ? (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
                          <Stars value={e.rating.overall} />
                          {ratingLine(e.rating) ? <span>{ratingLine(e.rating)}</span> : null}
                        </div>
                      ) : (
                        <p className="mt-1 text-[14px] text-muted">Not rated</p>
                      )}
                      {e.rating?.notes ? <p className="mt-1 text-[15px] leading-snug">&ldquo;{e.rating.notes}&rdquo;</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {data.mode === "preview" ? <Hint>Preview mode keeps this history in this browser only.</Hint> : null}
        </>
      )}
    </div>
  );
}
