import { planWeek, saleMatches, type PlannedPick, type PlanWeekInput, type PlanWeekResult } from "@kitchen-pantry/meal-planner";
import { recipeProteins, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { planningModes, skillLevels, type PlanSource } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { AiRequestError, type FetchLike } from "./claude";
import { callModelJson } from "./providers";
import type { AiConfig } from "./core";

/**
 * Claude-assisted weekly planning.
 *
 * Claude never sees or decides anything unsafe: it receives only recipes
 * that already passed the household's hard filters (allergies, diet,
 * equipment, skill, "Not for us"), and the response schema only allows
 * those recipe ids and the open dates. Its picks are validated again here,
 * and any gap is filled by the deterministic planner. If anything goes
 * wrong we return the deterministic plan and say so — the household always
 * gets a usable week.
 */

/** Cost control: Claude sees at most this many candidates (best first). */
export const MAX_AI_CANDIDATES = 30;

export interface AiPlanResult extends PlanWeekResult {
  source: PlanSource;
  /** Present when we fell back to the deterministic planner, in plain words. */
  notice: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  model: string | null;
  cached: boolean;
}

const MODE_GUIDE: Record<string, string> = {
  balanced: "Balance quality, variety, nutrition and how much needs buying.",
  budget_first:
    "Keep the shopping small: prefer recipes with few items to buy and recipes that share perishable purchases. Do not mention prices — none are available.",
  chefs_choice:
    "Prioritise outstanding, interesting dishes the household will love. Match the cook's skill: for experienced cooks (skill 4–5) most nights should be at least skill 3 — they want a challenge — while still keeping weeknights manageable. Flavour first.",
  use_what_i_have: "Use as much of what's already in the kitchen as possible, especially items close to their use-by date.",
  cook_the_specials:
    "Build the week around ingredients on sale at the household's store (each candidate's onSale list comes from the store's own prices). Prefer dishes where a sale item is central, and spread different sale items across the week. Never pick a weak dish just because something is on sale. You may say an ingredient is on sale; never quote prices or savings.",
};

const SYSTEM = `You are the meal-planning assistant inside Kitchen Pantry, a home-cooking app.
You choose dinners for the household's open nights from a list of candidate recipes.

Rules — follow all of them:
- Choose ONLY recipe ids from the candidate list, and ONLY the dates listed as open. Exactly one dinner per open date.
- Never choose the same recipe twice in a week, and never one of the meals already planned.
- Every candidate is already safe for the household's allergies, diet, equipment and skill. Do not invent recipes, ingredients, prices, costs, calories or health claims.
- Variety: never put the same main protein (the "proteins" list) on two nights in a row, and avoid the same cuisine on consecutive nights.
- Weeknights (Mon–Thu) should be quicker; save long or ambitious dishes for Fri–Sun.
- Prefer combinations that share perishable ingredients the household must buy (so nothing is half-used and wasted), and use up items close to their date.
- Respect the planning mode. Flavour and the household's satisfaction always matter; never pick a dish only because it is cheap.
- Only say a dinner uses up or uses something the household already has if that item is in its "alreadyHave" or "usesUpSoon" list. Those lists can be empty — then don't mention leftovers or the kitchen at all.
- "why": one specific, friendly sentence (at most 15 words) about why this dinner fits that night. No prices.
- "summary": at most 45 words describing the week's shape (variety, what it uses up, shared ingredients). No prices.`;

function compactCandidate(r: RankedRecipe, specials: PlanWeekInput["specials"] = []) {
  const mine = r.rating;
  return {
    id: r.recipe.id,
    title: r.recipe.title,
    cuisine: r.recipe.cuisine,
    minutes: r.recipe.totalMinutes,
    skill: r.recipe.skillLevel,
    proteins: recipeProteins(r.recipe),
    tags: r.recipe.tags,
    alreadyHave: r.coverage.owned.map((i) => i.item).slice(0, 10),
    toBuy: r.coverage.missing.map((i) => i.item).slice(0, 12),
    usesUpSoon: r.coverage.usesSoon.map((p) => p.name),
    favourite: r.favorite,
    communityRating: mine && mine.count > 0 ? { average: mine.average, count: mine.count } : null,
    notes: [...r.reasons.slice(0, 2), ...r.cautions.slice(0, 2)],
    plannerScore: Math.round(r.score),
    ...(specials && specials.length > 0 ? { onSale: saleMatches(r, specials).map((m) => ({ ingredient: m.item, percentOff: m.special.percentOff })) } : {}),
  };
}

export function buildMealPlanPrompt(input: PlanWeekInput & { skillLevel: number; householdSize: number }): {
  user: string;
  schema: Record<string, unknown>;
  candidates: RankedRecipe[];
} {
  const fixedIds = new Set((input.fixed ?? []).map((f) => f.recipeId).filter(Boolean));
  const eligible = input.candidates.filter((c) => c.allowed && !c.dismissed && !c.aboveSkill && !fixedIds.has(c.recipe.id));
  // Chef's Choice for experienced cooks (skill 4–5): offer the challenging dishes first — the model
  // tended to pick easy ones even when told not to (quality test, 2026-11-02). Only when there are plenty.
  const stretch = eligible.filter((c) => c.recipe.skillLevel >= 3);
  const pool = input.mode === "chefs_choice" && input.skillLevel >= 4 && stretch.length >= input.days.length * 2 ? stretch : eligible;
  const candidates = pool.slice(0, MAX_AI_CANDIDATES);
  const byId = new Map(input.candidates.map((c) => [c.recipe.id, c]));
  const mode = planningModes.find((m) => m.code === input.mode);
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

  const user = JSON.stringify(
    {
      planningMode: { name: mode?.label ?? input.mode, guidance: MODE_GUIDE[input.mode] },
      household: {
        cookingFor: input.householdSize,
        skill: `${input.skillLevel}/5 (${skillLevels.find((s) => s.level === input.skillLevel)?.label ?? "home cook"})`,
        goals: input.goals,
      },
      openDates: input.days.map((d) => ({ date: d, day: weekday(d) })),
      alreadyPlanned: (input.fixed ?? [])
        .filter((f) => f.recipeId)
        .map((f) => ({ date: f.date, day: weekday(f.date), title: byId.get(f.recipeId!)?.recipe.title ?? "A planned meal" })),
      avoidIfPossible: [...(input.avoid ?? [])].filter((id) => candidates.some((c) => c.recipe.id === id)),
      candidates: candidates.map((c) => compactCandidate(c, input.mode === "cook_the_specials" ? input.specials : [])),
    },
    // Compact JSON: indentation is pure token cost.
  );

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["meals", "summary"],
    properties: {
      meals: {
        type: "array",
        description: "One dinner per open date.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "recipeId", "why"],
          properties: {
            date: { type: "string", enum: input.days },
            recipeId: { type: "string", enum: candidates.map((c) => c.recipe.id) },
            why: { type: "string", description: "At most 15 words. No prices." },
          },
        },
      },
      summary: { type: "string", description: "At most 45 words. No prices." },
    },
  };
  return { user, schema, candidates };
}

