"use client";

import {
  formatIngredientLine,
  formatMinutes,
  formatTemperature,
  groupByComponent,
  isChefRecipe,
  isCookable,
  kitchenUpdatesAfterCooking,
  rankRecipe,
  substitutionsFor,
  type KitchenUpdate,
} from "@kitchen-pantry/recipe-engine";
import { allergens, equipment, labelFor, skillLevels, worldCuisines, type Recipe } from "@kitchen-pantry/shared-types";
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  CookingPot,
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
import { CookingMode } from "@/components/recipes/cooking-mode";
import { AfterCookingSheet } from "@/components/recipes/after-cooking-sheet";
import { useKitchen } from "@/lib/kitchen/use-kitchen";
import { AuthenticityBadge, SafetyNote, SourceLine, StatusBadge, StorageNote } from "@/components/recipes/library-badges";
import { IdeaPanel, VersionsPanel } from "@/components/recipes/versions-panel";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useRecipes } from "@/lib/recipes/use-recipes";

export function RecipeDetailView({ slug }: { slug: string }) {
  const data = useRecipes();
  const known = data.recipes.find((r) => r.slug === slug) ?? null;
  // Recipes outside this week's working set (search results, ideas, drafts) are fetched by slug.
  const [fetched, setFetched] = useState<{ slug: string; recipe: Recipe | null } | null>(null);
  const { findBySlug } = data;
  useEffect(() => {
    if (data.loading || known || fetched?.slug === slug) return;
    let cancelled = false;
    void findBySlug(slug).then((r) => {
      if (!cancelled) setFetched({ slug, recipe: r });
    });
    return () => {
      cancelled = true;
    };
  }, [data.loading, known, fetched, slug, findBySlug]);
  const recipe = known ?? (fetched?.slug === slug ? fetched.recipe : null);
  const looking = !known && fetched?.slug !== slug;
  const ranked = useMemo(() => (recipe ? rankRecipe(recipe, data.context) : null), [recipe, data.context]);
  const [servings, setServings] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState<number | null>(null);
  const [rating, setRating] = useState(false);
  const [cooking, setCooking] = useState(false);
  const kitchen = useKitchen();
  const [afterCooking, setAfterCooking] = useState<KitchenUpdate[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Record that the recipe was opened (once per visit) for repeat-avoidance later.
  const logged = useRef<string | null>(null);
  const { logEvent } = data;
  useEffect(() => {
    if (!recipe || logged.current === recipe.id) return;
    logged.current = recipe.id;
    void logEvent(recipe.id, "opened", "detail");
  }, [recipe, logEvent]);

  if (data.loading || (looking && !recipe)) {
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
  // Curated swaps for what you'd have to buy (never invented; the household's allergies and "never" foods are screened out).
  const subCtx = {
    allergies: [...new Set([...data.context.profile.diet.allergies, ...(data.context.profile.householdDiet?.allergies ?? [])])],
    avoid: [...data.context.profile.diet.neverRecommend, ...(data.context.profile.householdDiet?.neverRecommend ?? [])],
  };
  const mine = data.myRatings.get(recipe.id);
  const { conflicts, warnings } = ranked.eligibility.allergens;
  const cookable = isCookable(recipe);

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
            {recipe.cuisine ? labelFor(worldCuisines, recipe.cuisine) : "Recipe"}
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">{recipe.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge recipe={recipe} />
            <AuthenticityBadge recipe={recipe} />
          </p>
          {recipe.description ? <p className="mt-2 text-[17px] text-muted">{recipe.description}</p> : null}

          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            <div className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">Time</dt>
              <dd>
                {formatMinutes(recipe.totalMinutes)}{" "}
                <span className="text-muted">
                  ({recipe.prepMinutes} prep{recipe.cookMinutes > 0 ? ` · ${formatMinutes(recipe.cookMinutes)} cook` : ""}
                  {recipe.chillMinutes > 0 ? ` · ${formatMinutes(recipe.chillMinutes)} ${recipe.dessertCategory === "frozen" ? "freezing" : "chilling"}` : ""})
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
            {cookable ? (
            <Button size="lg" onClick={() => setCooking(true)} icon={isChefRecipe(recipe) ? <ChefHat className="size-5" aria-hidden /> : <CookingPot className="size-5" aria-hidden />}>
              {isChefRecipe(recipe) ? "Cook in Chef mode" : "Start cooking"}
            </Button>
            ) : null}
            <Button
              variant={ranked.favorite ? "secondary" : "primary"}
              onClick={() => void data.toggleFavorite(recipe.id)}
              aria-pressed={ranked.favorite}
              icon={<Heart className={cn("size-5", ranked.favorite && "fill-danger text-danger")} aria-hidden />}
            >
              {ranked.favorite ? "Saved" : "Save"}
            </Button>
            {cookable ? (
              <Button variant="secondary" onClick={() => setRating(true)} icon={<Star className="size-5" aria-hidden />}>
                {mine ? "Rate again" : "I cooked this"}
              </Button>
            ) : null}
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

      <SafetyNote recipe={recipe} />

      {!cookable ? <IdeaPanel recipe={recipe} data={data} /> : null}

      {cookable ? (
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
                  {group.items.map((i) => {
                    const subs = owned.has(i.position) ? [] : substitutionsFor(i.item, subCtx);
                    const open = swapOpen === i.position;
                    return (
                    <li key={i.position} className="border-b border-border px-4 py-3 last:border-0">
                      <div className="flex items-start gap-3">
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
                      {subs.length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`Swaps for ${i.item}`}
                          onClick={() => setSwapOpen(open ? null : i.position)}
                          className="-my-2.5 inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-accent hover:bg-background"
                        >
                          Swap?
                        </button>
                      ) : null}
                      </div>
                      {open ? (
                        <div className="mt-2 ml-8 text-[15px] text-muted">
                          <p>Don&apos;t have it? Instead you can use:</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {subs.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[14px] text-muted">
            {recipe.requiredEquipment.length ? `Equipment: ${recipe.requiredEquipment.map((e) => labelFor(equipment, e)).join(", ")}` : "No special equipment needed."}
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
          <StorageNote recipe={recipe} />
        </section>
      </div>
      ) : null}

      {cookable ? <VersionsPanel recipe={recipe} data={data} /> : null}

      <SourceLine recipe={recipe} />

      {cooking ? (
        <CookingMode
          recipe={recipe}
          initialServings={serves}
          onClose={() => setCooking(false)}
          onDone={() => {
            void logEvent(recipe.id, "cooked", "detail");
            setCooking(false);
            // Offer to take what was used out of My Kitchen first (only with the household's OK), then rate.
            const updates = kitchenUpdatesAfterCooking(recipe, factor, kitchen.items, kitchen.today);
            if (updates.length) setAfterCooking(updates);
            else setRating(true);
          }}
        />
      ) : null}

      <AfterCookingSheet
        open={afterCooking !== null}
        updates={afterCooking ?? []}
        kitchen={kitchen}
        onClose={(message) => {
          setAfterCooking(null);
          if (message) setNotice(message);
          setRating(true);
        }}
      />

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
