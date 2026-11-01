import { testKitchenRecipes } from "@kitchen-pantry/recipe-engine";
import type { RatingSummary, Recipe, RecipeRating } from "@kitchen-pantry/shared-types";
import { issuesToFieldErrors, recipeRatingInputSchema } from "@kitchen-pantry/validation";
import { z } from "zod";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";

/**
 * Recipes, favourites and ratings — shared by web and mobile.
 * Supabase serves the approved catalogue (and, later, licensed sources);
 * preview mode serves the bundled Test Kitchen catalogue.
 */
export interface RecipeRepository {
  list(): Promise<Result<Recipe[]>>;
  favorites(): Promise<Result<string[]>>;
  setFavorite(recipeId: unknown, favorite: boolean): Promise<Result<null>>;
  /** Real aggregate ratings across households. Empty in preview mode. */
  summaries(recipeIds: string[]): Promise<Result<RatingSummary[]>>;
  /** This household's ratings, newest first. */
  myRatings(): Promise<Result<RecipeRating[]>>;
  rate(input: unknown): Promise<Result<RecipeRating>>;
}

const idSchema = z.uuid();
const LOAD_FAILED = "We couldn't load recipes. Please try again.";
const SAVE_FAILED = "We couldn't save that. Please try again.";

interface RecipeRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cuisine: Recipe["cuisine"];
  skill_level: Recipe["skillLevel"];
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  servings: number;
  required_equipment: Recipe["requiredEquipment"];
  tags: string[];
  tips: string[];
  image_url: string | null;
  source_url: string | null;
  recipe_sources: { kind: Recipe["source"]["kind"]; name: string; website: string | null } | null;
  recipe_ingredients: Array<{
    position: number;
    component: string | null;
    item: string;
    original_quantity: number | string | null;
    original_unit: string | null;
    preparation: string | null;
    is_optional: boolean;
  }>;
  recipe_instructions: Array<{
    position: number;
    component: string | null;
    body: string;
    timer_seconds: number | null;
    temperature_c: number | string | null;
    safe_internal_temp_c: number | string | null;
  }>;
}

const RECIPE_SELECT =
  "id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, image_url, source_url, " +
  "recipe_sources(kind, name, website), " +
  "recipe_ingredients(position, component, item, original_quantity, original_unit, preparation, is_optional), " +
  "recipe_instructions(position, component, body, timer_seconds, temperature_c, safe_internal_temp_c)";

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function recipeRowToRecipe(row: RecipeRow): Recipe {
  const prep = row.prep_minutes ?? 0;
  const cook = row.cook_minutes ?? 0;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    cuisine: row.cuisine,
    skillLevel: row.skill_level,
    prepMinutes: prep,
    cookMinutes: cook,
    totalMinutes: row.total_minutes ?? prep + cook,
    servings: row.servings,
    requiredEquipment: row.required_equipment ?? [],
    tags: row.tags ?? [],
    tips: row.tips ?? [],
    imageUrl: row.image_url,
    source: {
      kind: row.recipe_sources?.kind ?? "editorial",
      name: row.recipe_sources?.name ?? "Kitchen Pantry",
      url: row.source_url ?? row.recipe_sources?.website ?? null,
    },
    ingredients: [...(row.recipe_ingredients ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        position: i.position,
        component: i.component,
        quantity: num(i.original_quantity),
        unit: i.original_unit,
        item: i.item,
        preparation: i.preparation,
        optional: i.is_optional,
      })),
    steps: [...(row.recipe_instructions ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        position: s.position,
        component: s.component,
        body: s.body,
        timerSeconds: s.timer_seconds,
        temperatureC: num(s.temperature_c),
        safeInternalTempC: num(s.safe_internal_temp_c),
      })),
  };
}

interface RatingRow {
  recipe_id: string;
  overall: number;
  flavor: number | null;
  difficulty: number | null;
  would_cook_again: boolean | null;
  actual_minutes: number | null;
  family_approval: number | null;
  notes: string | null;
  created_at: string;
}

const RATING_SELECT = "recipe_id, overall, flavor, difficulty, would_cook_again, actual_minutes, family_approval, notes, created_at";

