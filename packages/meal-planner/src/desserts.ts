import type { RankedRecipe } from "@kitchen-pantry/recipe-engine";
import type { DessertFrequency, IsoDate, Recipe } from "@kitchen-pantry/shared-types";
import { isShelfStable, mulberry32 } from "./planner";
import { addDays } from "./week";

/**
 * Optional desserts (spec 05). Deterministic, shared by web and mobile.
 *
 *  - Desserts never take a dinner's place; they have their own slots.
 *  - The household's frequency decides how many are added automatically —
 *    at most two a week, never every day. "Never automatically" and
 *    "Special occasions only" add none; "Add dessert" always works.
 *  - Picks prefer desserts that share fresh ingredients with the week's
 *    dinners (one carton of cream, not two) or use what needs using up.
 *  - Chill and freeze times become a plain scheduling note.
 */

export interface DessertPick {
  date: IsoDate;
  recipeId: string;
  servings: number;
  note: string | null;
}

/**
 * Days that get an automatic dessert. Weekdays: Mon=0 … Sun=6.
 * With `dinnerDays`, each dessert lands on a night that has a dinner
 * planned (a dessert on a night nobody's cooking would be odd).
 */
export function dessertDays(weekStart: IsoDate, frequency: DessertFrequency, today?: IsoDate, dinnerDays?: readonly IsoDate[]): IsoDate[] {
  const day = (i: number) => addDays(weekStart, i);
  const open = (d: IsoDate) => !today || d >= today;
  // Each slot: preferred day first, then fallbacks.
  const slots: number[][] =
    frequency === "weekly"
      ? [[5, 6, 4, 3, 2, 1, 0]]
      : frequency === "twice_weekly"
        ? [[2, 3, 1, 0], [5, 4, 6]]
        : frequency === "weekends"
          ? [[5, 4], [6]]
          : []; // never / occasions: only when someone adds one
  const dinners = dinnerDays && dinnerDays.length > 0 ? new Set(dinnerDays) : null;
  const chosen: IsoDate[] = [];
  for (const slot of slots) {
    const options = slot.map(day).filter((d) => open(d) && !chosen.includes(d));
    const pick = (dinners ? options.find((d) => dinners.has(d)) : undefined) ?? options[0];
    if (pick) chosen.push(pick);
  }
  return chosen.sort();
}

const COMMON = /^(large )?(eggs?|egg yolks?|unsalted butter|butter|water|hot water|kosher salt|granulated sugar)$/;

/** Fresh ingredients a dessert shares with the given dinners. */
export function sharedFreshIngredients(dessert: Recipe, dinners: readonly Recipe[]): string[] {
  const dinnerItems = new Set(dinners.flatMap((r) => r.ingredients.filter((i) => !i.optional).map((i) => i.item.toLowerCase().trim())));
  return [
    ...new Set(
      dessert.ingredients
        .filter((i) => !i.optional)
        .map((i) => i.item.toLowerCase().trim())
        .filter((item) => !COMMON.test(item) && !isShelfStable(item) && dinnerItems.has(item)),
    ),
  ];
}

function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 2) / 2;
  return `${h % 1 === 0 ? h : h.toFixed(1)} hour${h === 1 ? "" : "s"}`;
}

/** Plain scheduling advice from prep and chill times. */
export function dessertTiming(recipe: Recipe): string | null {
  const chill = recipe.chillMinutes ?? 0;
  const verb = recipe.dessertCategory === "frozen" ? "freeze" : "chill";
  if (chill >= 240) return `Make it the day before — it needs ${hours(chill)} to ${verb}`;
  if (chill >= 60) return `Start early — it needs ${hours(chill)} to ${verb}`;
  if (recipe.prepMinutes + recipe.cookMinutes >= 90) return "A project — give yourself the afternoon";
  return null;
}

const isWeekday = (weekStart: IsoDate, date: IsoDate) => {
  const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000);
  return offset >= 0 && offset <= 3;
};

export function planDesserts(input: {
  weekStart: IsoDate;
  days: readonly IsoDate[];
  /** Eligible desserts, best first (rankRecipes with course "dessert"). */
  candidates: readonly RankedRecipe[];
  /** This week's dinner recipes, for shared ingredients. */
  dinners: readonly Recipe[];
  servings: number;
  /** Desserts already in the week (kept ones) — never repeated. */
  avoid?: ReadonlySet<string>;
  seed?: number;
}): DessertPick[] {
  const rand = mulberry32(input.seed ?? 1);
  const used = new Set(input.avoid ?? []);
  const usedCategories: string[] = [];
  const picks: DessertPick[] = [];
  for (const date of input.days) {
    let best: { ranked: RankedRecipe; score: number; shared: string[] } | null = null;
    for (const ranked of input.candidates) {
      const r = ranked.recipe;
      if (used.has(r.id) || r.course !== "dessert") continue;
      const shared = sharedFreshIngredients(r, input.dinners);
      let score = ranked.score + shared.length * 8;
      if (r.dessertCategory && usedCategories.includes(r.dessertCategory)) score -= 8; // variety
      if (isWeekday(input.weekStart, date)) {
        if (r.prepMinutes + r.cookMinutes > 50) score -= 12; // weeknights stay easy
        if ((r.chillMinutes ?? 0) >= 240) score -= 6;
      }
      score += rand() * 2; // stable tie-break per seed
      if (!best || score > best.score) best = { ranked, score, shared };
    }
    if (!best) break;
    const r = best.ranked.recipe;
    used.add(r.id);
    if (r.dessertCategory) usedCategories.push(r.dessertCategory);
    const notes = [
      dessertTiming(r),
      best.shared.length > 0 ? `Shares ${best.shared.slice(0, 2).join(" and ")} with this week's dinners` : null,
      best.ranked.coverage.usesSoon.length > 0 ? `Uses up your ${best.ranked.coverage.usesSoon[0]!.name.toLowerCase()}` : null,
    ].filter(Boolean);
    picks.push({ date, recipeId: r.id, servings: input.servings, note: notes.length ? notes.join(" · ") : null });
  }
  return picks;
}
