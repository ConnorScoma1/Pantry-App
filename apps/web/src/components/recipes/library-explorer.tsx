"use client";

import { cuisineRegions, dietStyles, recipeCategories, recipeCourses, worldCuisines } from "@kitchen-pantry/shared-types";
import { ChevronDown, Search, Sparkles, UtensilsCrossed, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/controls";
import { EMPTY_FILTERS, type LibraryFilters, type useLibrary } from "@/lib/library/use-library";
import type { useRecipes } from "@/lib/recipes/use-recipes";

const EXAMPLES = ["Authentic Thai dinner for four under $50", "Restaurant-quality beef Wellington", "Five cheap dinners using chicken thighs", "Build a seafood tower for six people", "Something completely different from last week"];

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 max-w-[17rem] appearance-none rounded-full border border-border bg-background pr-9 pl-4 text-[16px] font-medium outline-none focus:border-foreground"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </label>
  );
}

/** "Explore the library": natural-language search and filters over every recipe (spec 08 §9). */
export function LibraryExplorer({ data, library }: { data: ReturnType<typeof useRecipes>; library: ReturnType<typeof useLibrary> }) {
  const { filters, setFilters, parsed, facets } = library;
  const set = (patch: Partial<LibraryFilters>) => setFilters({ ...filters, ...patch });
  const counts = facets?.cuisines ?? {};
  const menuHref = parsed?.wantsMenu
    ? `/menus?${new URLSearchParams({
        ...(parsed.menuTemplate ? { template: parsed.menuTemplate } : {}),
        ...(parsed.servings ? { guests: String(parsed.servings) } : {}),
        ...(parsed.budgetCents ? { budget: String(parsed.budgetCents) } : {}),
      }).toString()}`
    : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) || library.text.trim() !== "";

  return (
    <div>
      <label className="flex h-12 items-center gap-3 rounded-full bg-surface px-5">
        <Search className="size-5 shrink-0 text-subtle" aria-hidden />
        <span className="sr-only">Search the recipe library</span>
        <input
          value={library.text}
          onChange={(e) => library.setText(e.target.value)}
          placeholder="Try “authentic Thai dinner for four under $50”"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-subtle"
        />
        {library.text ? (
          <button type="button" onClick={() => library.setText("")} aria-label="Clear search" className="grid size-8 place-items-center rounded-full hover:bg-surface-strong">
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </label>

      {!library.text ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Example searches">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => library.setText(e)} className="rounded-full bg-surface px-3 py-1.5 text-[14px] text-muted hover:bg-surface-strong hover:text-foreground">
              {e}
            </button>
          ))}
        </div>
      ) : parsed && parsed.understood.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[14px] text-muted" aria-live="polite">
          <Sparkles className="size-4 text-accent" aria-hidden /> Looking for
          {parsed.understood.map((u) => (
            <span key={u} className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-foreground">
              {u}
            </span>
          ))}
          {parsed.query.text ? <span className="rounded-full border border-border px-2.5 py-0.5">“{parsed.query.text}”</span> : null}
        </p>
      ) : null}

      {menuHref ? (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-[16px]">
            <UtensilsCrossed className="size-5 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-semibold">Want the whole meal?</span> We can put together the courses
              {parsed?.servings ? ` for ${parsed.servings}` : ""}
              {parsed?.budgetCents ? ` and check it against your budget with your store's real prices` : ""}.
            </span>
          </p>
          <Link href={menuHref} className="rounded-full bg-foreground px-4 py-2 text-[15px] font-semibold text-background">
            Build the menu
          </Link>
        </Card>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select label="Cuisine" value={filters.cuisine} onChange={(v) => set({ cuisine: v })}>
          <option value="">Any cuisine</option>
          {cuisineRegions.map((region) => {
            const list = worldCuisines.filter((c) => c.region === region.code && (counts[c.code] ?? 0) > 0);
            return list.length ? (
              <optgroup key={region.code} label={region.label}>
                {list.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({counts[c.code]})
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </Select>
        <Select label="Course" value={filters.course} onChange={(v) => set({ course: v })}>
          <option value="">Any course</option>
          {recipeCourses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select label="Category" value={filters.category} onChange={(v) => set({ category: v })}>
          <option value="">Any category</option>
          {recipeCategories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select label="Difficulty" value={filters.difficulty} onChange={(v) => set({ difficulty: v as LibraryFilters["difficulty"] })}>
          <option value="any">Any difficulty</option>
          <option value="easy">Beginner & easy</option>
          <option value="home">Home cook & intermediate</option>
          <option value="advanced">Advanced & professional</option>
        </Select>
        <Select label="Diet" value={filters.diet} onChange={(v) => set({ diet: v })}>
          <option value="">Any diet</option>
          {dietStyles
            .filter((d) => d.code !== "omnivore")
            .map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          <option value="gluten_free">Gluten-free</option>
          <option value="dairy_free">Dairy-free</option>
        </Select>
        <Chip selected={filters.maxMinutes === 30} onToggle={() => set({ maxMinutes: filters.maxMinutes === 30 ? null : 30 })}>
          30 minutes or less
        </Chip>
        <Chip selected={filters.includeIdeas} onToggle={() => set({ includeIdeas: !filters.includeIdeas })}>
          Include dish ideas
        </Chip>
        {filtered ? (
          <button type="button" onClick={library.clear} className="min-h-11 px-2 text-[15px] font-semibold text-accent hover:underline">
            Clear
          </button>
        ) : null}
      </div>

      {library.error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {library.error}
        </p>
      ) : null}

      <p className="mt-5 mb-3 text-[14px] text-muted" aria-live="polite">
        {library.loading && library.results.length === 0
          ? "Searching…"
          : `${library.total} ${library.total === 1 ? "match" : "matches"}${library.hiddenCount > 0 ? ` · ${library.hiddenCount} hidden for your diet or kitchen` : ""} · allergens your household avoids are never shown`}
      </p>

      {library.results.length === 0 && !library.loading ? (
        <Card className="py-10 text-center">
          <p className="text-xl font-bold">Nothing matches that yet</p>
          <p className="mt-1 text-[15px] text-muted">Try fewer filters{filters.includeIdeas ? "" : ", or include dish ideas"}.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {library.results.map((r) => (
            <RecipeCard key={r.ranked.recipe.id} ranked={r.ranked} otherVersions={r.otherVersions.length} onToggleFavorite={() => void data.toggleFavorite(r.ranked.recipe.id)} />
          ))}
        </div>
      )}

      {library.canLoadMore ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={library.loading}
            onClick={() => void library.loadMore()}
            className="min-h-11 rounded-full border border-border px-5 text-[16px] font-semibold hover:bg-surface disabled:opacity-50"
          >
            {library.loading ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}

      {facets ? (
        <p className="mt-8 text-center text-[13px] text-muted">
          The library has {facets.complete} complete recipes and {facets.ideas} dish ideas across {Object.keys(facets.cuisines).length} cuisines. Dish ideas don&apos;t have full instructions yet.
        </p>
      ) : null}
    </div>
  );
}
