"use client";

import { formatMinutes, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { Clock, EyeOff, Heart, Sparkles, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { RecipeArt } from "./recipe-art";

/** How we're allowed to describe a recipe's popularity — never invented. */
export function RatingLabel({ ranked, className }: { ranked: RankedRecipe; className?: string }) {
  const { rating, label } = ranked;
  if (rating && rating.count > 0) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <Star className="size-3.5 fill-current text-warning" aria-hidden />
        <span className="font-semibold text-foreground">{rating.average.toFixed(1)}</span>
        <span>
          ({rating.count} {rating.count === 1 ? "rating" : "ratings"})
        </span>
      </span>
    );
  }
  const text = label === "ai_suggestion" ? "AI suggestion" : label === "your_recipe" ? "Your recipe" : "Editorial";
  return (
    <span className={className} title="No household ratings yet">
      {text}
    </span>
  );
}

export function SkillDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Skill level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden className={cn("size-1.5 rounded-full", n <= level ? "bg-foreground" : "bg-border")} />
      ))}
    </span>
  );
}

export function RecipeCard({
  ranked,
  onToggleFavorite,
  onDismiss,
  compact = false,
}: {
  ranked: RankedRecipe;
  onToggleFavorite?: () => void;
  /** "Not for us": hides the recipe from suggestions (undoable). */
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const { recipe, coverage, reasons, cautions, favorite } = ranked;
  const have = coverage.owned.length;
  const total = coverage.requiredCount;

  return (
    <article className="group relative flex overflow-hidden rounded-card bg-surface transition-shadow hover:shadow-[0_6px_24px_rgb(0_0_0/0.06)] sm:flex-col">
      <RecipeArt recipe={recipe} className={cn("shrink-0", compact ? "w-28 sm:h-36 sm:w-full" : "w-32 sm:h-44 sm:w-full")} />
      <div className={cn("flex min-w-0 flex-1 flex-col p-4 sm:p-5", onDismiss && "pr-12 sm:pr-5")}>
        <h3 className="text-[17px] font-semibold leading-snug sm:text-lg">
          <Link href={`/recipes/${recipe.slug}`} className="after:absolute after:inset-0 hover:underline">
            {recipe.title}
          </Link>
        </h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {formatMinutes(recipe.totalMinutes)}
          </span>
          <span aria-hidden>·</span>
          <SkillDots level={recipe.skillLevel} />
          <RatingLabel ranked={ranked} />
        </p>

        {total > 0 && have > 0 ? (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((have / total) * 100)}%` }} />
            </div>
            <p className="mt-1 text-[13px] text-muted">
              You have {have} of {total} ingredients
            </p>
          </div>
        ) : null}

        {!compact && reasons[0] ? (
          <p className="mt-3 flex gap-1.5 text-[14px] leading-snug">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>{reasons[0]}</span>
          </p>
        ) : null}
        {!compact && cautions[0] ? (
          <p className="mt-1.5 flex gap-1.5 text-[13px] leading-snug text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{cautions[0]}</span>
          </p>
        ) : null}
      </div>
      {onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${recipe.title} from favourites` : `Save ${recipe.title} to favourites`}
          className="absolute top-2.5 left-2.5 z-10 grid size-10 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-transform active:scale-90 sm:right-2.5 sm:left-auto"
        >
          <Heart className={cn("size-5", favorite ? "fill-danger text-danger" : "text-muted")} aria-hidden />
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Not for us: hide ${recipe.title} from suggestions`}
          title="Not for us"
          className="absolute top-2.5 right-2.5 z-10 grid size-10 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-transform active:scale-90 sm:right-14"
        >
          <EyeOff className="size-[18px] text-muted" aria-hidden />
        </button>
      ) : null}
    </article>
  );
}
