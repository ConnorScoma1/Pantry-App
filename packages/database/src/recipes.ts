import { catalogRecipes, isCookable, libraryFacets, searchLibrary, type LibraryPage, type LibraryQuery } from "@kitchen-pantry/recipe-engine";
import type {
  RatingSummary,
  Recipe,
  RecipeImage,
  RecipeImageLicense,
  RecipeLibraryInfo,
  RecipeRating,
  RecommendationEvent,
} from "@kitchen-pantry/shared-types";
import { issuesToFieldErrors, libraryQuerySchema, recipeRatingInputSchema, recommendationEventInputSchema } from "@kitchen-pantry/validation";
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
  /** This household's recent recommendation history, newest first. */
  events(): Promise<Result<RecommendationEvent[]>>;
  /** Append to the history (opened, cooked, "Not for us", undo). */
  logEvent(input: unknown): Promise<Result<RecommendationEvent>>;
  /** Library search (spec 08 §9): filters run in the database; returns one page plus the total. */
  search(query: unknown): Promise<Result<LibraryPage>>;
  /** One recipe by its slug (for recipes outside the household's working set). */
  bySlug(slug: string): Promise<Result<Recipe | null>>;
  /** How many complete recipes and ideas the library has, by cuisine and category. */
  facets(): Promise<Result<LibraryFacetCounts>>;
  /** Preview mode only: keep an AI draft on this device (with Supabase the server saves it for the household). */
  keepDraft?(recipe: Recipe): Promise<void>;
}

export interface LibraryFacetCounts {
  complete: number;
  ideas: number;
  cuisines: Record<string, number>;
  categories: Record<string, number>;
}

/** How many recipes `list()` loads to rank for the household (a rotating slice of the library, plus favourites). */
export const WORKING_SET_SIZE = 400;

/** ISO week, e.g. "2026-W44": the working set rotates weekly so the library keeps feeling new. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const idSchema = z.uuid();
const LOAD_FAILED = "We couldn't load recipes. Please try again.";
const SAVE_FAILED = "We couldn't save that. Please try again.";

export interface RecipeRow {
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
  course?: string | null;
  dessert_category?: string | null;
  chill_minutes?: number | null;
  required_equipment: Recipe["requiredEquipment"];
  tags: string[];
  tips: string[];
  image_url: string | null;
  image_alt: string | null;
  image_credit: string | null;
  image_credit_url: string | null;
  image_source_url: string | null;
  image_license: RecipeImageLicense | null;
  image_is_representative: boolean | null;
  source_url: string | null;
  status?: RecipeLibraryInfo["status"] | null;
  categories?: string[] | null;
  methods?: string[] | null;
  flavors?: string[] | null;
  occasions?: string[] | null;
  region?: string | null;
  authenticity?: RecipeLibraryInfo["authenticity"];
  dish_key?: string | null;
  variant?: RecipeLibraryInfo["variant"] | null;
  storage_notes?: string | null;
  safety_note?: string | null;
  text_license?: string | null;
  attribution?: string | null;
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

export const RECIPE_SELECT =
  "id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, course, dessert_category, chill_minutes, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, source_url, " +
  "status, categories, methods, flavors, occasions, region, authenticity, dish_key, variant, storage_notes, safety_note, text_license, attribution, " +
  "recipe_sources(kind, name, website), " +
  "recipe_ingredients(position, component, item, original_quantity, original_unit, preparation, is_optional), " +
  "recipe_instructions(position, component, body, timer_seconds, temperature_c, safe_internal_temp_c)";

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

/** A photo is only shown when its licence and credit are recorded. */
function rowImage(row: RecipeRow): RecipeImage | null {
  if (!row.image_url || !row.image_license || !row.image_source_url) return null;
  if (row.image_license !== "owned" && !row.image_credit) return null;
  return {
    url: row.image_url,
    alt: row.image_alt ?? "",
    license: row.image_license,
    creditName: row.image_credit ?? "",
    creditUrl: row.image_credit_url,
    sourceUrl: row.image_source_url,
    representative: row.image_is_representative ?? true,
  };
}

const COURSES = new Set(["main", "side", "starter", "sauce", "breakfast", "dessert"]);

function rowLibrary(row: RecipeRow): RecipeLibraryInfo | undefined {
  if (!row.status) return undefined; // older database: worked out from the recipe instead
  return {
    status: row.status,
    categories: (row.categories ?? []) as RecipeLibraryInfo["categories"],
    methods: (row.methods ?? []) as RecipeLibraryInfo["methods"],
    flavors: (row.flavors ?? []) as RecipeLibraryInfo["flavors"],
    region: row.region ?? null,
    authenticity: row.authenticity ?? null,
    dishKey: row.dish_key ?? row.slug,
    variant: row.variant ?? "classic",
    occasions: row.occasions ?? [],
    storage: row.storage_notes ?? null,
    safetyNote: row.safety_note ?? null,
    license: row.text_license ?? "unknown",
  };
}

