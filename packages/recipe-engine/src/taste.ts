import { cuisines, labelFor, type Recipe, type RecipeRating } from "@kitchen-pantry/shared-types";
import { recipeProteins } from "./recipes";

/**
 * What this household has enjoyed, learned only from its own ratings
 * (never from other households, never guessed). Each rated recipe adds its
 * signal (★ above or below 3, plus "would cook again") to its cuisine and
 * main proteins; averages are shrunk toward 0 so one rating can't swing
 * everything.
 */
export interface Affinity {
  /** Roughly −2 (didn't enjoy) … +2 (loved). */
  score: number;
  /** How many of the household's ratings this is based on. */
  ratings: number;
}

export interface TasteProfile {
  cuisines: ReadonlyMap<string, Affinity>;
  proteins: ReadonlyMap<string, Affinity>;
  /** Total ratings used. */
  evidence: number;
}

function signal(r: RecipeRating): number {
  let s = r.overall - 3;
  if (r.wouldCookAgain === true) s += 0.5;
  if (r.wouldCookAgain === false) s -= 1;
  if (r.familyApproval !== null) s += (r.familyApproval - 3) * 0.25;
  return Math.max(-2.5, Math.min(2.5, s));
}

export function tasteProfile(recipes: readonly Recipe[], ratings: ReadonlyMap<string, RecipeRating>): TasteProfile {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const cuisineAcc = new Map<string, { sum: number; n: number }>();
  const proteinAcc = new Map<string, { sum: number; n: number }>();
  const add = (map: Map<string, { sum: number; n: number }>, key: string, s: number) => {
    const e = map.get(key) ?? { sum: 0, n: 0 };
    e.sum += s;
    e.n++;
    map.set(key, e);
  };
  let evidence = 0;
  for (const rating of ratings.values()) {
    const recipe = byId.get(rating.recipeId);
    if (!recipe || recipe.course === "dessert") continue;
    const s = signal(rating);
    evidence++;
    if (recipe.cuisine) add(cuisineAcc, recipe.cuisine, s);
    for (const p of recipeProteins(recipe)) add(proteinAcc, p, s);
  }
  const shrink = (m: Map<string, { sum: number; n: number }>) => new Map([...m].map(([k, { sum, n }]) => [k, { score: sum / (n + 1), ratings: n }]));
  return { cuisines: shrink(cuisineAcc), proteins: shrink(proteinAcc), evidence };
}

/**
 * The nudge for one recipe (bounded: never outweighs safety, the use-it-up
 * list, or the recipe's own rating) and a reason when the evidence is real
 * (at least two ratings in that cuisine or protein).
 */
export function tasteFit(recipe: Recipe, taste: TasteProfile): { points: number; reason: string | null } {
  if (taste.evidence === 0) return { points: 0, reason: null };
  const c = recipe.cuisine ? taste.cuisines.get(recipe.cuisine) : undefined;
  const ps = recipeProteins(recipe)
    .map((p) => [p, taste.proteins.get(p)] as const)
    .filter((x): x is readonly [string, Affinity] => Boolean(x[1]));
  const bestProtein = [...ps].sort((a, b) => b[1].score - a[1].score)[0];
  const points = Math.max(-12, Math.min(12, (c?.score ?? 0) * 5 + (bestProtein?.[1].score ?? 0) * 3));
  let reason: string | null = null;
  if (c && c.ratings >= 2 && c.score >= 0.8 && recipe.cuisine) reason = `You've enjoyed similar ${labelFor(cuisines, recipe.cuisine)} dishes`;
  else if (bestProtein && bestProtein[1].ratings >= 2 && bestProtein[1].score >= 0.8) reason = `You've rated ${bestProtein[0]} dishes highly`;
  return { points: Math.round(points * 10) / 10, reason };
}
