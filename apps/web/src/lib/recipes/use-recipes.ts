"use client";

import { createLocalRecipeRepository, latestRatingByRecipe, type RecipeRepository, type Result } from "@kitchen-pantry/database";
import { dismissedRecipeIds, rankRecipes, type RankingContext, type RecipeFilters } from "@kitchen-pantry/recipe-engine";
import type {
  RatingSummary,
  Recipe,
  RecipeRating,
  RecommendationEvent,
  RecommendationSurface,
} from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  favoritesAction,
  listRecipesAction,
  logRecommendationEventAction,
  myRatingsAction,
  recommendationEventsAction,
  rateRecipeAction,
  setFavoriteAction,
  summariesAction,
} from "@/app/(app)/recipes/actions";
import { libraryFacetsAction, recipeBySlugAction, searchLibraryAction } from "@/app/(app)/recipes/library-actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";
import { useKitchen } from "@/lib/kitchen/use-kitchen";

const supabaseRecipes: RecipeRepository = {
  list: () => listRecipesAction(),
  favorites: () => favoritesAction(),
  setFavorite: (id, on) => setFavoriteAction(id, on),
  summaries: (ids) => summariesAction(ids),
  myRatings: () => myRatingsAction(),
  rate: (input) => rateRecipeAction(input),
  events: () => recommendationEventsAction(),
  logEvent: (input) => logRecommendationEventAction(input),
  search: (query) => searchLibraryAction(query),
  bySlug: (slug) => recipeBySlugAction(slug),
  facets: () => libraryFacetsAction(),
};

let previewRecipes: RecipeRepository | null = null;
/** The on-device recipe library used in preview mode (shared by every hook). */
export function previewRepository(): RecipeRepository {
  previewRecipes ??= createLocalRecipeRepository(browserStorage);
  return previewRecipes;
}

/**
 * Recipes plus everything needed to rank them for this household:
 * profile, kitchen inventory, favourites, real rating summaries and the
 * household's own ratings. Ranking itself is pure (recipe-engine).
 */
export function useRecipes() {
  const { mode, profile } = useProfile();
  const kitchen = useKitchen();
  const repo = mode === "preview" ? previewRepository() : supabaseRecipes;

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Map<string, RatingSummary>>(new Map());
  const [myRatings, setMyRatings] = useState<RecipeRating[]>([]);
  const [events, setEvents] = useState<RecommendationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [list, favs, mine, history] = await Promise.all([repo.list(), repo.favorites(), repo.myRatings(), repo.events()]);
      if (cancelled) return;
      if (!list.ok) {
        setError(list.message);
        setLoading(false);
        return;
      }
      setRecipes(list.data);
      if (favs.ok) setFavorites(new Set(favs.data));
      if (mine.ok) setMyRatings(mine.data);
      if (history.ok) setEvents(history.data);
      const sums = await repo.summaries(list.data.map((r) => r.id));
      if (!cancelled && sums.ok) setSummaries(new Map(sums.data.map((s) => [s.recipeId, s])));
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const context: RankingContext = useMemo(
    () => ({
      profile,
      pantry: kitchen.items,
      today: kitchen.today,
      favorites,
      ratings: summaries,
      myRatings: latestRatingByRecipe(myRatings),
      dismissed: dismissedRecipeIds(events),
    }),
    [profile, kitchen.items, kitchen.today, favorites, summaries, myRatings, events],
  );

  const rank = useCallback((filters: RecipeFilters = {}) => rankRecipes(recipes, context, filters), [recipes, context]);

  /** A recipe by slug: from the working set, else fetched (library recipes outside it, ideas, drafts). */
  const findBySlug = useCallback(
    async (slug: string): Promise<Recipe | null> => {
      const known = recipes.find((r) => r.slug === slug);
      if (known) return known;
      const r = await repo.bySlug(slug);
      if (!r.ok || !r.data) return null;
      const found = r.data;
      setRecipes((prev) => (prev.some((x) => x.id === found.id) ? prev : [...prev, found]));
      return found;
    },
    [recipes, repo],
  );
  /** Add recipes (e.g. a new AI draft) to the working set. */
  const remember = useCallback((list: Recipe[]) => {
    setRecipes((prev) => [...prev, ...list.filter((r) => !prev.some((x) => x.id === r.id))]);
  }, []);

  const toggleFavorite = useCallback(
    async (recipeId: string): Promise<Result<null>> => {
      const on = !favorites.has(recipeId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (on) next.add(recipeId);
        else next.delete(recipeId);
        return next;
      });
      const result = await repo.setFavorite(recipeId, on);
      if (!result.ok) {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (on) next.delete(recipeId);
          else next.add(recipeId);
          return next;
        });
      }
      return result;
    },
    [favorites, repo],
  );

  /** Append to the history; optimistic so "Not for us" feels instant. */
  const logEvent = useCallback(
    async (recipeId: string, event: RecommendationEvent["event"], surface: RecommendationSurface): Promise<Result<RecommendationEvent>> => {
      const optimistic: RecommendationEvent = { recipeId, event, surface, createdAt: new Date().toISOString() };
      setEvents((prev) => [optimistic, ...prev]);
      const result = await repo.logEvent({ recipeId, event, surface });
      setEvents((prev) => {
        const rest = prev.filter((e) => e !== optimistic);
        return result.ok ? [result.data, ...rest] : rest;
      });
      return result;
    },
    [repo],
  );
  const dismiss = useCallback((recipeId: string, surface: RecommendationSurface) => logEvent(recipeId, "dismissed", surface), [logEvent]);
  const undismiss = useCallback((recipeId: string, surface: RecommendationSurface) => logEvent(recipeId, "undismissed", surface), [logEvent]);

  const rate = useCallback(
    async (input: unknown): Promise<Result<RecipeRating>> => {
      const result = await repo.rate(input);
      if (result.ok) {
        void logEvent(result.data.recipeId, "cooked", "detail");
        setMyRatings((prev) => [result.data, ...prev]);
        const sums = await repo.summaries([result.data.recipeId]);
        if (sums.ok) {
          setSummaries((prev) => {
            const next = new Map(prev);
            for (const s of sums.data) next.set(s.recipeId, s);
            return next;
          });
        }
      }
      return result;
    },
    [repo, logEvent],
  );

  return {
    mode,
    repo,
    loading: loading || kitchen.loading,
    error,
    recipes,
    findBySlug,
    remember,
    context,
    rank,
    favorites,
    myRatings: context.myRatings,
    toggleFavorite,
    rate,
    dismissed: context.dismissed ?? new Set<string>(),
    dismiss,
    undismiss,
    logEvent,
    events,
  };
}