/**
 * Re-order the AI's dinners so the same main protein doesn't land on two
 * nights in a row (the model doesn't always manage it), without moving long
 * dishes onto weeknights and with as few moves as possible. Only open nights
 * are shuffled; locked and planned meals stay put. A moved dinner's "why"
 * may name its old night, so it gets a neutral note.
 */
export function spreadProteins(picks: PlannedPick[], recipes: ReadonlyMap<string, RankedRecipe>, fixed: ReadonlyArray<{ date: string; recipeId: string | null }> = []): PlannedPick[] {
  if (picks.length < 3 || picks.length > 8) return picks;
  const dates = picks.map((p) => p.date).sort();
  const byDate = new Map(picks.map((p) => [p.date, p]));
  const original = dates.map((d) => byDate.get(d)!);
  const main = (id: string | null | undefined) => (id ? (recipeProteins(recipes.get(id)?.recipe ?? ({ ingredients: [] } as never))[0] ?? null) : null);
  const minutes = (id: string) => recipes.get(id)?.recipe.totalMinutes ?? 0;
  const weeknight = (d: string) => [1, 2, 3, 4].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const fixedOn = new Map(fixed.filter((f) => f.recipeId).map((f) => [f.date, f.recipeId!]));
  const cost = (order: PlannedPick[]) => {
    const at = new Map(order.map((p, i) => [dates[i]!, p.recipeId]));
    for (const [d, id] of fixedOn) if (!at.has(d)) at.set(d, id);
    const all = [...at.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let c = 0;
    for (let i = 1; i < all.length; i++) {
      const consecutive = Date.parse(`${all[i]![0]}T00:00:00Z`) - Date.parse(`${all[i - 1]![0]}T00:00:00Z`) === 86_400_000;
      const p = main(all[i]![1]);
      if (consecutive && p && p === main(all[i - 1]![1])) c += 100;
    }
    order.forEach((p, i) => {
      if (weeknight(dates[i]!) && minutes(p.recipeId) > 45 && !(weeknight(original[i]!.date) && original[i]!.recipeId === p.recipeId)) c += 50;
      if (p !== original[i]) c += 1;
    });
    return c;
  };
  let best = original;
  let bestCost = cost(original);
  if (bestCost < 100) return original;
  const permute = (rest: PlannedPick[], acc: PlannedPick[]) => {
    if (rest.length === 0) {
      const c = cost(acc);
      if (c < bestCost) [best, bestCost] = [acc, c];
      return;
    }
    for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]!]);
  };
  permute(original, []);
  return best.map((p, i) => (p === original[i] ? p : { ...p, date: dates[i]!, note: "Chosen to fit your week" }));
}

