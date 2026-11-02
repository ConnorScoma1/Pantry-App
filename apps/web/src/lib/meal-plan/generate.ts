import "server-only";
import { planWeekWithClaude, readAiConfig, type AiConfig, type AiPlanResult } from "@kitchen-pantry/ai";
import { createPreviewAllowance, finishAiRequest, previewAiAllowed, reserveAiRequest } from "@/lib/ai-usage";
import {
  createSupabaseKitchenRepository,
  createSupabaseProfileStore,
  createSupabaseRecipeRepository,
  latestRatingByRecipe,
  type Result,
  type SupabaseLike,
} from "@kitchen-pantry/database";
import { catalogRecipes, dismissedRecipeIds, isCookable, rankRecipes, type RankingContext } from "@kitchen-pantry/recipe-engine";
import { specialSchema, type Special } from "@kitchen-pantry/grocery-pricing";
import type { OnboardingProfile, PantryItem, PlanningMode, Recipe, RecipeRating, RecommendationEvent } from "@kitchen-pantry/shared-types";
import { generatePlanRequestSchema, onboardingProfileSchema, type GeneratePlanRequest } from "@kitchen-pantry/validation";
import { z } from "zod";

/**
 * Server-side weekly planning shared by the web server action and the
 * phone app's API route. With Supabase, everything the planner needs is
 * loaded here as the signed-in user (RLS applies) — nothing the client says
 * about recipes or allergies is trusted. In preview mode (no database) the
 * browser sends its locally stored kitchen and profile instead.
 */

export interface GeneratedPlan {
  picks: AiPlanResult["picks"];
  unfilled: string[];
  summary: string;
  source: AiPlanResult["source"];
  notice: string | null;
}

export interface AiPlanningStatus {
  enabled: boolean;
  remaining: number | null;
}

