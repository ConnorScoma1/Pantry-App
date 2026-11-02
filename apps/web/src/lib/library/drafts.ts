import "server-only";
import { AiRequestError, draftRecipe, readAiConfig, type DraftHousehold, type DraftKind } from "@kitchen-pantry/ai";
import { createSupabaseProfileStore, RECIPE_SELECT, recipeRowToRecipe, type RecipeRow, type Result, type SupabaseLike } from "@kitchen-pantry/database";
import { catalogRecipes, householdProfile, libraryOf, toImportPayload } from "@kitchen-pantry/recipe-engine";
import type { Recipe, RecipeVariant } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { createPreviewAllowance, finishAiRequest, previewAiAllowed, reserveAiRequest } from "@/lib/ai-usage";

/**
 * AI recipe drafts on the server (spec 08 §5–7): another version of a
 * library recipe, or a full recipe for a dish idea. Claude's key stays here.
 * With Supabase, the base recipe and the household's limits are loaded as the
 * signed-in user (RLS applies); the draft is validated, screened and saved
 * only for that household as "not yet reviewed". Asking again for the same
 * recipe and version returns the saved draft without calling Claude.
 */
const FEATURE = "recipe_draft";
const requestSchema = z.object({
  recipeId: z.uuid(),
  version: z.enum(["simplified", "budget", "elevated", "traditional", "full"]),
});

export interface DraftResult {
  recipe: Recipe;
  changes: string[];
  /** True when this household already had the draft (no AI call). */
  cached: boolean;
  remaining: number | null;
}

const preview = createPreviewAllowance();

function variantOf(version: z.infer<typeof requestSchema>["version"]): RecipeVariant {
  return version === "full" || version === "traditional" ? "classic" : version;
}

export async function draftForHousehold(raw: unknown, source: { db: SupabaseLike; householdKey: string } | { preview: { household: DraftHousehold } }): Promise<Result<DraftResult>> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Pick a recipe and a version." };
  const { recipeId, version } = parsed.data;
  const config = readAiConfig();
  const limit = config?.dailyDraftLimit ?? 5;
  if (!config || limit <= 0) return { ok: false, message: "AI drafts aren't switched on (no Anthropic API key on the server)." };

  let base: Recipe | undefined;
  let household: DraftHousehold;
  const db = "db" in source ? source.db : null;
  if (db) {
    const { data, error } = await db.from("recipes").select(RECIPE_SELECT).eq("id", recipeId).maybeSingle();
    if (error || !data) return { ok: false, message: "That recipe isn't available." };
    base = recipeRowToRecipe(data as RecipeRow);
    const profile = await createSupabaseProfileStore(db).load();
    if (!profile.ok || !profile.data) return { ok: false, message: "Finish setting up your household first." };
    const p = householdProfile(profile.data);
    household = { allergies: p.diet.allergies, dietStyle: p.diet.style, avoid: p.diet.neverRecommend, equipment: p.equipment, skillLevel: p.skillLevel, servings: p.household.cookingFor };
    // Already drafted for this household? Return it.
    const variant = variantOf(version);
    const { data: existingId } = await db.rpc("find_household_draft", { base: recipeId, draft_variant: variant });
    if (typeof existingId === "string") {
      const { data: hit } = await db.from("recipes").select(RECIPE_SELECT).eq("id", existingId).maybeSingle();
      if (hit) return { ok: true, data: { recipe: recipeRowToRecipe(hit as RecipeRow), changes: [], cached: true, remaining: null } };
    }
  } else {
    if (!previewAiAllowed()) return { ok: false, message: "AI drafts need accounts on this server." };
    base = catalogRecipes.find((r) => r.id === recipeId);
    if (!base) return { ok: false, message: "That recipe isn't available." };
    household = (source as { preview: { household: DraftHousehold } }).preview.household;
  }
  const isIdea = libraryOf(base).status === "idea";
  if (isIdea !== (version === "full")) return { ok: false, message: isIdea ? "Ask for the full recipe for a dish idea." : "That recipe is already complete — pick a version." };
  const draft: DraftKind = isIdea ? { kind: "idea", idea: base } : { kind: "version", recipe: base, variant: version as RecipeVariant | "traditional" };

  let slot: string | null = null;
  let giveBack: (() => void) | null = null;
  if (db) slot = await reserveAiRequest(db, FEATURE, limit);
  else giveBack = preview.reserve(limit);
  if (!slot && !giveBack) return { ok: false, message: `You've used today's ${limit} AI recipe drafts. Try again tomorrow.` };

  try {
    const householdKey = "db" in source ? source.householdKey : "preview";
    const d = await draftRecipe({ config, draft, household, householdKey });
    if (slot && db) await finishAiRequest(db, slot, "ok", d.model, d.usage);
    let saved: Recipe = { ...d.recipe, source: { ...d.recipe.source, name: "AI draft" } };
    if (db) {
      const { data: id, error } = await db.rpc("save_household_recipe", { recipe: { ...toImportPayload(d.recipe), variantOf: base.id } });
      if (error) return { ok: false, message: "We made the draft but couldn't save it. Please try again." };
      const { data: row } = await db.from("recipes").select(RECIPE_SELECT).eq("id", String(id)).maybeSingle();
      if (row) saved = recipeRowToRecipe(row as RecipeRow);
    }
    const remaining = db ? null : preview.remaining(limit);
    return { ok: true, data: { recipe: saved, changes: d.changes, cached: false, remaining } };
  } catch (error) {
    if (slot && db) await finishAiRequest(db, slot, "fallback", config.model, null);
    if (error instanceof AiRequestError) {
      console.error("[draft] not used", { kind: error.kind });
      return { ok: false, message: error.kind === "invalid" ? "The draft didn't pass our safety checks, so it wasn't saved. Try another version." : error.kind === "rate_limited" || error.kind === "overloaded" ? "The AI is busy right now. Try again in a minute." : "We couldn't make a draft just now." };
    }
    throw error;
  }
}