/** Claims about what's already in the household's kitchen. */
const KITCHEN_TALK = /\b(uses? up|using up|leftovers?|remaining|already have|you have on hand|in your (fridge|kitchen|pantry))\b/i;

const PRICE_TALK = /[$€£]\s?\d|\b\d+(\.\d+)?\s?(dollars?|cents?|usd)\b|\bcheap(est)?\b/i;

/** Validate Claude's answer against what we actually offered. */
export function validateAiPicks(
  raw: unknown,
  allowedIds: ReadonlySet<string>,
  days: readonly string[],
  fixedIds: ReadonlySet<string>,
  servings: number,
  /** Recipes that use something already in the kitchen; claims about leftovers for others are dropped. */
  usesKitchen?: ReadonlySet<string>,
): { picks: PlannedPick[]; summary: string | null; rejected: number } {
  const shape = z.object({
    meals: z.array(z.object({ date: z.string(), recipeId: z.string(), why: z.string() })).max(14),
    summary: z.string(),
  });
  const parsed = shape.safeParse(raw);
  if (!parsed.success) throw new AiRequestError("invalid", "The AI's plan didn't match the expected format.");

  const open = new Set(days);
  const usedDates = new Set<string>();
  const usedIds = new Set<string>(fixedIds);
  const picks: PlannedPick[] = [];
  let rejected = 0;
  for (const m of parsed.data.meals) {
    if (!open.has(m.date) || usedDates.has(m.date) || !allowedIds.has(m.recipeId) || usedIds.has(m.recipeId)) {
      rejected++;
      continue;
    }
    usedDates.add(m.date);
    usedIds.add(m.recipeId);
    const why = m.why.replace(/\s+/g, " ").trim().slice(0, 160);
    const invented = usesKitchen && !usesKitchen.has(m.recipeId) && KITCHEN_TALK.test(why);
    picks.push({
      date: m.date,
      recipeId: m.recipeId,
      servings,
      note: why && !PRICE_TALK.test(why) && !invented ? why : "Chosen to fit your week",
    });
  }
  const summary = parsed.data.summary.replace(/\s+/g, " ").trim().slice(0, 400);
  // A summary that talks about using up the kitchen when nothing chosen uses it isn't true.
  const kitchenClaim = usesKitchen && KITCHEN_TALK.test(summary) && !picks.some((p) => usesKitchen.has(p.recipeId));
  return { picks, summary: summary && !PRICE_TALK.test(summary) && !kitchenClaim ? summary : null, rejected };
}

