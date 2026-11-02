"use client";

import type { DraftHousehold } from "@kitchen-pantry/ai";
import type { LibraryFacetCounts, Result } from "@kitchen-pantry/database";
import {
  applyVariety,
  collapseVersions,
  householdProfile,
  isCookable,
  newCuisines,
  parseRecipeRequest,
  rankRecipe,
  varietyHistory,
  type LibraryQuery,
  type ParsedRequest,
  type RankedRecipe,
} from "@kitchen-pantry/recipe-engine";
import type { Recipe, VarietyMode } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { draftRecipeAction } from "@/app/(app)/recipes/library-actions";
import type { DraftResult } from "@/lib/library/drafts";
import type { useRecipes } from "@/lib/recipes/use-recipes";

/**
 * The recipe library for one household (spec 08 §5, §9): natural-language
 * search plus filters, run against the whole library (in the database, or
 * on-device in preview), then ranked for the household — allergies, diet
 * and equipment are hard filters, and the variety engine keeps the order
 * fresh. Results load a page at a time.
 */
export interface LibraryFilters {
  cuisine: string;
  category: string;
  maxMinutes: number | null;
  /** "easy" ≤ 2, "stretch" ≥ 4, or any. */
  difficulty: "any" | "easy" | "home" | "advanced";
  diet: string;
  course: string;
  includeIdeas: boolean;
}

export const EMPTY_FILTERS: LibraryFilters = { cuisine: "", category: "", maxMinutes: null, difficulty: "any", diet: "", course: "", includeIdeas: false };

export interface LibraryResult {
  ranked: RankedRecipe;
  otherVersions: Recipe[];
}

const PAGE = 24;

type RecipesData = ReturnType<typeof useRecipes>;

export function useLibrary(data: RecipesData) {
  const profile = data.context.profile;
  const [text, setText] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [results, setResults] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<LibraryFacetCounts | null>(null);
  const run = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void data.repo.facets().then((f) => {
      if (!cancelled && f.ok) setFacets(f.data);
    });
    return () => {
      cancelled = true;
    };
  }, [data.repo]);

  const history = useMemo(() => varietyHistory(data.recipes, data.events, data.myRatings, data.context.today), [data.recipes, data.events, data.myRatings, data.context.today]);

  const buildQuery = useCallback(
    (p: ParsedRequest | null, f: LibraryFilters, offset: number): LibraryQuery => {
      const hh = householdProfile(profile);
      const q: LibraryQuery = { ...(p?.query ?? {}) };
      if (f.cuisine) q.cuisines = [f.cuisine];
      if (f.category) q.categories = [f.category as never];
      if (f.course) q.courses = [f.course as never];
      if (f.maxMinutes) q.maxMinutes = f.maxMinutes;
      if (f.difficulty === "easy") q.maxSkill = 2;
      if (f.difficulty === "home") Object.assign(q, { minSkill: 2, maxSkill: 3 });
      if (f.difficulty === "advanced") q.minSkill = 4;
      if (f.diet) q.diet = [...new Set([...(q.diet ?? []), f.diet])];
      // Household safety filters always apply (the app re-checks every result too).
      if (hh.diet.allergies.length) q.excludeAllergens = [...hh.diet.allergies];
      if (hh.diet.style !== "omnivore") q.diet = [...new Set([...(q.diet ?? []), hh.diet.style])];
      if (f.includeIdeas) q.statuses = ["tested", "reviewed", "pending_review", "idea"];
      if (p?.avoidRecent) q.excludeIds = [...history.cooked.keys()].slice(0, 200);
      q.limit = PAGE;
      q.offset = offset;
      q.sort = q.text ? "relevance" : "rotate";
      q.seed = `${data.context.today}`;
      return q;
    },
    [profile, history, data.context.today],
  );

  const search = useCallback(
    async (nextText: string, nextFilters: LibraryFilters, offset = 0) => {
      const id = ++run.current;
      const p = nextText.trim() ? parseRecipeRequest(nextText, { dietStyle: householdProfile(profile).diet.style }) : null;
      setParsed(p);
      setLoading(true);
      setError(null);
      const r = await data.repo.search(buildQuery(p, nextFilters, offset));
      if (id !== run.current) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setTotal(r.data.total);
      setResults((prev) => (offset === 0 ? r.data.recipes : [...prev, ...r.data.recipes.filter((x) => !prev.some((y) => y.id === x.id))]));
    },
    [data.repo, buildQuery, profile],
  );

  // Search as the person types (debounced) and whenever filters change.
  useEffect(() => {
    const t = window.setTimeout(() => void search(text, filters, 0), text ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [text, filters, search]);

  const ranked: LibraryResult[] = useMemo(() => {
    const list = results.map((r) => rankRecipe(r, data.context)).filter((r) => r.allowed && !r.dismissed);
    const ordered = parsed?.query.text ? list : applyVariety(list, history, parsed?.variety ?? "balanced", data.context.today);
    return collapseVersions(ordered, (r) => r.recipe).map((x) => ({ ranked: x.item, otherVersions: x.otherVersions }));
  }, [results, data.context, parsed, history]);

  const hiddenCount = results.length - results.map((r) => rankRecipe(r, data.context)).filter((r) => r.allowed && !r.dismissed).length;

  return {
    text,
    setText,
    filters,
    setFilters,
    parsed,
    results: ranked,
    total,
    hiddenCount,
    loading,
    error,
    facets,
    canLoadMore: results.length < total,
    loadMore: () => search(text, filters, results.length),
    clear: () => {
      setText("");
      setFilters(EMPTY_FILTERS);
    },
  };
}

/** "For you" with the variety engine: the household's working set, re-ordered so it doesn't repeat itself. */
export function useForYou(data: RecipesData, ranked: RankedRecipe[], mode: VarietyMode) {
  return useMemo(() => {
    const h = varietyHistory(data.recipes, data.events, data.myRatings, data.context.today);
    const varied = applyVariety(ranked, h, mode, data.context.today);
    return {
      results: collapseVersions(varied, (r) => r.recipe).map((x) => ({ ranked: x.item, otherVersions: x.otherVersions })),
      newCuisines: newCuisines(data.recipes.filter(isCookable), h).slice(0, 6),
    };
  }, [data.recipes, data.events, data.myRatings, data.context.today, ranked, mode]);
}

/** Ask the AI for another version of a recipe, or the full recipe for a dish idea. */
export function useRecipeDraft(data: RecipesData) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useCallback(
    async (recipe: Recipe, version: "simplified" | "budget" | "elevated" | "traditional" | "full"): Promise<Result<DraftResult>> => {
      setBusy(version);
      setError(null);
      const hh = householdProfile(data.context.profile);
      const preview: DraftHousehold = { allergies: hh.diet.allergies, dietStyle: hh.diet.style, restrictions: hh.diet.restrictions, avoid: hh.diet.neverRecommend.slice(0, 30), equipment: hh.equipment, skillLevel: hh.skillLevel, servings: Math.min(24, hh.household.cookingFor) };
      const r = await draftRecipeAction({ recipeId: recipe.id, version }, data.mode === "preview" ? preview : undefined);
      setBusy(null);
      if (!r.ok) setError(r.message);
      else {
        if (data.mode === "preview") await data.repo.keepDraft?.(r.data.recipe);
        data.remember([r.data.recipe]);
      }
      return r;
    },
    [data],
  );
  return { busy, error, request };
}
