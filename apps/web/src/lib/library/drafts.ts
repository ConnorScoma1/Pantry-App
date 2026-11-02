import "server-only";
import { AiRequestError, draftRecipe, readAiConfig, type DraftHousehold, type DraftKind, type UseUpIngredient } from "@kitchen-pantry/ai";
import { assessUrgency } from "@kitchen-pantry/inventory-engine";
import { createSupabaseProfileStore, PANTRY_COLUMNS, pantryRowToItem, RECIPE_SELECT, recipeRowToRecipe, type PantryRow, type RecipeRow, type Result, type SupabaseLike } from "@kitchen-pantry/database";
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
    household = { allergies: p.diet.allergies, dietStyle: p.diet.style, restrictions: p.diet.restrictions, avoid: p.diet.neverRecommend, equipment: p.equipment, skillLevel: p.skillLevel, servings: p.household.cookingFor };
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

// ---------------------------------------------------------------------------
// "Ask AI for a new idea" on Use it before you lose it (spec 01 §6): a new
// dinner around the picked kitchen ingredients. With Supabase the items are
// read from the household's own kitchen (RLS) by id — names never come from
// the request — and anything past its date or a staple is left out. Same
// daily limit, checks and "not yet reviewed" saving as other drafts.
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const useUpRequestSchema = z.object({ itemIds: z.array(z.uuid()).min(1).max(5), today: isoDate });
const previewUseUpSchema = z.object({
  items: z
    .array(z.object({ name: z.string().trim().min(1).max(60), quantity: z.number().positive().max(100_000).nullable(), unit: z.string().max(20).nullable(), useBy: isoDate.nullable() }))
    .min(1)
    .max(5),
  today: isoDate,
});

const dayMs = 86_400_000;
/** The device's "today", trusted only within a day of the server's (time zones). */
function plausibleToday(today: string): boolean {
  const t = Date.parse(`${today}T12:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - Date.now()) <= 1.6 * dayMs;
}

function toKitchenLine(item: { name: string; quantity: number | null; unit: string | null; useBy: string | null }, today: string): UseUpIngredient | null {
  const u = assessUrgency(item.useBy, today);
  if (!u.usable) return null;
  const due =
    u.daysLeft === null ? null : u.daysLeft === 0 ? "today" : u.daysLeft === 1 ? "tomorrow" : `by ${new Date(`${item.useBy}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return { name: item.name, amount: item.quantity !== null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : null, due };
}

export async function draftUseUpForHousehold(raw: unknown, source: { db: SupabaseLike; householdKey: string } | { preview: { household: DraftHousehold } }): Promise<Result<DraftResult>> {
  const config = readAiConfig();
  const limit = config?.dailyDraftLimit ?? 5;
  if (!config || limit <= 0) return { ok: false, message: "AI recipe ideas aren't switched on (no Anthropic API key on the server)." };

  let kitchen: UseUpIngredient[];
  let household: DraftHousehold;
  const db = "db" in source ? source.db : null;
  if (db) {
    const parsed = useUpRequestSchema.safeParse(raw);
    if (!parsed.success || !plausibleToday(parsed.data.today)) return { ok: false, message: "Pick up to five ingredients." };
    const { data, error } = await db.from("pantry_items").select(PANTRY_COLUMNS).in("id", parsed.data.itemIds);
    if (error) return { ok: false, message: "Couldn't read your kitchen. Please try again." };
    const items = ((data ?? []) as PantryRow[]).map(pantryRowToItem).filter((p) => !p.isStaple);
    kitchen = items.map((p) => toKitchenLine(p, parsed.data.today)).filter((x): x is UseUpIngredient => x !== null);
    const profile = await createSupabaseProfileStore(db).load();
    if (!profile.ok || !profile.data) return { ok: false, message: "Finish setting up your household first." };
    const p = householdProfile(profile.data);
    household = { allergies: p.diet.allergies, dietStyle: p.diet.style, restrictions: p.diet.restrictions, avoid: p.diet.neverRecommend, equipment: p.equipment, skillLevel: p.skillLevel, servings: p.household.cookingFor };
  } else {
    if (!previewAiAllowed()) return { ok: false, message: "AI recipe ideas need accounts on this server." };
    const parsed = previewUseUpSchema.safeParse(raw);
    if (!parsed.success || !plausibleToday(parsed.data.today)) return { ok: false, message: "Pick up to five ingredients." };
    kitchen = parsed.data.items.map((i) => toKitchenLine(i, parsed.data.today)).filter((x): x is UseUpIngredient => x !== null);
    household = (source as { preview: { household: DraftHousehold } }).preview.household;
  }
  if (kitchen.length === 0) return { ok: false, message: "None of those can be used — anything past its date is left out." };

  let slot: string | null = null;
  let giveBack: (() => void) | null = null;
  if (db) slot = await reserveAiRequest(db, FEATURE, limit);
  else giveBack = preview.reserve(limit);
  if (!slot && !giveBack) return { ok: false, message: `You've used today's ${limit} AI recipe drafts. Try again tomorrow.` };

  try {
    const householdKey = "db" in source ? source.householdKey : "preview";
    const d = await draftRecipe({ config, draft: { kind: "use_up", ingredients: kitchen }, household, householdKey });
    if (slot && db) await finishAiRequest(db, slot, "ok", d.model, d.usage);
    let saved: Recipe = { ...d.recipe, source: { ...d.recipe.source, name: "AI draft" } };
    if (db) {
      const { data: id, error } = await db.rpc("save_household_recipe", { recipe: toImportPayload(d.recipe) });
      if (error) return { ok: false, message: "We made the recipe but couldn't save it. Please try again." };
      const { data: row } = await db.from("recipes").select(RECIPE_SELECT).eq("id", String(id)).maybeSingle();
      if (row) saved = recipeRowToRecipe(row as RecipeRow);
    }
    return { ok: true, data: { recipe: saved, changes: d.changes, cached: false, remaining: db ? null : preview.remaining(limit) } };
  } catch (error) {
    if (slot && db) await finishAiRequest(db, slot, "fallback", config.model, null);
    if (error instanceof AiRequestError) {
      console.error("[draft] use-up not used", { kind: error.kind });
      return {
        ok: false,
        message:
          error.kind === "invalid"
            ? "The AI's recipe didn't pass our safety checks, so it wasn't saved. Try again or pick different ingredients."
            : error.kind === "rate_limited" || error.kind === "overloaded"
              ? "The AI is busy right now. Try again in a minute."
              : "We couldn't make a recipe just now.",
      };
    }
    throw error;
  }
}