export function recipeRowToRecipe(row: RecipeRow): Recipe {
  const prep = row.prep_minutes ?? 0;
  const cook = row.cook_minutes ?? 0;
  const library = rowLibrary(row);
  return {
    ...(library ? { library } : {}),
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    cuisine: row.cuisine,
    skillLevel: row.skill_level,
    prepMinutes: prep,
    cookMinutes: cook,
    totalMinutes: row.total_minutes ?? prep + cook + (row.chill_minutes ?? 0),
    servings: row.servings,
    course: (COURSES.has(row.course ?? "") ? row.course : "main") as Recipe["course"],
    dessertCategory: row.course === "dessert" ? ((row.dessert_category ?? "plated") as Recipe["dessertCategory"]) : null,
    chillMinutes: row.chill_minutes ?? 0,
    requiredEquipment: row.required_equipment ?? [],
    tags: row.tags ?? [],
    tips: row.tips ?? [],
    image: rowImage(row),
    source: {
      kind: row.recipe_sources?.kind ?? "editorial",
      name: row.recipe_sources?.name ?? "Kitchen Pantry",
      url: row.source_url ?? row.recipe_sources?.website ?? null,
      ...(row.attribution ? { attribution: row.attribution } : {}),
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

export interface RatingRow {
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

export function ratingRowToRating(r: RatingRow): RecipeRating {
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

export interface EventRow {
  recipe_id: string;
  event: RecommendationEvent["event"];
  surface: RecommendationEvent["surface"];
  created_at: string;
}
const EVENT_SELECT = "recipe_id, event, surface, created_at";
export const eventRowToEvent = (r: EventRow): RecommendationEvent => ({
  recipeId: r.recipe_id,
  event: r.event,
  surface: r.surface,
  createdAt: r.created_at,
});
const MAX_EVENTS = 500;

export function createSupabaseRecipeRepository(db: SupabaseLike): RecipeRepository {
  /** Full rows for these ids (RLS applies), fetched in chunks so the URL stays short. */
  async function rowsById(ids: string[]): Promise<Result<Recipe[]>> {
    const out: Recipe[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const results = await Promise.all(chunks.map((c) => db.from("recipes").select(RECIPE_SELECT).in("id", c)));
    for (const r of results) {
      if (r.error) return dbFailure("recipes", r.error, LOAD_FAILED);
      out.push(...(r.data as RecipeRow[]).map(recipeRowToRecipe));
    }
    return { ok: true, data: out };
  }
  return {
    async list() {
      // A rotating slice of the library (changes each week) plus every favourite, ranked in the app.
      const ids = await db.rpc("search_recipes", { query: { limit: WORKING_SET_SIZE, sort: "rotate", seed: `pool:${isoWeek(new Date())}` } });
      if (ids.error) return dbFailure("recipes list", ids.error, LOAD_FAILED);
      const favs = await db.from("user_favorites").select("recipe_id");
      const wanted = [...new Set([...((ids.data ?? []) as Array<{ recipe_id: string }>).map((r) => r.recipe_id), ...((favs.data ?? []) as Array<{ recipe_id: string }>).map((r) => r.recipe_id)])];
      const rows = await rowsById(wanted);
      if (!rows.ok) return rows;
      return { ok: true, data: rows.data.filter(isCookable).sort((a, b) => a.title.localeCompare(b.title)) };
    },
    async search(query) {
      const parsed = libraryQuerySchema.safeParse(query ?? {});
      if (!parsed.success) return { ok: false, message: "That search couldn't be run." };
      const { data, error } = await db.rpc("search_recipes", { query: parsed.data });
      if (error) return dbFailure("recipe search", error, LOAD_FAILED);
      const hits = (data ?? []) as Array<{ recipe_id: string; total: number | string }>;
      const rows = await rowsById(hits.map((h) => h.recipe_id));
      if (!rows.ok) return rows;
      const byId = new Map(rows.data.map((r) => [r.id, r]));
      return { ok: true, data: { recipes: hits.map((h) => byId.get(h.recipe_id)).filter((r): r is Recipe => Boolean(r)), total: Number(hits[0]?.total ?? 0) } };
    },
    async bySlug(slug) {
      if (!/^[a-z0-9-]{1,120}$/.test(slug)) return { ok: true, data: null };
      // The public recipe wins if a household copy ever shares its slug.
      const { data, error } = await db.from("recipes").select(RECIPE_SELECT).eq("slug", slug).order("visibility", { ascending: false }).limit(1);
      if (error) return dbFailure("recipe", error, LOAD_FAILED);
      const row = (data as RecipeRow[])[0];
      return { ok: true, data: row ? recipeRowToRecipe(row) : null };
    },
    async facets() {
      const { data, error } = await db.rpc("recipe_library_facets");
      if (error) return dbFailure("library facets", error, LOAD_FAILED);
      const f = (data ?? {}) as Partial<LibraryFacetCounts>;
      return { ok: true, data: { complete: Number(f.complete ?? 0), ideas: Number(f.ideas ?? 0), cuisines: f.cuisines ?? {}, categories: f.categories ?? {} } };
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
    async events() {
      const { data, error } = await db
        .from("recommendation_events")
        .select(EVENT_SELECT)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);
      if (error) return dbFailure("recommendation events", error, LOAD_FAILED);
      return { ok: true, data: (data as EventRow[]).map(eventRowToEvent) };
    },
    async logEvent(input) {
      const parsed = recommendationEventInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "That recipe no longer exists." };
      const v = parsed.data;
      const { data, error } = await db
        .from("recommendation_events")
        .insert({ recipe_id: v.recipeId, event: v.event, surface: v.surface })
        .select(EVENT_SELECT)
        .single();
      if (error) return dbFailure("log event", error, SAVE_FAILED);
      return { ok: true, data: eventRowToEvent(data as EventRow) };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode (on-device)
// ---------------------------------------------------------------------------

export const LOCAL_FAVORITES_KEY = "kp-preview-favorites-v1";
export const LOCAL_RATINGS_KEY = "kp-preview-ratings-v1";
export const LOCAL_EVENTS_KEY = "kp-preview-recommendation-events-v1";
export const LOCAL_DRAFTS_KEY = "kp-preview-recipe-drafts-v1";

export function createLocalRecipeRepository(
  storage: KeyValueStorage,
  options: { recipes?: Recipe[]; now?: () => Date } = {},
): RecipeRepository {
  const catalogue = options.recipes ?? catalogRecipes;
  const drafts = async () => (await readJson<Recipe[]>(LOCAL_DRAFTS_KEY, [])).filter((r) => r && typeof r.id === "string" && Array.isArray(r.steps));
  const now = options.now ?? (() => new Date());
  let eventWrites: Promise<void> = Promise.resolve();

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
      return { ok: true, data: [...catalogue, ...(await drafts())].filter(isCookable) };
    },
    async search(query) {
      const parsed = libraryQuerySchema.safeParse(query ?? {});
      if (!parsed.success) return { ok: false, message: "That search couldn't be run." };
      return { ok: true, data: searchLibrary([...catalogue, ...(await drafts())], parsed.data as LibraryQuery) };
    },
    async bySlug(slug) {
      return { ok: true, data: [...catalogue, ...(await drafts())].find((r) => r.slug === slug) ?? null };
    },
    async keepDraft(recipe) {
      const all = await drafts();
      await writeJson(LOCAL_DRAFTS_KEY, [recipe, ...all.filter((r) => r.id !== recipe.id)].slice(0, 50));
    },
    async facets() {
      const f = libraryFacets(catalogue);
      return { ok: true, data: { complete: f.complete, ideas: f.ideas, cuisines: Object.fromEntries(f.cuisines), categories: Object.fromEntries(f.categories) } };
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
    async events() {
      const all = await readJson<RecommendationEvent[]>(LOCAL_EVENTS_KEY, []);
      return { ok: true, data: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    },
    async logEvent(input) {
      const parsed = recommendationEventInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "That recipe no longer exists." };
      const event: RecommendationEvent = { ...parsed.data, createdAt: now().toISOString() };
      // One write at a time, so events logged together aren't lost.
      const write = eventWrites.then(async () => {
        const all = await readJson<RecommendationEvent[]>(LOCAL_EVENTS_KEY, []);
        // Keep the newest entries only, so on-device history can't grow without bound.
        await writeJson(LOCAL_EVENTS_KEY, [...all, event].slice(-MAX_EVENTS));
      });
      eventWrites = write.catch(() => {});
      await write;
      return { ok: true, data: event };
    },
  };
}

/** Latest rating per recipe (input sorted newest first). */
export function latestRatingByRecipe(ratings: RecipeRating[]): Map<string, RecipeRating> {
  const map = new Map<string, RecipeRating>();
  for (const r of ratings) if (!map.has(r.recipeId)) map.set(r.recipeId, r);
  return map;
}
