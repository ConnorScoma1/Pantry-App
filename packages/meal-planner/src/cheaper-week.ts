import type { RecipeCost } from "@kitchen-pantry/grocery-pricing";
import type { RankedRecipe } from "@kitchen-pantry/recipe-engine";
import type { IsoDate } from "@kitchen-pantry/shared-types";

/**
 * "Is there a cheaper week?" (spec 03 §6): after a week is planned, offer
 * swaps that cost less at the household's store *without* giving up what
 * the household needs.
 *
 *  - Only recipes the household can already have are considered (the
 *    candidates come from the same filters as planning: allergies, diet,
 *    equipment, skill, "Not for us").
 *  - Quality isn't traded away: a swap must score about as well as the meal
 *    it replaces, and favourites and locked or hand-picked nights are never
 *    touched.
 *  - Costs are the store's real prices for the amounts the recipe uses.
 *    Every suggestion says how sure it is: "exact" (both fully priced), "at
 *    least" (the new recipe is fully priced and the current one isn't, so
 *    the real saving can only be bigger), or "estimate" (some ingredients of
 *    both couldn't be priced — allowed only when at least 70% of each is
 *    priced, the new recipe has no more unpriced ingredients than the old
 *    one, and the gap is at least $1.50 a serving). No price is invented.
 *  - These are suggestions; nothing changes until the household taps Swap.
 */

export interface CheaperWeekMeal {
  date: IsoDate;
  recipeId: string | null;
  servings: number;
  locked: boolean;
}

export interface CheaperSwap {
  date: IsoDate;
  from: RankedRecipe;
  to: RankedRecipe;
  fromPerServingCents: number;
  toPerServingCents: number;
  /** (from − to) per serving × servings that night. */
  savingCents: number;
  /** exact: both fully priced · at_least: only the replaced meal is partly priced · estimate: both partly priced. */
  confidence: "exact" | "at_least" | "estimate";
  /** Ingredients of the new recipe that couldn't be priced (estimates only). */
  toUnpriced: string[];
}

export interface CheaperWeekOptions {
  /** A swap must save at least this much per serving (default $1). */
  minSavingPerServingCents?: number;
  /** How much lower a swap's score may be than the meal it replaces (default 8 points). */
  scoreMargin?: number;
  /** Suggestions to return (default 3). */
  max?: number;
  /** Recipe ids the household loves (rated 4+); never swapped out. */
  favourites?: ReadonlySet<string>;
}

const priced = (c: RecipeCost | undefined): c is RecipeCost & { perServingCents: number } => Boolean(c && c.perServingCents !== null && c.pricedCount > 0);
const share = (c: RecipeCost) => c.pricedCount / Math.max(1, c.pricedCount + c.unpriced.length);

/** Which meals and which alternatives are worth pricing (each request prices at most 8 recipes). */
export function cheaperWeekToPrice(meals: readonly CheaperWeekMeal[], candidates: readonly RankedRecipe[], perRequest = 8): { planned: string[]; alternatives: string[] } {
  const inPlan = new Set(meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x)));
  const planned = meals.filter((m) => !m.locked && m.recipeId).map((m) => m.recipeId!).slice(0, perRequest);
  const alternatives = candidates
    .filter((c) => !inPlan.has(c.recipe.id) && (c.recipe.course ?? "main") === "main" && !c.dismissed)
    // Budget-tagged and short-shopping-list recipes first: the likeliest to be cheaper.
    .sort((a, b) => Number(b.recipe.tags.includes("budget")) - Number(a.recipe.tags.includes("budget")) || a.coverage.missing.length - b.coverage.missing.length || b.score - a.score)
    .slice(0, perRequest)
    .map((c) => c.recipe.id);
  return { planned, alternatives };
}

export function cheaperSwaps(
  meals: readonly CheaperWeekMeal[],
  byId: ReadonlyMap<string, RankedRecipe>,
  candidates: readonly RankedRecipe[],
  costs: ReadonlyMap<string, RecipeCost>,
  options: CheaperWeekOptions = {},
): CheaperSwap[] {
  const minSaving = options.minSavingPerServingCents ?? 100;
  const margin = options.scoreMargin ?? 8;
  const favourites = options.favourites ?? new Set<string>();
  const inPlan = new Set(meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x)));
  const options_: CheaperSwap[] = [];
  for (const meal of meals) {
    if (meal.locked || !meal.recipeId || favourites.has(meal.recipeId)) continue;
    const from = byId.get(meal.recipeId);
    const fromCost = costs.get(meal.recipeId);
    if (!from || !priced(fromCost)) continue;
    for (const to of candidates) {
      if (inPlan.has(to.recipe.id) || to.dismissed || (to.recipe.course ?? "main") !== "main") continue;
      const toCost = costs.get(to.recipe.id);
      if (!priced(toCost)) continue;
      if (to.score < from.score - margin) continue;
      const perServing = fromCost.perServingCents - toCost.perServingCents;
      let confidence: CheaperSwap["confidence"];
      if (toCost.complete) {
        if (perServing < minSaving) continue;
        confidence = fromCost.complete ? "exact" : "at_least";
      } else {
        if (share(toCost) < 0.7 || share(fromCost) < 0.7 || toCost.unpriced.length > fromCost.unpriced.length) continue;
        if (perServing < Math.max(minSaving, 150)) continue;
        confidence = "estimate";
      }
      options_.push({ date: meal.date, from, to, fromPerServingCents: fromCost.perServingCents, toPerServingCents: toCost.perServingCents, savingCents: perServing * meal.servings, confidence, toUnpriced: confidence === "estimate" ? [...toCost.unpriced] : [] });
    }
  }
  // Surest first, then biggest savings; each night and each new recipe used once.
  const rank = { exact: 0, at_least: 0, estimate: 1 } as const;
  options_.sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.savingCents - a.savingCents || b.to.score - a.to.score);
  const out: CheaperSwap[] = [];
  const nights = new Set<string>();
  const used = new Set<string>();
  for (const s of options_) {
    if (nights.has(s.date) || used.has(s.to.recipe.id)) continue;
    out.push(s);
    nights.add(s.date);
    used.add(s.to.recipe.id);
    if (out.length >= (options.max ?? 3)) break;
  }
  return out;
}
