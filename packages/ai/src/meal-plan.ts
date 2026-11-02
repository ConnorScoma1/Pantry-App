import { planWeek, saleMatches, type PlannedPick, type PlanWeekInput, type PlanWeekResult } from "@kitchen-pantry/meal-planner";
import { formatMinutes, recipeProteins, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { planningModes, skillLevels, type PlanSource } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { callClaudeJson, AiRequestError, type FetchLike } from "./claude";
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
  chefs_choice: "Prioritise outstanding, interesting dishes the household will love, at or near their skill level. Flavour first.",
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
- Prefer variety: avoid the same main protein or cuisine on consecutive nights.
- Weeknights (Mon–Thu) should be quicker; save long or ambitious dishes for Fri–Sun.
- Prefer combinations that share perishable ingredients the household must buy (so nothing is half-used and wasted), and use up items close to their date.
- Respect the planning mode. Flavour and the household's satisfaction always matter; never pick a dish only because it is cheap.
- "why": one specific, friendly sentence (at most 15 words) about why this dinner fits that night. No prices.
- "summary": at most 45 words describing the week's shape (variety, what it uses up, shared ingredients). No prices.`;

function compactCandidate(r: RankedRecipe, specials: PlanWeekInput["specials"] = []) {
  const mine = r.rating;
  return {
    id: r.recipe.id,
    title: r.recipe.title,
    cuisine: r.recipe.cuisine,
    time: formatMinutes(r.recipe.totalMinutes),
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
  const candidates = input.candidates
    .filter((c) => c.allowed && !c.dismissed && !c.aboveSkill && !fixedIds.has(c.recipe.id))
    .slice(0, MAX_AI_CANDIDATES);
  const byId = new Map(input.candidates.map((c) => [c.recipe.id, c]));
  const mode = planningModes.find((m) => m.code === input.mode);
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

  const user = JSON.stringify(
    {
      planningMode: { name: mode?.label ?? input.mode, guidance: MODE_GUIDE[input.mode] },
      household: {
        cookingFor: input.householdSize,
        skill: skillLevels.find((s) => s.level === input.skillLevel)?.label ?? `Level ${input.skillLevel}`,
        goals: input.goals,
      },
      openDates: input.days.map((d) => ({ date: d, day: weekday(d) })),
      alreadyPlanned: (input.fixed ?? [])
        .filter((f) => f.recipeId)
        .map((f) => ({ date: f.date, day: weekday(f.date), title: byId.get(f.recipeId!)?.recipe.title ?? "A planned meal" })),
      avoidIfPossible: [...(input.avoid ?? [])].filter((id) => candidates.some((c) => c.recipe.id === id)),
      candidates: candidates.map((c) => compactCandidate(c, input.mode === "cook_the_specials" ? input.specials : [])),
    },
    null,
    1,
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

const PRICE_TALK = /[$€£]\s?\d|\b\d+(\.\d+)?\s?(dollars?|cents?|usd)\b|\bcheap(est)?\b/i;

/** Validate Claude's answer against what we actually offered. */
export function validateAiPicks(
  raw: unknown,
  allowedIds: ReadonlySet<string>,
  days: readonly string[],
  fixedIds: ReadonlySet<string>,
  servings: number,
): { picks: PlannedPick[]; summary: string | null; rejected: number } {
  const shape = z.object({
    meals: z.array(z.object({ date: z.string(), recipeId: z.string(), why: z.string() })).max(14),
    summary: z.string(),
  });
  const parsed = shape.safeParse(raw);
  if (!parsed.success) throw new AiRequestError("invalid", "Claude's plan didn't match the expected format.");

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
    picks.push({
      date: m.date,
      recipeId: m.recipeId,
      servings,
      note: why && !PRICE_TALK.test(why) ? why : "Chosen to fit your week",
    });
  }
  const summary = parsed.data.summary.replace(/\s+/g, " ").trim().slice(0, 400);
  return { picks, summary: summary && !PRICE_TALK.test(summary) ? summary : null, rejected };
}

// ---------------------------------------------------------------------------
// Small in-process cache: identical requests (double clicks, retries) reuse
// the answer instead of paying for another call. Regenerate changes the
// seed/avoid list, so it naturally misses.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: AiPlanResult }>();

function hashKey(text: string): string {
  // FNV-1a — a cache key, not a security boundary.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

export function clearAiPlanCache(): void {
  cache.clear();
}

export async function planWeekWithClaude(options: {
  config: AiConfig | null;
  input: PlanWeekInput;
  skillLevel: number;
  householdSize: number;
  fetchImpl?: FetchLike;
  /** Scope for the cache key (household id) so households never share answers. */
  cacheScope: string;
}): Promise<AiPlanResult> {
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

  const prompt = buildMealPlanPrompt({ ...input, skillLevel: options.skillLevel, householdSize: options.householdSize });
  if (prompt.candidates.length === 0) return fallback(null);

  const key = hashKey(`${options.cacheScope}|${options.config.model}|${input.seed ?? 0}|${prompt.user}`);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

  try {
    const res = await callClaudeJson({ config: options.config, system: SYSTEM, user: prompt.user, schema: prompt.schema, fetchImpl: options.fetchImpl });
    const fixedIds = new Set((input.fixed ?? []).map((f) => f.recipeId).filter((id): id is string => Boolean(id)));
    const allowed = new Set(prompt.candidates.map((c) => c.recipe.id));
    const { picks, summary } = validateAiPicks(res.json, allowed, input.days, fixedIds, input.servings);
    if (picks.length === 0) return fallback("Claude's plan couldn't be used, so here's our standard plan.", res.usage, res.model);

    // Fill any nights Claude skipped with the deterministic planner, around Claude's picks.
    const remaining = input.days.filter((d) => !picks.some((p) => p.date === d));
    const filler = remaining.length
      ? planWeek({ ...input, days: remaining, fixed: [...(input.fixed ?? []), ...picks.map((p) => ({ date: p.date, recipeId: p.recipeId }))] })
      : { picks: [], unfilled: [] as string[], summary: "" };
    const value: AiPlanResult = {
      picks: [...picks, ...filler.picks].sort((a, b) => a.date.localeCompare(b.date)),
      unfilled: filler.unfilled,
      summary: summary ?? planWeek(input).summary,
      source: "ai",
      notice: null,
      usage: res.usage,
      model: res.model,
      cached: false,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    const kind = err instanceof AiRequestError ? err.kind : "invalid";
    const notice =
      kind === "rate_limited" || kind === "overloaded"
        ? "Claude is busy right now, so here's our standard plan. Try again in a minute."
        : kind === "timeout" || kind === "network"
          ? "Couldn't reach Claude, so here's our standard plan."
          : "Claude's plan couldn't be used, so here's our standard plan.";
    return fallback(notice);
  }
}