// ---------------------------------------------------------------------------
// Caching. The AI's validated answer (which recipe on which date, a reason
// each, a summary) is kept under a SHA-256 of the request — model, seed and
// the whole prompt (candidates, open dates, mode, skill) — so the same
// request is answered without paying again: in this process for 30 minutes
// (double clicks, retries), and in the household's saved answers when a
// store is passed (web, phone and the weekly job share them). A saved answer
// is re-validated against today's candidates exactly like a fresh one.
// Regenerate changes the seed/avoid list, so it naturally misses.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;
/** Bump when the prompt or the answer's meaning changes, so old answers stop matching. */
const CACHE_VERSION = "plan-v1";
/** How long saved answers are kept (hours). */
export const SAVED_PLAN_TTL_HOURS = 48;
const cache = new Map<string, { at: number; answer: SavedAiAnswer; model: string }>();

/** What's cached: the AI's answer after validation, nothing else. */
export interface SavedAiAnswer {
  meals: Array<{ date: string; recipeId: string; why: string }>;
  summary: string;
}

/**
 * Where a household's AI answers are saved between requests (Supabase in
 * the app). Both calls must never throw for an ordinary miss or failure — a
 * broken cache only costs a fresh AI call.
 */
export interface AiPlanStore {
  get(key: string): Promise<unknown>;
  set(key: string, answer: SavedAiAnswer, ttlHours: number): Promise<void>;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function clearAiPlanCache(): void {
  cache.clear();
}

export interface PlanWeekWithAiOptions {
  config: AiConfig | null;
  input: PlanWeekInput;
  skillLevel: number;
  householdSize: number;
  fetchImpl?: FetchLike;
  /** Scope for the in-process cache key (household id) so households never share answers. */
  cacheScope: string;
  /** The household's saved answers (optional). */
  store?: AiPlanStore | null;
}

interface Prepared {
  prompt: ReturnType<typeof buildMealPlanPrompt>;
  key: string;
  memoryKey: string;
}

async function prepare(options: PlanWeekWithAiOptions): Promise<Prepared | null> {
  const { input, config } = options;
  if (!config || input.days.length === 0) return null;
  const prompt = buildMealPlanPrompt({ ...input, skillLevel: options.skillLevel, householdSize: options.householdSize });
  if (prompt.candidates.length === 0) return null;
  const key = await sha256Hex(`${CACHE_VERSION}|${config.provider ?? "anthropic"}|${config.model}|${input.seed ?? 0}|${prompt.user}`);
  return { prompt, key, memoryKey: `${options.cacheScope}|${key}` };
}

/** Turn a (fresh or saved) answer into the week: validate, spread proteins, fill gaps. Throws if it can't be used. */
function weekFromAnswer(raw: unknown, prepared: Prepared, input: PlanWeekInput): { result: Omit<AiPlanResult, "usage" | "model" | "cached">; answer: SavedAiAnswer } {
  const { prompt } = prepared;
  const fixedIds = new Set((input.fixed ?? []).map((f) => f.recipeId).filter((id): id is string => Boolean(id)));
  const allowed = new Set(prompt.candidates.map((c) => c.recipe.id));
  const usesKitchen = new Set(prompt.candidates.filter((c) => c.coverage.owned.length > 0 || c.coverage.usesSoon.length > 0).map((c) => c.recipe.id));
  const valid = validateAiPicks(raw, allowed, input.days, fixedIds, input.servings, usesKitchen);
  if (valid.picks.length === 0) throw new AiRequestError("invalid", "The AI's plan had no usable dinners.");
  const picks = spreadProteins(valid.picks, new Map(prompt.candidates.map((c) => [c.recipe.id, c])), input.fixed ?? []);

  // Fill any nights the AI skipped with the deterministic planner, around its picks.
  const remaining = input.days.filter((d) => !picks.some((p) => p.date === d));
  const filler = remaining.length
    ? planWeek({ ...input, days: remaining, fixed: [...(input.fixed ?? []), ...picks.map((p) => ({ date: p.date, recipeId: p.recipeId }))] })
    : { picks: [], unfilled: [] as string[], summary: "" };
  return {
    result: {
      picks: [...picks, ...filler.picks].sort((a, b) => a.date.localeCompare(b.date)),
      unfilled: filler.unfilled,
      summary: valid.summary ?? planWeek(input).summary,
      source: "ai",
      notice: null,
    },
    // Store what passed validation (before re-ordering), so a saved answer goes through the same steps again.
    answer: { meals: valid.picks.map((p) => ({ date: p.date, recipeId: p.recipeId, why: p.note.slice(0, 200) })), summary: (valid.summary ?? "").slice(0, 600) },
  };
}

async function fromCache(prepared: Prepared, options: PlanWeekWithAiOptions): Promise<AiPlanResult | null> {
  const model = options.config!.model;
  const hit = cache.get(prepared.memoryKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    try {
      return { ...weekFromAnswer(hit.answer, prepared, options.input).result, usage: null, model: hit.model, cached: true };
    } catch {
      cache.delete(prepared.memoryKey);
    }
  }
  if (!options.store) return null;
  let saved: unknown = null;
  try {
    saved = await options.store.get(prepared.key);
  } catch {
    return null;
  }
  if (!saved) return null;
  try {
    const { result, answer } = weekFromAnswer(saved, prepared, options.input);
    remember(prepared.memoryKey, answer, model);
    return { ...result, usage: null, model, cached: true };
  } catch {
    return null; // changed since it was saved — ask again
  }
}

function remember(memoryKey: string, answer: SavedAiAnswer, model: string): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(memoryKey, { at: Date.now(), answer, model });
}