const FEATURE = "meal_plan";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function supabaseContext(db: SupabaseLike): Promise<Result<{ ctx: RankingContext; recipes: Recipe[] }>> {
  const profiles = createSupabaseProfileStore(db);
  const kitchen = createSupabaseKitchenRepository(db);
  const recipes = createSupabaseRecipeRepository(db);
  const [profile, pantry, list, favs, mine, events] = await Promise.all([
    profiles.load(),
    kitchen.list(),
    recipes.list(),
    recipes.favorites(),
    recipes.myRatings(),
    recipes.events(),
  ]);
  if (!profile.ok) return profile;
  if (!profile.data) return { ok: false, message: "Finish setting up your household first." };
  if (!pantry.ok) return pantry;
  if (!list.ok) return list;
  const summaries = await recipes.summaries(list.data.map((r) => r.id));
  return {
    ok: true,
    data: {
      recipes: list.data,
      ctx: {
        profile: profile.data,
        pantry: pantry.data,
        today: todayIso(),
        favorites: new Set(favs.ok ? favs.data : []),
        ratings: new Map((summaries.ok ? summaries.data : []).map((s) => [s.recipeId, s])),
        myRatings: latestRatingByRecipe(mine.ok ? mine.data : []),
        dismissed: dismissedRecipeIds(events.ok ? events.data : []),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode: the browser's own data, validated and bounded.
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const previewPantryItem = z.object({
  id: z.string().max(64),
  name: z.string().trim().min(1).max(120),
  category: z.string().max(40).default("other"),
  quantity: z.number().nullable().default(null),
  unit: z.string().max(20).nullable().default(null),
  storageLocation: z.string().max(20).default("pantry"),
  useBy: isoDate.nullable().default(null),
  isStaple: z.boolean().default(false),
});
export const previewContextSchema = z.object({
  profile: onboardingProfileSchema,
  pantry: z.array(previewPantryItem).max(500),
  favorites: z.array(z.uuid()).max(500),
  myRatings: z
    .array(
      z.object({
        recipeId: z.uuid(),
        overall: z.number().int().min(1).max(5),
        wouldCookAgain: z.boolean().nullable().default(null),
        createdAt: z.string().max(40),
      }),
    )
    .max(500),
  events: z
    .array(
      z.object({
        recipeId: z.uuid(),
        event: z.enum(["shown", "opened", "cooked", "dismissed", "undismissed"]),
        surface: z.enum(["home", "recipes", "detail", "plan", "surprise"]),
        createdAt: z.string().max(40),
      }),
    )
    .max(500),
});
export type PreviewContext = z.input<typeof previewContextSchema>;

function previewRankingContext(raw: unknown): Result<RankingContext> {
  const parsed = previewContextSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[plan] preview context rejected", parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`));
    return { ok: false, message: "Your preview data couldn't be read." };
  }
  const v = parsed.data;
  const pantry: PantryItem[] = v.pantry.map((p) => ({
    id: p.id,
    ingredientId: null,
    name: p.name,
    category: p.category as PantryItem["category"],
    quantity: p.quantity,
    unit: p.unit,
    storageLocation: p.storageLocation as PantryItem["storageLocation"],
    purchasedOn: null,
    useBy: p.useBy,
    openedOn: null,
    estimatedRemainingPct: null,
    pricePaidCents: null,
    isStaple: p.isStaple,
    createdAt: "",
    updatedAt: "",
  }));
  const ratings: RecipeRating[] = v.myRatings.map((r) => ({
    recipeId: r.recipeId,
    overall: r.overall,
    flavor: null,
    difficulty: null,
    wouldCookAgain: r.wouldCookAgain,
    actualMinutes: null,
    familyApproval: null,
    notes: null,
    createdAt: r.createdAt,
  }));
  return {
    ok: true,
    data: {
      profile: v.profile as OnboardingProfile,
      pantry,
      today: todayIso(),
      favorites: new Set(v.favorites),
      ratings: new Map(),
      myRatings: latestRatingByRecipe([...ratings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      dismissed: dismissedRecipeIds(v.events as RecommendationEvent[]),
    },
  };
}

// Preview mode has no database to count usage in, so count in memory.
const preview = createPreviewAllowance();

async function remainingFor(db: SupabaseLike | null, config: AiConfig): Promise<number> {
  if (!db) return previewAiAllowed() ? preview.remaining(config.dailyPlanLimit) : 0;
  const { data, error } = await db.rpc("ai_requests_last_day", { feature_name: FEATURE });
  if (error) return 0; // fail closed: no AI if we can't count
  return Math.max(0, config.dailyPlanLimit - Number(data ?? 0));
}

async function logLimited(db: SupabaseLike | null, model: string) {
  if (!db) return;
  const { error } = await db.from("ai_usage").insert({ feature: FEATURE, model, input_tokens: 0, output_tokens: 0, outcome: "limited" });
  if (error) console.error("[ai] usage log failed", { code: error.code });
}

export async function aiPlanningStatus(db: SupabaseLike | null): Promise<AiPlanningStatus> {
  const config = readAiConfig();
  if (!config) return { enabled: false, remaining: null };
  return { enabled: config.dailyPlanLimit > 0, remaining: await remainingFor(db, config) };
}

/**
 * Plan the open nights of a week. Returns a deterministic plan when Claude
 * isn't configured, the household is over its daily limit, or Claude fails.
 */
export async function generateMealPlan(
  rawRequest: unknown,
  source: { db: SupabaseLike; householdKey: string } | { preview: unknown },
): Promise<Result<GeneratedPlan>> {
  const req = generatePlanRequestSchema.safeParse(rawRequest);
  if (!req.success) return { ok: false, message: "That planning request wasn't valid." };
  const request: GeneratePlanRequest = req.data;

  let ctx: RankingContext;
  let recipes: Recipe[] = catalogRecipes.filter(isCookable);
  let db: SupabaseLike | null = null;
  let scope = "preview";
  if ("db" in source) {
    const loaded = await supabaseContext(source.db);
    if (!loaded.ok) return loaded;
    ctx = loaded.data.ctx;
    recipes = loaded.data.recipes;
    db = source.db;
    scope = source.householdKey;
  } else {
    const loaded = previewRankingContext(source.preview);
    if (!loaded.ok) return loaded;
    ctx = loaded.data;
  }

  const candidates = rankRecipes(recipes, ctx).recipes;
  const input = {
    days: request.days,
    candidates,
    mode: request.mode as PlanningMode,
    goals: ctx.profile.goals.ranked,
    servings: ctx.profile.household.cookingFor,
    fixed: request.fixed,
    avoid: new Set(request.avoid),
    seed: request.seed,
    // Cook the Specials: sale prices the store reported (re-validated here; they only steer this household's own plan).
    specials: request.mode === "cook_the_specials" ? request.specials.map((x) => specialSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data as Special) : [],
    specialsSource: request.specialsSource,
  };

  const config = readAiConfig();
  let usable = config && config.dailyPlanLimit > 0 && (db || previewAiAllowed()) ? config : null;
  let limitNotice: string | null = null;
  // Take a slot before calling Claude, so parallel requests can't overshoot the daily limit.
  let slot: string | null = null;
  let giveBack: (() => void) | null = null;
  if (usable) {
    if (db) slot = await reserveAiRequest(db, FEATURE, usable.dailyPlanLimit);
    else giveBack = preview.reserve(usable.dailyPlanLimit);
    if (!slot && !giveBack) {
      await logLimited(db, usable.model);
      usable = null;
      limitNotice = "You've used today's AI plans, so here's our standard plan. AI planning resets within 24 hours.";
    }
  }

  const result = await planWeekWithClaude({
    config: usable,
    input,
    skillLevel: ctx.profile.skillLevel,
    householdSize: ctx.profile.household.cookingFor,
    cacheScope: scope,
  });
  // A cached answer, or no call at all, gives the slot back.
  if (usable) {
    const asked = result.source === "ai" || result.notice !== null;
    const outcome = result.cached ? "cached" : !asked ? "unused" : result.source === "ai" ? "ok" : "fallback";
    if (slot && db) await finishAiRequest(db, slot, outcome, result.model ?? usable.model, result.cached ? null : (result.usage ?? null));
    if (giveBack && (outcome === "cached" || outcome === "unused")) giveBack();
  }
  return {
    ok: true,
    data: {
      picks: result.picks,
      unfilled: result.unfilled,
      summary: result.summary,
      source: result.source,
      notice: limitNotice ?? result.notice,
    },
  };
}