function ratingRowToRating(r: RatingRow): RecipeRating {
  return {
    recipeId: r.recipe_id,
    overall: r.overall,
    flavor: r.flavor,
    difficulty: r.difficulty,
    wouldCookAgain: r.would_cook_again,
    actualMinutes: r.actual_minutes,
    familyApproval: r.family_approval,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

function invalidRating(error: z.ZodError): Result<never> {
  return { ok: false, message: "Please check your rating.", fieldErrors: issuesToFieldErrors(error) };
}

export function createSupabaseRecipeRepository(db: SupabaseLike): RecipeRepository {
  return {
    async list() {
      const { data, error } = await db.from("recipes").select(RECIPE_SELECT).order("title").limit(500);
      if (error) return dbFailure("recipes list", error, LOAD_FAILED);
      return { ok: true, data: (data as RecipeRow[]).map(recipeRowToRecipe) };
    },
    async favorites() {
      const { data, error } = await db.from("user_favorites").select("recipe_id");
      if (error) return dbFailure("favorites", error, LOAD_FAILED);
      return { ok: true, data: (data as Array<{ recipe_id: string }>).map((r) => r.recipe_id) };
    },
    async setFavorite(recipeId, favorite) {
      const id = idSchema.safeParse(recipeId);
      if (!id.success) return { ok: false, message: "That recipe no longer exists." };
      const { error } = favorite
        ? await db.from("user_favorites").upsert({ recipe_id: id.data }, { onConflict: "user_id,recipe_id", ignoreDuplicates: true })
        : await db.from("user_favorites").delete().eq("recipe_id", id.data);
      if (error) return dbFailure("favorite", error, SAVE_FAILED);
      return { ok: true, data: null };
    },
    async summaries(recipeIds) {
      const ids = recipeIds.filter((r) => idSchema.safeParse(r).success);
      if (ids.length === 0) return { ok: true, data: [] };
      const { data, error } = await db.rpc("recipe_rating_summaries", { recipe_ids: ids });
      if (error) return dbFailure("rating summaries", error, LOAD_FAILED);
      const rows = (data ?? []) as Array<{
        recipe_id: string;
        average: number | string;
        rating_count: number | string;
        would_cook_again_pct: number | string | null;
      }>;
      return {
        ok: true,
        data: rows.map((r) => ({
          recipeId: r.recipe_id,
          average: Number(r.average),
          count: Number(r.rating_count),
          wouldCookAgainPct: r.would_cook_again_pct === null ? null : Number(r.would_cook_again_pct),
        })),
      };
    },
    async myRatings() {
      const { data, error } = await db
        .from("recipe_ratings")
        .select(RATING_SELECT)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return dbFailure("my ratings", error, LOAD_FAILED);
      return { ok: true, data: (data as RatingRow[]).map(ratingRowToRating) };
    },
    async rate(input) {
      const parsed = recipeRatingInputSchema.safeParse(input);
      if (!parsed.success) return invalidRating(parsed.error);
      const v = parsed.data;
      const { data, error } = await db
        .from("recipe_ratings")
        .insert({
          recipe_id: v.recipeId,
          overall: v.overall,
          flavor: v.flavor,
          difficulty: v.difficulty,
          would_cook_again: v.wouldCookAgain,
          actual_minutes: v.actualMinutes,
          family_approval: v.familyApproval,
          notes: v.notes || null,
        })
        .select(RATING_SELECT)
        .single();
      if (error) return dbFailure("rate", error, SAVE_FAILED);
      return { ok: true, data: ratingRowToRating(data as RatingRow) };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode (on-device)
// ---------------------------------------------------------------------------

export const LOCAL_FAVORITES_KEY = "kp-preview-favorites-v1";
export const LOCAL_RATINGS_KEY = "kp-preview-ratings-v1";

export function createLocalRecipeRepository(
  storage: KeyValueStorage,
  options: { recipes?: Recipe[]; now?: () => Date } = {},
): RecipeRepository {
  const recipes = options.recipes ?? testKitchenRecipes;
  const now = options.now ?? (() => new Date());

  async function readJson<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await storage.getItem(key);
      const value: unknown = raw ? JSON.parse(raw) : fallback;
      return Array.isArray(fallback) && !Array.isArray(value) ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }
  async function writeJson(key: string, value: unknown): Promise<void> {
    try {
      await storage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable.
    }
  }

  return {
    async list() {
      return { ok: true, data: recipes };
    },
    async favorites() {
      return { ok: true, data: await readJson<string[]>(LOCAL_FAVORITES_KEY, []) };
    },
    async setFavorite(recipeId, favorite) {
      const id = idSchema.safeParse(recipeId);
      if (!id.success) return { ok: false, message: "That recipe no longer exists." };
      const current = new Set(await readJson<string[]>(LOCAL_FAVORITES_KEY, []));
      if (favorite) current.add(id.data);
      else current.delete(id.data);
      await writeJson(LOCAL_FAVORITES_KEY, [...current]);
      return { ok: true, data: null };
    },
    async summaries() {
      // No other households exist in preview mode, so there is no community rating.
      return { ok: true, data: [] };
    },
    async myRatings() {
      const all = await readJson<RecipeRating[]>(LOCAL_RATINGS_KEY, []);
      return { ok: true, data: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    },
    async rate(input) {
      const parsed = recipeRatingInputSchema.safeParse(input);
      if (!parsed.success) return invalidRating(parsed.error);
      const rating: RecipeRating = { ...parsed.data, notes: parsed.data.notes || null, createdAt: now().toISOString() };
      await writeJson(LOCAL_RATINGS_KEY, [...(await readJson<RecipeRating[]>(LOCAL_RATINGS_KEY, [])), rating]);
      return { ok: true, data: rating };
    },
  };
}

/** Latest rating per recipe (input sorted newest first). */
export function latestRatingByRecipe(ratings: RecipeRating[]): Map<string, RecipeRating> {
  const map = new Map<string, RecipeRating>();
  for (const r of ratings) if (!map.has(r.recipeId)) map.set(r.recipeId, r);
  return map;
}
