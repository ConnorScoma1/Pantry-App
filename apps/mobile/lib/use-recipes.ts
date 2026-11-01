import { latestRatingByRecipe, type Result } from "@kitchen-pantry/database";
import { dismissedRecipeIds, rankRecipes, type RankingContext, type RecipeFilters } from "@kitchen-pantry/recipe-engine";
import type {
  RatingSummary,
  Recipe,
  RecipeRating,
  RecommendationEvent,
  RecommendationSurface,
} from "@kitchen-pantry/shared-types";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useApp, useProfile } from "./app-state";
import { useKitchen } from "./use-kitchen";

/**
 * Same behaviour as the web hook: recipes plus everything needed to rank
 * them for this household (profile, kitchen, favourites, real rating
 * summaries, the household's own ratings). Ranking itself is pure and
 * shared (recipe-engine). Reloads whenever the screen comes into view so
 * a rating or favourite made on another screen shows up straight away.
 */
export function useRecipes() {
  const { recipes: repo } = useApp();
  const profile = useProfile();
  const kitchen = useKitchen();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Map<string, RatingSummary>>(new Map());
  const [myRatings, setMyRatings] = useState<RecipeRating[]>([]);
  const [events, setEvents] = useState<RecommendationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [list, favs, mine, history] = await Promise.all([repo.list(), repo.favorites(), repo.myRatings(), repo.events()]);
    if (!list.ok) {
      setError(list.message);
      setLoading(false);
      return;
    }
    setError(null);
    setRecipes(list.data);
    if (favs.ok) setFavorites(new Set(favs.data));
    if (mine.ok) setMyRatings(mine.data);
    if (history.ok) setEvents(history.data);
    const sums = await repo.summaries(list.data.map((r) => r.id));
    if (sums.ok) setSummaries(new Map(sums.data.map((s) => [s.recipeId, s])));
    setLoading(false);
  }, [repo]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

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

  const toggleFavorite = useCallback(
    async (recipeId: string): Promise<Result<null>> => {
      const on = !favorites.has(recipeId);
      const flip = (add: boolean) =>
        setFavorites((prev) => {
          const next = new Set(prev);
          if (add) next.add(recipeId);
          else next.delete(recipeId);
          return next;
        });
      flip(on); // optimistic
      const result = await repo.setFavorite(recipeId, on);
      if (!result.ok) flip(!on);
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
    loading: loading || kitchen.loading,
    error,
    recipes,
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
  };
}
