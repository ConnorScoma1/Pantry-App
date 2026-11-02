import type { IsoDate, Recipe, RecipeRating, RecommendationEvent, VarietyMode } from "@kitchen-pantry/shared-types";
import type { RankedRecipe } from "../recipes";
import { facetsOf, libraryOf } from "./facets";

/**
 * The variety engine (spec 08 §5): so a household doesn't see the same
 * meals every week. Works on the household's own history — what it cooked,
 * opened, kept seeing without opening, and rated — and adjusts ranking:
 *   - the same dish (any version) isn't suggested again within three weeks
 *     unless they ask for favourites;
 *   - cuisines, main proteins and cooking methods rotate;
 *   - "Something new" favours cuisines and dishes they've never cooked,
 *     "Familiar favourites" favours what they rated well;
 *   - recipes shown again and again without being opened slowly sink;
 *   - recipes that share fresh ingredients with what they cooked recently
 *     get a small nudge (fewer half-used bunches of herbs).
 * Allergies and "Not for us" are hard filters upstream; nothing here can
 * bring a recipe back that those removed.
 */
export interface VarietyHistory {
  /** Most recent day each recipe was cooked. */
  cooked: Map<string, IsoDate>;
  /** How many times each recipe was shown, and whether it was opened since. */
  shownNotOpened: Map<string, number>;
  opened: Set<string>;
  /** Dish keys, cuisines, proteins and methods of the last few meals cooked, newest first. */
  recentDishes: string[];
  recentCuisines: string[];
  recentProteins: string[];
  recentMethods: string[];
  /** Core ingredients bought for recent meals (reuse them). */
  recentIngredients: Set<string>;
  /** Every cuisine the household has cooked or opened. */
  knownCuisines: Set<string>;
  /** Their own ratings (4+ = a favourite). */
  loved: Set<string>;
}

const daysBetween = (a: IsoDate, b: IsoDate) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function varietyHistory(
  recipes: readonly Recipe[],
  events: readonly RecommendationEvent[],
  ratings: ReadonlyMap<string, RecipeRating>,
  today: IsoDate,
  windowDays = 28,
): VarietyHistory {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const cooked = new Map<string, IsoDate>();
  const shown = new Map<string, number>();
  const opened = new Set<string>();
  const later = (id: string, day: IsoDate) => {
    const prev = cooked.get(id);
    if (!prev || prev < day) cooked.set(id, day);
  };
  for (const r of ratings.values()) later(r.recipeId, r.createdAt.slice(0, 10));
  // Events are newest first; walk oldest first so "opened" resets the shown count.
  for (const e of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (e.event === "cooked") later(e.recipeId, e.createdAt.slice(0, 10));
    if (e.event === "opened") {
      opened.add(e.recipeId);
      shown.delete(e.recipeId);
    }
    if (e.event === "shown" && daysBetween(e.createdAt.slice(0, 10), today) <= windowDays) shown.set(e.recipeId, (shown.get(e.recipeId) ?? 0) + 1);
  }
  const recent = [...cooked.entries()]
    .filter(([, day]) => daysBetween(day, today) <= windowDays)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => byId.get(id))
    .filter((r): r is Recipe => Boolean(r));
  const knownCuisines = new Set<string>();
  for (const id of [...cooked.keys(), ...opened]) {
    const c = byId.get(id)?.cuisine;
    if (c) knownCuisines.add(c);
  }
  return {
    cooked,
    shownNotOpened: shown,
    opened,
    recentDishes: recent.map((r) => libraryOf(r).dishKey),
    recentCuisines: recent.map((r) => r.cuisine ?? "").filter(Boolean),
    recentProteins: recent.flatMap((r) => facetsOf(r).proteins.slice(0, 1)),
    recentMethods: recent.flatMap((r) => libraryOf(r).methods.slice(0, 1)),
    recentIngredients: new Set(recent.slice(0, 5).flatMap((r) => facetsOf(r).core)),
    knownCuisines,
    loved: new Set([...ratings.values()].filter((r) => r.overall >= 4).map((r) => r.recipeId)),
  };
}

export interface VarietyAdjustment {
  points: number;
  reason: string | null;
}

