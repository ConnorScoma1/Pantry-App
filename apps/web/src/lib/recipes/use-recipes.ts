"use client";

import { createLocalRecipeRepository, latestRatingByRecipe, type RecipeRepository, type Result } from "@kitchen-pantry/database";
import { rankRecipes, type RankingContext, type RecipeFilters } from "@kitchen-pantry/recipe-engine";
import type { RatingSummary, Recipe, RecipeRating } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  favoritesAction,
  listRecipesAction,
  myRatingsAction,
  rateRecipeAction,
  setFavoriteAction,
  summariesAction,
} from "@/app/(app)/recipes/actions";
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
};

let previewRecipes: RecipeRepository | null = null;
function previewRepository(): RecipeRepository {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [list, favs, mine] = await Promise.all([repo.list(), repo.favorites(), repo.myRatings()]);
      if (cancelled) return;
      if (!list.ok) {
        setError(list.message);
        setLoading(false);
        return;
      }
      setRecipes(list.data);
      if (favs.ok) setFavorites(new Set(favs.data));
      if (mine.ok) setMyRatings(mine.data);
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
    }),
    [profile, kitchen.items, kitchen.today, favorites, summaries, myRatings],
  );

  const rank = useCallback((filters: RecipeFilters = {}) => rankRecipes(recipes, context, filters), [recipes, context]);

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

  const rate = useCallback(
    async (input: unknown): Promise<Result<RecipeRating>> => {
      const result = await repo.rate(input);
      if (result.ok) {
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
    [repo],
  );

  return {
    mode,
    loading: loading || kitchen.loading,
    error,
    recipes,
    context,
    rank,
    favorites,
    myRatings: context.myRatings,
    toggleFavorite,
    rate,
  };
}
