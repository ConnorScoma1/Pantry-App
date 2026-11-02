import { cuisines, worldCuisines, type IsoDate, type Recipe, type RecipeRating, type RecommendationEvent } from "@kitchen-pantry/shared-types";

/**
 * Cooking history (spec 01 Phase 6): what the household cooked, when, and
 * what they thought of it — built from the "cooked" log and their ratings.
 * Everything is counted from real records; nothing is estimated.
 *
 *  - One cook = "cooked" log entries for the same recipe within 6 hours
 *    (finishing cooking mode and then rating both log "cooked").
 *  - A rating within 12 hours of a cook belongs to it; a rating with no
 *    cook nearby is a cook of its own (it was rated, so it was made).
 */
export interface CookEntry {
  recipeId: string;
  /** Null when the recipe is no longer available to the household. */
  recipe: Recipe | null;
  cookedAt: string;
  rating: RecipeRating | null;
}

export interface CookingHistory {
  entries: CookEntry[];
  stats: {
    /** Cooks in the last 30 days. */
    last30: number;
    /** Different recipes cooked in the last 30 days. */
    different30: number;
    /** Average overall rating across rated cooks (null when none). */
    averageRating: number | null;
    ratedCount: number;
    topCuisines: Array<{ code: string; label: string; count: number }>;
    mostCooked: Array<{ recipe: Recipe; count: number }>;
  };
  /** Loved (4★+ or "would cook again") but not made for three weeks or more. */
  comeBack: Array<{ recipe: Recipe; daysAgo: number; rating: number | null }>;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function dayStart(iso: IsoDate): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function cookingHistory(input: { cooked: readonly RecommendationEvent[]; ratings: readonly RecipeRating[]; recipes: readonly Recipe[]; today: IsoDate }): CookingHistory {
  const byId = new Map(input.recipes.map((r) => [r.id, r]));
  const cooks: Array<{ recipeId: string; at: number }> = [];

  // Collapse "cooked" entries close together for the same recipe.
  const events = input.cooked.filter((e) => e.event === "cooked" && Number.isFinite(Date.parse(e.createdAt))).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const e of events) {
    const at = Date.parse(e.createdAt);
    const last = [...cooks].reverse().find((c) => c.recipeId === e.recipeId);
    if (last && at - last.at <= 6 * HOUR) continue;
    cooks.push({ recipeId: e.recipeId, at });
  }

  // Attach ratings; a rating with no nearby cook counts as one.
  const rated = new Map<number, RecipeRating>();
  const ratings = input.ratings.filter((r) => Number.isFinite(Date.parse(r.createdAt))).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const r of ratings) {
    const at = Date.parse(r.createdAt);
    let best = -1;
    for (let i = 0; i < cooks.length; i++) {
      const c = cooks[i]!;
      if (c.recipeId !== r.recipeId || Math.abs(at - c.at) > 12 * HOUR || rated.has(i)) continue;
      if (best === -1 || Math.abs(at - c.at) < Math.abs(at - cooks[best]!.at)) best = i;
    }
    if (best === -1) {
      cooks.push({ recipeId: r.recipeId, at });
      rated.set(cooks.length - 1, r);
    } else rated.set(best, r);
  }

  const entries: CookEntry[] = cooks
    .map((c, i) => ({ recipeId: c.recipeId, recipe: byId.get(c.recipeId) ?? null, cookedAt: new Date(c.at).toISOString(), rating: rated.get(i) ?? null }))
    .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt));

  const endOfToday = dayStart(input.today) + DAY;
  const recent = entries.filter((e) => Date.parse(e.cookedAt) >= endOfToday - 30 * DAY);
  const withRating = entries.filter((e) => e.rating);
  const cuisineCounts = new Map<string, number>();
  for (const e of entries) if (e.recipe?.cuisine) cuisineCounts.set(e.recipe.cuisine, (cuisineCounts.get(e.recipe.cuisine) ?? 0) + 1);
  const recipeCounts = new Map<string, number>();
  for (const e of entries) if (e.recipe) recipeCounts.set(e.recipeId, (recipeCounts.get(e.recipeId) ?? 0) + 1);

  // Latest rating and latest cook per recipe, for "come back to".
  const lastCook = new Map<string, number>();
  for (const e of entries) if (!lastCook.has(e.recipeId)) lastCook.set(e.recipeId, Date.parse(e.cookedAt));
  const latestRating = new Map<string, RecipeRating>();
  for (const r of [...ratings].reverse()) if (!latestRating.has(r.recipeId)) latestRating.set(r.recipeId, r);
  const comeBack = [...latestRating.values()]
    .filter((r) => (r.overall >= 4 || r.wouldCookAgain === true) && r.wouldCookAgain !== false && byId.has(r.recipeId))
    .map((r) => ({ recipe: byId.get(r.recipeId)!, daysAgo: Math.floor((endOfToday - 1 - (lastCook.get(r.recipeId) ?? Date.parse(r.createdAt))) / DAY), rating: r.overall }))
    .filter((x) => x.daysAgo >= 21)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.daysAgo - a.daysAgo)
    .slice(0, 6);

  return {
    entries,
    stats: {
      last30: recent.length,
      different30: new Set(recent.map((e) => e.recipeId)).size,
      averageRating: withRating.length ? Math.round((withRating.reduce((s, e) => s + e.rating!.overall, 0) / withRating.length) * 10) / 10 : null,
      ratedCount: withRating.length,
      // Only cuisines cooked at least twice — one meal isn't a pattern.
      topCuisines: [...cuisineCounts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([code, count]) => ({ code, label: worldCuisines.find((c) => c.code === code)?.label ?? cuisines.find((c) => c.code === code)?.label ?? code, count })),
      mostCooked: [...recipeCounts.entries()]
        .filter(([, n]) => n > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({ recipe: byId.get(id)!, count })),
    },
    comeBack,
  };
}

/** "November 2026" style group label for an entry's date (in the viewer's time zone). */
export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
