"use client";

import type { PlanDraft } from "@kitchen-pantry/meal-planner";
import { formatMinutes, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { Clock, Ellipsis, Lock, LockOpen, Minus, Plus, RefreshCw, Sparkles, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RecipeArt } from "@/components/recipes/recipe-art";
import { SkillDots } from "@/components/recipes/recipe-card";
import { cn } from "@/lib/cn";

type Meal = PlanDraft["meals"][number];

export function dayLabel(date: string, style: "short" | "long" = "short"): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" }),
    day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        "grid size-10 place-items-center rounded-full border border-border bg-background transition-[background-color,transform] hover:bg-surface active:scale-95 disabled:opacity-40",
        pressed && "border-foreground bg-foreground text-background hover:bg-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** One night of the week: the planned dinner and its quick actions. */
export function MealCard({
  date,
  meal,
  ranked,
  busy,
  onSwap,
  onToggleLock,
  onServings,
  onMore,
}: {
  date: string;
  meal: Meal;
  ranked: RankedRecipe | undefined;
  busy: boolean;
  onSwap: () => void;
  onToggleLock: () => void;
  onServings: (n: number) => void;
  onMore: () => void;
}) {
  const { weekday, day } = dayLabel(date, "long");
  const recipe = ranked?.recipe;
  const title = recipe?.title ?? meal.customTitle ?? "Recipe unavailable";
  const toBuy = ranked?.coverage.missing.length ?? 0;
  const have = ranked?.coverage.owned.length ?? 0;

  return (
    <article className={cn("rounded-card bg-surface p-3 sm:p-4", meal.locked && "ring-2 ring-foreground/80")} aria-label={`${weekday}: ${title}`}>
      <div className="flex gap-3 sm:gap-4">
        {recipe ? (
          <RecipeArt recipe={recipe} className="size-24 shrink-0 rounded-2xl sm:size-28" />
        ) : (
          <div aria-hidden className="grid size-24 shrink-0 place-items-center rounded-2xl bg-surface-strong text-muted sm:size-28">
            <UtensilsCrossed className="size-8" strokeWidth={1.5} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            {weekday} <span className="font-medium normal-case tracking-normal">· {day}</span>
            {meal.locked ? <span className="ml-2 normal-case tracking-normal text-foreground">· Locked</span> : null}
          </p>
          <h3 className="mt-0.5 text-[17px] font-semibold leading-snug sm:text-lg">
            {recipe ? (
              <Link href={`/recipes/${recipe.slug}`} className="hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          {recipe ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {formatMinutes(recipe.totalMinutes)}
              </span>
              <SkillDots level={recipe.skillLevel} />
              <span>
                {have > 0 ? `Have ${have} · ` : ""}
                {toBuy === 0 ? "Nothing to buy" : `${toBuy} to buy`}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[14px] text-muted">Your own meal</p>
          )}
          {meal.note ? (
            <p className="mt-1.5 flex gap-1.5 text-[14px] leading-snug">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              <span>{meal.note}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1.5" role="group" aria-label={`Servings for ${weekday}`}>
          <IconButton label={`Fewer servings on ${weekday}`} onClick={() => onServings(meal.servings - 1)} disabled={busy || meal.servings <= 1}>
            <Minus className="size-4" aria-hidden />
          </IconButton>
          <span className="min-w-[4.5rem] text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
            {meal.servings} {meal.servings === 1 ? "serving" : "servings"}
          </span>
          <IconButton label={`More servings on ${weekday}`} onClick={() => onServings(meal.servings + 1)} disabled={busy || meal.servings >= 24}>
            <Plus className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton label={meal.locked ? `Unlock ${weekday}` : `Lock ${weekday} so rebuilding keeps it`} onClick={onToggleLock} pressed={meal.locked} disabled={busy}>
            {meal.locked ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
          </IconButton>
          {recipe ? (
            <IconButton label={`Swap ${weekday}'s dinner`} onClick={onSwap} disabled={busy || meal.locked}>
              <RefreshCw className="size-4" aria-hidden />
            </IconButton>
          ) : null}
          <IconButton label={`More options for ${weekday}`} onClick={onMore} disabled={busy}>
            <Ellipsis className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

/** A night with nothing planned. */
export function EmptyNight({
  date,
  busy,
  onSuggest,
  onAddOwn,
}: {
  date: string;
  busy: boolean;
  onSuggest: () => void;
  onAddOwn: () => void;
}) {
  const { weekday, day } = dayLabel(date, "long");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-border px-4 py-3">
      <p className="text-[15px]">
        <span className="font-semibold">{weekday}</span> <span className="text-muted">· {day} · No dinner planned</span>
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onSuggest} disabled={busy} className="min-h-10 rounded-full border border-border bg-background px-4 text-[14px] font-semibold hover:bg-surface disabled:opacity-40">
          Suggest a dinner
        </button>
        <button type="button" onClick={onAddOwn} disabled={busy} className="min-h-10 rounded-full px-3 text-[14px] font-semibold text-muted hover:text-foreground disabled:opacity-40">
          Add my own
        </button>
      </div>
    </div>
  );
}
