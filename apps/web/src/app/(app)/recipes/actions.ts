"use server";

import { createSupabaseRecipeRepository, type RecipeRepository, type Result } from "@kitchen-pantry/database";
import type { RatingSummary, Recipe, RecipeRating, RecommendationEvent } from "@kitchen-pantry/shared-types";
import { answerCookingQuestion, type CookingHelp } from "@/lib/cooking/help";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Recipe server actions: thin wrappers over the shared repository (RLS applies). */
async function run<T>(fn: (repo: RecipeRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Please sign in again." };
  return fn(createSupabaseRecipeRepository(asSupabaseLike(supabase)));
}

export async function listRecipesAction(): Promise<Result<Recipe[]>> {
  return run((r) => r.list());
}
export async function favoritesAction(): Promise<Result<string[]>> {
  return run((r) => r.favorites());
}
export async function setFavoriteAction(recipeId: unknown, favorite: boolean): Promise<Result<null>> {
  return run((r) => r.setFavorite(recipeId, Boolean(favorite)));
}
export async function summariesAction(recipeIds: string[]): Promise<Result<RatingSummary[]>> {
  return run((r) => r.summaries(Array.isArray(recipeIds) ? recipeIds.slice(0, 500) : []));
}
export async function myRatingsAction(): Promise<Result<RecipeRating[]>> {
  return run((r) => r.myRatings());
}
export async function rateRecipeAction(input: unknown): Promise<Result<RecipeRating>> {
  return run((r) => r.rate(input));
}
export async function recommendationEventsAction(): Promise<Result<RecommendationEvent[]>> {
  return run((r) => r.events());
}
export async function logRecommendationEventAction(input: unknown): Promise<Result<RecommendationEvent>> {
  return run((r) => r.logEvent(input));
}

/**
 * The cooking assistant. With Supabase the recipe and allergens are loaded on
 * the server as the signed-in user; in preview mode only built-in recipes,
 * with the allergens this browser has.
 */
export async function cookingHelpAction(input: unknown, previewAllergies?: unknown): Promise<Result<CookingHelp>> {
  if (!isSupabaseConfigured) return answerCookingQuestion(input, { previewAllergies });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Please sign in again." };
  return answerCookingQuestion(input, { db: asSupabaseLike(supabase) });
}