/**
 * A cached answer for exactly this request, or null — without calling the AI
 * or counting against any limit. Lets the app skip reserving a request.
 */
export async function findCachedAiPlan(options: PlanWeekWithAiOptions): Promise<AiPlanResult | null> {
  const prepared = await prepare(options);
  return prepared ? fromCache(prepared, options) : null;
}

export async function planWeekWithClaude(options: PlanWeekWithAiOptions): Promise<AiPlanResult> {
  const { input } = options;
  const fallback = (notice: string | null, usage: AiPlanResult["usage"] = null, model: string | null = null): AiPlanResult => ({
    ...planWeek(input),
    source: "rules",
    notice,
    usage,
    model,
    cached: false,
  });

  if (!options.config) return fallback(null);
  if (input.days.length === 0) return { ...planWeek(input), source: "rules", notice: null, usage: null, model: null, cached: false };

  const prepared = await prepare(options);
  if (!prepared) return fallback(null);
  const cached = await fromCache(prepared, options);
  if (cached) return cached;

  try {
    // 30 s: past that the household is better served by the standard plan straight away.
    const res = await callModelJson({ config: options.config, system: SYSTEM, user: prepared.prompt.user, schema: prepared.prompt.schema, fetchImpl: options.fetchImpl, timeoutMs: 30_000 });
    let built: ReturnType<typeof weekFromAnswer>;
    try {
      built = weekFromAnswer(res.json, prepared, input);
    } catch {
      // Paid for, but unusable: keep the usage so the cost is still logged.
      return fallback("The AI's plan couldn't be used, so here's our standard plan.", res.usage, res.model);
    }
    remember(prepared.memoryKey, built.answer, res.model);
    if (options.store) {
      try {
        await options.store.set(prepared.key, built.answer, SAVED_PLAN_TTL_HOURS);
      } catch {
        // Saving is best-effort.
      }
    }
    return { ...built.result, usage: res.usage, model: res.model, cached: false };
  } catch (err) {
    const kind = err instanceof AiRequestError ? err.kind : "invalid";
    const notice =
      kind === "rate_limited" || kind === "overloaded"
        ? "The AI assistant is busy right now, so here's our standard plan. Try again in a minute."
        : kind === "timeout" || kind === "network"
          ? "Couldn't reach the AI assistant, so here's our standard plan."
          : "The AI's plan couldn't be used, so here's our standard plan.";
    return fallback(notice);
  }
}
