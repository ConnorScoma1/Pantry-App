"use client";

import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { formatMinutes } from "@kitchen-pantry/recipe-engine";
import { surpriseKinds } from "@kitchen-pantry/shared-types";
import { Dices, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";
import { Chip, ChipGroup } from "@/components/ui/controls";
import type { useRecipes } from "@/lib/recipes/use-recipes";
import { useSurprise } from "@/lib/recipes/use-surprise";
import { RecipeArt } from "./recipe-art";

/** Surprise Me (spec 02 §5): pick a kind of idea, get three with a plain "why". */
export function SurpriseMe({ data, compact = false }: { data: ReturnType<typeof useRecipes>; compact?: boolean }) {
  const s = useSurprise(data);
  return (
    <Card aria-labelledby="surprise-title">
      <div className="flex items-center gap-2">
        <Dices className="size-5 text-accent" aria-hidden />
        <Eyebrow>Surprise me</Eyebrow>
      </div>
      <h2 id="surprise-title" className="mt-1 text-xl font-bold tracking-tight">
        Fresh ideas, explained
      </h2>
      {!compact ? <p className="mt-1 text-[15px] text-muted">Nothing you&apos;ve cooked or been shown in the last two weeks, unless it&apos;s a favourite.</p> : null}
      <div className="mt-3">
        <ChipGroup label="What kind of idea?">
          {surpriseKinds.map((k) => (
            <Chip key={k.code} selected={s.kind === k.code} disabled={s.busy || data.loading} onToggle={() => void s.run(k.code)}>
              {k.short}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      {s.busy ? <div className="mt-4 h-24 animate-pulse rounded-2xl bg-background" aria-busy="true" aria-label="Finding ideas" /> : null}
      {s.error ? <p className="mt-3 text-[14px] text-danger">{s.error}</p> : null}
      {s.result && !s.busy ? (
        <div className="mt-4">
          {s.result.picks.length > 0 ? (
            <ul className="space-y-3">
              {s.result.picks.map((p) => (
                <li key={p.ranked.recipe.id} className="flex gap-3 rounded-2xl bg-background p-3">
                  <RecipeArt recipe={p.ranked.recipe} className="size-20 shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <Link href={`/recipes/${p.ranked.recipe.slug}`} className="text-[17px] font-semibold leading-snug hover:underline">
                      {p.ranked.recipe.title}
                    </Link>
                    <p className="text-[13px] text-muted">
                      {formatMinutes(p.ranked.recipe.totalMinutes)} · skill {p.ranked.recipe.skillLevel}
                      {p.costPerServingCents !== null ? ` · about ${formatCents(p.costPerServingCents)}/serving` : ""}
                    </p>
                    <p className="mt-1 text-[14px] leading-snug">{p.why}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {s.result.note ? <Hint className="mt-2">{s.result.note}</Hint> : null}
          {s.result.needs === "store" ? (
            <Link href="/grocery" className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
              Choose your store →
            </Link>
          ) : null}
          {s.kind && (s.result.picks.length > 0 || (s.kind === "under_5" && !s.result.needs)) ? (
            <Button variant="secondary" className="mt-3" disabled={s.busy} onClick={() => void s.run(s.kind!, true)} icon={<RefreshCw className="size-4" aria-hidden />}>
              {s.result.picks.length > 0 ? "Show me others" : "Check more recipes"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
