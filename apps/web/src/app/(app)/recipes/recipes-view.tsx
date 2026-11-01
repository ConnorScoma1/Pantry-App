"use client";

import { cuisines, skillLevels } from "@kitchen-pantry/shared-types";
import { ChevronDown, EyeOff, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProfile } from "@/components/profile/profile-provider";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Card, PageHeader } from "@/components/ui/card";
import { Chip, Segmented, Switch } from "@/components/ui/controls";
import { useRecipes } from "@/lib/recipes/use-recipes";

export function RecipesView() {
  const { profile } = useProfile();
  const data = useRecipes();
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState(false);
  const [haveMost, setHaveMost] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cuisine, setCuisine] = useState<string>("");
  const [stretch, setStretch] = useState(false);
  const [course, setCourse] = useState<"main" | "dessert">("main");
  const [showHidden, setShowHidden] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [lastDismissed, setLastDismissed] = useState<{ id: string; title: string } | null>(null);

  const { recipes, hidden, dismissed } = useMemo(
    () =>
      data.rank({
        query,
        maxMinutes: quick ? 30 : null,
        maxMissing: haveMost ? 3 : null,
        favoritesOnly,
        cuisine: cuisine || null,
        includeAboveSkill: stretch,
        course,
      }),
    [data, query, quick, haveMost, favoritesOnly, cuisine, stretch, course],
  );
  const availableCuisines = useMemo(
    () => cuisines.filter((c) => data.recipes.some((r) => r.cuisine === c.code)),
    [data.recipes],
  );
  const mySkill = course === "dessert" ? (profile.desserts.skillLevel ?? profile.skillLevel) : profile.skillLevel;
  const levelLabel = skillLevels.find((s) => s.level === mySkill)?.label;

  return (
    <div className="animate-enter">
      <PageHeader
        title="Recipes"
        subtitle="Picked for your household — your skills, your kitchen and what needs using up first."
      />

      <div className="mb-4 flex flex-col gap-3">
        <label className="flex h-12 items-center gap-3 rounded-full bg-surface px-5">
          <Search className="size-5 text-subtle" aria-hidden />
          <span className="sr-only">Search recipes</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes or ingredients"
            className="h-full flex-1 bg-transparent text-[17px] outline-none placeholder:text-subtle"
          />
        </label>
        <div className="max-w-xs">
          <Segmented
            label="Show"
            value={course}
            onChange={setCourse}
            options={[
              { value: "main", label: "Dinners" },
              { value: "dessert", label: "Desserts" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={quick} onToggle={() => setQuick((v) => !v)}>
            30 minutes or less
          </Chip>
          <Chip selected={haveMost} onToggle={() => setHaveMost((v) => !v)}>
            Uses what I have
          </Chip>
          <Chip selected={favoritesOnly} onToggle={() => setFavoritesOnly((v) => !v)}>
            Favourites
          </Chip>
          <label className="relative">
            <span className="sr-only">Cuisine</span>
            <select
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              className="min-h-11 appearance-none rounded-full border border-border bg-background pr-9 pl-4 text-[16px] font-medium outline-none focus:border-foreground"
            >
              <option value="">Any cuisine</option>
              {availableCuisines.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          </label>
        </div>
        {mySkill < 5 ? (
          <div className="max-w-md">
            <Switch
              label="Include harder recipes"
              description={`You're set to ${levelLabel}. Turn on to see stretch recipes too.`}
              checked={stretch}
              onChange={setStretch}
            />
          </div>
        ) : null}
      </div>

      {data.error ? (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {data.error}
        </p>
      ) : null}

      {data.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading recipes">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-xl font-bold">No recipes match those filters</p>
          <p className="mt-1 text-[15px] text-muted">Try clearing a filter{profile.skillLevel < 5 ? " or including harder recipes" : ""}.</p>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-muted" aria-live="polite">
            {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"} · best match first
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((r) => (
              <RecipeCard
                key={r.recipe.id}
                ranked={r}
                onToggleFavorite={() => void data.toggleFavorite(r.recipe.id)}
                onDismiss={() => {
                  setLastDismissed({ id: r.recipe.id, title: r.recipe.title });
                  void data.dismiss(r.recipe.id, "recipes");
                }}
              />
            ))}
          </div>
        </>
      )}

      {lastDismissed && data.dismissed.has(lastDismissed.id) ? (
        <UndoToast
          message={`Hidden ${lastDismissed.title}`}
          onUndo={() => {
            void data.undismiss(lastDismissed.id, "recipes");
            setLastDismissed(null);
          }}
          onTimeout={() => setLastDismissed(null)}
        />
      ) : null}

      {!data.loading && dismissed.length > 0 ? (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            aria-expanded={showDismissed}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2.5">
              <EyeOff className="size-5 text-muted" aria-hidden />
              <span className="text-[16px] font-semibold">
                {dismissed.length} {dismissed.length === 1 ? "recipe" : "recipes"} you said &ldquo;Not for us&rdquo; to
              </span>
            </span>
            <ChevronDown className={`size-5 text-muted transition-transform ${showDismissed ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showDismissed ? (
            <ul className="mt-3 space-y-2 text-[15px]">
              {dismissed.map((d) => (
                <li key={d.recipe.id} className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3">
                  <span className="font-medium">{d.recipe.title}</span>
                  <button
                    type="button"
                    onClick={() => void data.undismiss(d.recipe.id, "recipes")}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[14px] font-semibold hover:bg-surface"
                  >
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {!data.loading && hidden.length > 0 ? (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2.5">
              <ShieldAlert className="size-5 text-muted" aria-hidden />
              <span className="text-[16px] font-semibold">
                {hidden.length} {hidden.length === 1 ? "recipe" : "recipes"} hidden for your allergies, diet or kitchen
              </span>
            </span>
            <ChevronDown className={`size-5 text-muted transition-transform ${showHidden ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showHidden ? (
            <ul className="mt-3 space-y-2 text-[15px]">
              {hidden.map((h) => (
                <li key={h.recipe.id} className="rounded-2xl bg-background px-4 py-3">
                  <span className="font-medium">{h.recipe.title}</span>
                  <span className="block text-muted">{h.eligibility.reasons.join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <p className="mt-8 text-center text-[13px] text-muted">
        Recipes are original Kitchen Pantry Test Kitchen recipes{availableCuisines.length ? ` across ${availableCuisines.length} cuisines` : ""}. Ratings
        appear once households rate them — we never invent ratings.
      </p>
    </div>
  );
}

/**
 * Bottom toast with Undo. Rendered into <body> so the page's entry
 * animation (a transform) can't trap its fixed position.
 */
function UndoToast({ message, onUndo, onTimeout }: { message: string; onUndo: () => void; onTimeout: () => void }) {
  // Keep the latest callback without restarting the 8-second timer on every render.
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;
  useEffect(() => {
    const t = window.setTimeout(() => timeout.current(), 8000);
    return () => window.clearTimeout(t);
  }, [message]);
  return createPortal(
    <div
      role="status"
      className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 text-[15px] text-background shadow-lg lg:bottom-8"
    >
      <span className="min-w-0 truncate">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 rounded-full px-3 py-1.5 font-semibold underline-offset-2 hover:underline"
      >
        Undo
      </button>
    </div>,
    document.body,
  );
}
