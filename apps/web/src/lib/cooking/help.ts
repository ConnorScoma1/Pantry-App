import "server-only";
import { AiRequestError, askCookingQuestion, cookingQuestionSchema, offlineHelp, readAiConfig } from "@kitchen-pantry/ai";
import { createSupabaseProfileStore, RECIPE_SELECT, recipeRowToRecipe, type RecipeRow, type Result, type SupabaseLike } from "@kitchen-pantry/database";
import { catalogRecipes } from "@kitchen-pantry/recipe-engine";
import { allergens as allergenCatalog, type AllergenCode, type Recipe } from "@kitchen-pantry/shared-types";
import { createPreviewAllowance, finishAiRequest, previewAiAllowed, reserveAiRequest } from "@/lib/ai-usage";

/**
 * The cooking assistant on the server (the Claude key never leaves it).
 * With Supabase the recipe and the household's allergens are loaded here as
 * the signed-in user (RLS applies); nothing the client says about them is
 * trusted. In preview mode only the built-in Test Kitchen recipes can be
 * asked about, with the allergens the browser sends.
 */
const FEATURE = "cooking_help";

export interface CookingHelp {
  source: "ai" | "curated";
  answer: string | null;
  safetyNote: string | null;
  /** Curated, no-AI help for the step (substitutions, safe temperatures). */
  tips: string[];
  notice: string | null;
  remaining: number | null;
}

const CODES = new Set<string>(allergenCatalog.map((a) => a.code));

const preview = createPreviewAllowance();

export async function answerCookingQuestion(raw: unknown, source: { db: SupabaseLike } | { previewAllergies: unknown }): Promise<Result<CookingHelp>> {
  const parsed = cookingQuestionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Ask a question about this recipe." };
  const q = parsed.data;

  let recipe: Recipe | undefined;
  let allergies: AllergenCode[] = [];
  let avoid: string[] = [];
  let db: SupabaseLike | null = null;
  if ("db" in source) {
    db = source.db;
    const { data, error } = await db.from("recipes").select(RECIPE_SELECT).eq("id", q.recipeId).maybeSingle();
    if (error || !data) return { ok: false, message: "That recipe isn't available." };
    recipe = recipeRowToRecipe(data as RecipeRow);
    const profile = await createSupabaseProfileStore(db).load();
    if (!profile.ok || !profile.data) return { ok: false, message: "Finish setting up your household first." };
    const p = profile.data;
    allergies = [...new Set([...p.diet.allergies, ...(p.householdDiet?.allergies ?? [])])] as AllergenCode[];
    avoid = [...p.diet.neverRecommend, ...(p.householdDiet?.neverRecommend ?? [])];
  } else {
    recipe = catalogRecipes.find((r) => r.id === q.recipeId && r.steps.length > 0);
    if (!recipe) return { ok: false, message: "That recipe isn't available." };
    const list = Array.isArray(source.previewAllergies) ? source.previewAllergies : [];
    allergies = list.filter((a): a is AllergenCode => typeof a === "string" && CODES.has(a)).slice(0, 20);
  }

  const tips = offlineHelp(recipe, q.step, allergies, avoid);
  const config = readAiConfig();
  const limit = config?.dailyHelpLimit ?? 30;
  if (!config || limit <= 0) {
    return { ok: true, data: { source: "curated", answer: null, safetyNote: null, tips, notice: "The cooking assistant isn't switched on (no Anthropic API key on the server). Here's what we can tell you without it.", remaining: null } };
  }
  if (!db && !previewAiAllowed()) {
    return { ok: true, data: { source: "curated", answer: null, safetyNote: null, tips, notice: "The cooking assistant needs accounts on this server. Here's what we can tell you without it.", remaining: null } };
  }

  // Take a slot before calling Claude, so parallel questions can't overshoot the limit.
  let slot: string | null = null;
  let giveBack: (() => void) | null = null;
  if (db) slot = await reserveAiRequest(db, FEATURE, limit);
  else giveBack = preview.reserve(limit);
  if (!slot && !giveBack) {
    return { ok: true, data: { source: "curated", answer: null, safetyNote: null, tips, notice: "You've used today's cooking questions. Here's what we can tell you without the assistant.", remaining: 0 } };
  }
  const remaining = async () => {
    if (!db) return preview.remaining(limit);
    const { data, error } = await db.rpc("ai_requests_last_day", { feature_name: FEATURE });
    return error ? null : Math.max(0, limit - Number(data ?? 0));
  };

  try {
    const a = await askCookingQuestion({ config, recipe, question: q, allergies });
    if (slot && db) await finishAiRequest(db, slot, "ok", a.model, a.usage);
    return { ok: true, data: { source: "ai", answer: a.answer, safetyNote: a.safetyNote, tips, notice: null, remaining: await remaining() } };
  } catch (error) {
    if (slot && db) await finishAiRequest(db, slot, "fallback", config.model, null);
    const msg =
      error instanceof AiRequestError && error.kind === "invalid"
        ? "The assistant's answer couldn't be used safely, so it isn't shown."
        : error instanceof AiRequestError && (error.kind === "rate_limited" || error.kind === "overloaded")
          ? "The assistant is busy right now. Try again in a minute."
          : "The assistant couldn't answer just now.";
    return { ok: true, data: { source: "curated", answer: null, safetyNote: null, tips, notice: `${msg} Here's what we can tell you without it.`, remaining: await remaining() } };
  }
}
