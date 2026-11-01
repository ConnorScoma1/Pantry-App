"use client";

import {
  formatIngredientLine,
  formatMinutes,
  formatTemperature,
  groupByComponent,
  rankRecipe,
} from "@kitchen-pantry/recipe-engine";
import { allergens, cuisines, equipment, labelFor, skillLevels } from "@kitchen-pantry/shared-types";
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  EyeOff,
  Heart,
  Minus,
  Plus,
  ShieldAlert,
  Star,
  Thermometer,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RatingLabel, SkillDots } from "@/components/recipes/recipe-card";
import { PhotoCredit, RecipeArt } from "@/components/recipes/recipe-art";
import { RateSheet } from "@/components/recipes/rate-sheet";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useRecipes } from "@/lib/recipes/use-recipes";

export function RecipeDetailView({ slug }: { slug: string }) {
  const data = useRecipes();
  const recipe = data.recipes.find((r) => r.slug === slug) ?? null;
  const ranked = useMemo(() => (recipe ? rankRecipe(recipe, data.context) : null), [recipe, data.context]);
  const [servings, setServings] = useState<number | null>(null);
  const [rating, setRating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Record that the recipe was opened (once per visit) for repeat-avoidance later.
  const logged = useRef<string | null>(null);
  const { logEvent } = data;
  useEffect(() => {
    if (!recipe || logged.current === recipe.id) return;
    logged.current = recipe.id;
    void logEvent(recipe.id, "opened", "detail");
  }, [recipe, logEvent]);

  if (data.loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading recipe">
        <div className="h-56 animate-pulse rounded-card bg-surface" />
        <div className="h-8 w-2/3 animate-pulse rounded-full bg-surface" />
      </div>
    );
  }
  if (!recipe || !ranked) {
    return (
      <Card className="py-10 text-center">
        <p className="text-xl font-bold">We couldn&apos;t find that recipe</p>
        <Link href="/recipes" className="mt-3 inline-block font-semibold text-accent hover:underline">
          Back to recipes
        </Link>
      </Card>
    );
  }

  const serves = servings ?? recipe.servings;
  const factor = serves / recipe.servings;
  const owned = new Set(ranked.coverage.owned.map((i) => i.position));
  const mine = data.myRatings.get(recipe.id);
  const { conflicts, warnings } = ranked.eligibility.allergens;

  return (
    <article className="animate-enter pb-8">
      <Link href="/recipes" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Recipes
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <figure>
          <RecipeArt recipe={recipe} size="lg" className="h-56 rounded-card sm:h-80" />
          <figcaption>
            <PhotoCredit recipe={recipe} className="mt-2 px-1" />
          </figcaption>
        </figure>
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-muted">
            {recipe.cuisine ? labelFor(cuisines, recipe.cuisine) : "Recipe"}
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">{recipe.title}</h1>
          <p className="mt-2 text-[17px] text-muted">{recipe.description}</p>

          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            <div className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">Time</dt>
              <dd>
                {formatMinutes(recipe.totalMinutes)}{" "}
                <span className="text-muted">
                  ({recipe.prepMinutes} prep · {formatMinutes(recipe.cookMinutes)} cook)
                </span>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <ChefHat className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">Skill</dt>
              <dd className="flex items-center gap-2">
                <SkillDots level={recipe.skillLevel} /> {skillLevels.find((s) => s.level === recipe.skillLevel)?.label}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">Rating</dt>
              <dd className="text-muted">
                <RatingLabel ranked={ranked} />
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant={ranked.favorite ? "secondary" : "primary"}
              onClick={() => void data.toggleFavorite(recipe.id)}
              aria-pressed={ranked.favorite}
              icon={<Heart className={cn("size-5", ranked.favorite && "fill-danger text-danger")} aria-hidden />}
            >
              {ranked.favorite ? "Saved" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setRating(true)} icon={<Star className="size-5" aria-hidden />}>
              {mine ? "Rate again" : "I cooked this"}
            </Button>
            {ranked.allowed ? (
              <Button
                variant="ghost"
                aria-pressed={ranked.dismissed}
                onClick={() => void (ranked.dismissed ? data.undismiss(recipe.id, "detail") : data.dismiss(recipe.id, "detail"))}
                icon={<EyeOff className="size-5" aria-hidden />}
              >
                {ranked.dismissed ? "Show in suggestions" : "Not for us"}
              </Button>
            ) : null}
          </div>
          {ranked.dismissed ? (
            <p className="mt-2 text-[14px] text-muted">Hidden from your suggestions. You can still open and cook it any time.</p>
          ) : null}
          {mine ? (
            <p className="mt-2 text-[14px] text-muted">
              You rated it {mine.overall}★{mine.wouldCookAgain === false ? " and wouldn't cook it again" : ""}.
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-3 rounded-2xl bg-accent-soft px-4 py-3 text-[15px]">
              {notice}
            </p>
          ) : null}
        </div>
      </div>

      {conflicts.length > 0 ? (
        <div role="alert" className="mt-6 flex gap-3 rounded-card border border-danger/30 bg-danger/5 p-5">
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-danger">
              Contains {[...new Set(conflicts.map((c) => labelFor(allergens, c.allergen)))].join(", ").toLowerCase()} — not recommended for your
              household
            </p>
            <p className="mt-1 text-[15px] text-muted">Found in: {[...new Set(conflicts.map((c) => c.ingredient))].join("; ")}.</p>
          </div>
        </div>
      ) : null}
      {warnings.length > 0 || ranked.cautions.length > 0 ? (
        <div className="mt-4 flex gap-3 rounded-card bg-warning/10 p-5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <ul className="space-y-1 text-[15px]">
            {warnings.map((w) => (
              <li key={`${w.allergen}-${w.ingredient}`}>{w.note}</li>
            ))}
            {ranked.cautions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {ranked.reasons.length > 0 ? (
        <Card className="mt-4">
          <Eyebrow>Why it&apos;s here</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[16px]">
            {ranked.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section aria-labelledby="ingredients">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="ingredients" className="text-2xl font-bold tracking-tight">
              Ingredients
            </h2>
            <div className="flex items-center gap-2" role="group" aria-label="Servings">
              <Users className="size-4 text-muted" aria-hidden />
              <button
                type="button"
                aria-label="Fewer servings"
                disabled={serves <= 1}
                onClick={() => setServings(Math.max(1, serves - 1))}
                className="grid size-9 place-items-center rounded-full border border-border disabled:opacity-35"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <output aria-live="polite" className="min-w-[5.5rem] text-center text-[15px] font-semibold tabular-nums">
                {serves} {serves === 1 ? "serving" : "servings"}
              </output>
              <button
                type="button"
                aria-label="More servings"
                disabled={serves >= 24}
                onClick={() => setServings(Math.min(24, serves + 1))}
                className="grid size-9 place-items-center rounded-full border border-border disabled:opacity-35"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          {ranked.coverage.requiredCount > 0 ? (
            <p className="mb-3 text-[15px] text-muted">
              {ranked.coverage.owned.length > 0
                ? `You have ${ranked.coverage.owned.length} of ${ranked.coverage.requiredCount} · ${ranked.coverage.missing.length} to buy`
                : "Add what you have in My Kitchen to see what you'd need to buy."}
            </p>
          ) : null}
          <div className="space-y-5">
            {groupByComponent(recipe.ingredients).map((group) => (
              <div key={group.component ?? "main"}>
                {group.component ? <h3 className="mb-2 text-[15px] font-semibold">{group.component}</h3> : null}
                <ul className="overflow-hidden rounded-card bg-surface">
                  {group.items.map((i) => (
                    <li key={i.position} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                          owned.has(i.position) ? "bg-accent text-accent-foreground" : "border-2 border-border",
                        )}
                        aria-hidden
                      >
                        {owned.has(i.position) ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="flex-1 text-[16px]">
                        {formatIngredientLine(i, factor)}
                        {i.optional ? <span className="text-muted"> (optional)</span> : null}
                        {owned.has(i.position) ? <span className="sr-only"> — in your kitchen</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[14px] text-muted">
            Equipment: {recipe.requiredEquipment.map((e) => labelFor(equipment, e)).join(", ")}
          </p>
        </section>

        <section aria-labelledby="method">
          <h2 id="method" className="mb-3 text-2xl font-bold tracking-tight">
            Method
          </h2>
          <div className="space-y-6">
            {groupByComponent(recipe.steps).map((group) => (
              <div key={group.component ?? "main"}>
                {group.component ? <h3 className="mb-2 text-[15px] font-semibold text-accent">{group.component}</h3> : null}
                <ol className="space-y-4">
                  {group.items.map((s) => (
                    <li key={s.position} className="flex gap-4">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-strong text-[15px] font-bold tabular-nums">
                        {s.position}
                      </span>
                      <div className="flex-1 pt-0.5">
                        <p className="text-[17px] leading-relaxed">{s.body}</p>
                        {s.timerSeconds || s.temperatureC !== null || s.safeInternalTempC !== null ? (
                          <div className="mt-2 flex flex-wrap gap-2 text-[14px]">
                            {s.timerSeconds ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1">
                                <Timer className="size-3.5" aria-hidden /> {formatMinutes(Math.round(s.timerSeconds / 60))}
                              </span>
                            ) : null}
                            {s.temperatureC !== null ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1">
                                <Thermometer className="size-3.5" aria-hidden /> {formatTemperature(s.temperatureC)}
                              </span>
                            ) : null}
                            {s.safeInternalTempC !== null ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 font-semibold">
                                <ShieldAlert className="size-3.5" aria-hidden /> Safe at {formatTemperature(s.safeInternalTempC)} inside
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          {recipe.tips.length > 0 ? (
            <Card className="mt-8">
              <Eyebrow>Chef&apos;s tips</Eyebrow>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[16px]">
                {recipe.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </section>
      </div>

      <p className="mt-10 border-t border-border pt-4 text-[14px] text-muted">
        {recipe.source.kind === "original" ? "Original recipe by " : "Source: "}
        {recipe.source.url ? (
          <a href={recipe.source.url} className="underline" rel="noopener noreferrer" target="_blank">
            {recipe.source.name}
          </a>
        ) : (
          recipe.source.name
        )}
        . Food-safety temperatures follow USDA guidance. Always check product labels for allergens.
      </p>

      <RateSheet
        open={rating}
        recipe={recipe}
        onClose={() => setRating(false)}
        onSubmit={async (input) => {
          const result = await data.rate(input);
          if (result.ok) setNotice("Thanks — your rating will shape what we suggest next.");
          return result;
        }}
      />
    </article>
  );
}