/** Points to add to a recipe's score for variety, with a plain-English reason when it matters. */
export function varietyAdjustment(recipe: Recipe, h: VarietyHistory, mode: VarietyMode, today: IsoDate): VarietyAdjustment {
  const lib = libraryOf(recipe);
  const f = facetsOf(recipe);
  let points = 0;
  let reason: string | null = null;
  const lastCooked = h.cooked.get(recipe.id);
  const sameDishRecently = h.recentDishes.slice(0, 8).includes(lib.dishKey);
  const loved = h.loved.has(recipe.id);

  if (mode === "familiar") {
    if (loved) {
      points += 14;
      reason = "One of your favourites";
    } else if (lastCooked) points += 4;
    if (!h.knownCuisines.has(recipe.cuisine ?? "")) points -= 4;
  } else {
    if (lastCooked && daysBetween(lastCooked, today) < 21) points -= mode === "adventurous" ? 40 : 25;
    else if (sameDishRecently) points -= mode === "adventurous" ? 30 : 15;
    if (!lastCooked && !h.knownCuisines.has(recipe.cuisine ?? "") && h.knownCuisines.size > 0) {
      points += mode === "adventurous" ? 12 : 4;
      reason = "A cuisine you haven't tried here yet";
    } else if (!lastCooked && mode === "adventurous") {
      points += 5;
      reason ??= "Something you haven't cooked";
    }
    if (loved && mode === "balanced" && !(lastCooked && daysBetween(lastCooked, today) < 21)) points += 5;
  }

  // Rotate cuisine, protein and method against the last couple of meals.
  if (mode !== "familiar") {
    if (recipe.cuisine && h.recentCuisines.slice(0, 2).includes(recipe.cuisine)) points -= 5;
    const protein = f.proteins[0];
    if (protein && h.recentProteins.slice(0, 2).includes(protein)) points -= 4;
    const method = lib.methods[0];
    if (method && h.recentMethods.slice(0, 2).includes(method)) points -= 2;
  }

  // Shown again and again without being opened: let it rest.
  const ignored = h.shownNotOpened.get(recipe.id) ?? 0;
  if (ignored >= 3) points -= Math.min(10, (ignored - 2) * 2);

  // Uses up fresh ingredients bought recently.
  const reuse = f.core.filter((c) => h.recentIngredients.has(c)).length;
  if (reuse >= 2 && mode !== "familiar") {
    points += 3;
    reason ??= "Uses ingredients you bought recently";
  }
  return { points, reason };
}

/**
 * Re-order a ranked list so the top of it isn't five chicken dinners in a
 * row: a greedy pick that docks a candidate for sharing its dish, cuisine or
 * main protein with what's already been picked.
 */
export function diversify<T>(items: readonly T[], recipeOf: (item: T) => Recipe, scoreOf: (item: T) => number, window = 4): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length) {
    const recent = out.slice(-window).map(recipeOf);
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < Math.min(rest.length, 40); i++) {
      const r = recipeOf(rest[i]!);
      let s = scoreOf(rest[i]!);
      for (const p of recent) {
        if (libraryOf(p).dishKey === libraryOf(r).dishKey) s -= 50;
        if (p.cuisine && p.cuisine === r.cuisine) s -= 6;
        const a = facetsOf(p).proteins[0];
        if (a && a === facetsOf(r).proteins[0]) s -= 5;
      }
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    out.push(rest.splice(best, 1)[0]!);
  }
  return out;
}

/** Apply the variety engine to a ranked list (scores adjusted, reasons added, then diversified). */
export function applyVariety(ranked: readonly RankedRecipe[], h: VarietyHistory, mode: VarietyMode, today: IsoDate): RankedRecipe[] {
  const adjusted = ranked.map((r) => {
    const v = varietyAdjustment(r.recipe, h, mode, today);
    return v.points === 0 && !v.reason ? r : { ...r, score: r.score + v.points, reasons: v.reason && !r.reasons.includes(v.reason) ? [v.reason, ...r.reasons] : r.reasons };
  });
  adjusted.sort((a, b) => b.score - a.score);
  return diversify(adjusted, (r) => r.recipe, (r) => r.score);
}

/** Cuisines in the library the household hasn't cooked or opened yet, with how many recipes each has (spec 08 §5 "Try a New Cuisine"). */
export function newCuisines(recipes: readonly Recipe[], h: VarietyHistory): Array<{ cuisine: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of recipes) {
    if (!r.cuisine || h.knownCuisines.has(r.cuisine)) continue;
    const s = libraryOf(r).status;
    if (s === "idea" || s === "retired") continue;
    counts.set(r.cuisine, (counts.get(r.cuisine) ?? 0) + 1);
  }
  return [...counts.entries()].map(([cuisine, count]) => ({ cuisine, count })).sort((a, b) => b.count - a.count || a.cuisine.localeCompare(b.cuisine));
}
