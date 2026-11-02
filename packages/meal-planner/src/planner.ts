import type { Special } from "@kitchen-pantry/grocery-pricing";
import { STAPLES } from "@kitchen-pantry/inventory-engine";
import { recipeProteins, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import type { CookingGoal, IsoDate, PlannedMeal, PlanningMode } from "@kitchen-pantry/shared-types";
import { isMinorSaleItem, saleMatches } from "./specials";
import { addDays } from "./week";

/**
 * Deterministic weekly planner.
 *
 * Works everywhere (web, phone, offline, no API key) and is the fallback
 * whenever the AI planner is unavailable or returns something unusable.
 * It only ever chooses from `candidates`, which the caller has already
 * passed through the hard filters (allergies, diet, equipment, skill,
 * "Not for us") in recipe-engine — so nothing here can re-introduce an
 * unsafe recipe.
 *
 * What it optimises, beyond each recipe's own score:
 *   - the planning mode (Budget First / Balanced / Chef's Choice / Use What I Have)
 *   - the week as a basket: recipes that share ingredients you'd have to buy
 *     anyway (the other half of the spinach) are preferred together
 *   - variety: no repeats, and not the same protein or cuisine night after night
 *   - weeknights vs weekends: quicker dinners Mon–Thu, bigger projects at the weekend
 * Budget First means fewer items to buy and more shared ingredients — never
 * invented costs. Cook the Specials uses only sale prices the store itself
 * reported (`specials`), and says when there were none.
 */

export interface PlanWeekInput {
  /** Dates still to fill (locked days excluded). */
  days: IsoDate[];
  candidates: RankedRecipe[];
  mode: PlanningMode;
  goals: readonly CookingGoal[];
  servings: number;
  /** Meals already fixed this week (locked or kept); they count for reuse and variety. */
  fixed?: ReadonlyArray<Pick<PlannedMeal, "date" | "recipeId">>;
  /** Recipes to steer away from (e.g. the previous suggestions when regenerating). */
  avoid?: ReadonlySet<string>;
  /** Changes the tie-breaks so "Regenerate" gives a different week. */
  seed?: number;
  /** Cook the Specials: verified sale prices at the household's store. */
  specials?: readonly Special[];
  /** Where those prices came from, for the summary. */
  specialsSource?: { storeName: string; checkedAt: string } | null;
}

export interface PlannedPick {
  date: IsoDate;
  recipeId: string;
  servings: number;
  note: string;
}

export interface PlanWeekResult {
  picks: PlannedPick[];
  /** Days we couldn't fill because there weren't enough suitable recipes. */
  unfilled: IsoDate[];
  summary: string;
}

const MODE_LABEL: Record<PlanningMode, string> = {
  balanced: "Balanced",
  budget_first: "Budget First",
  chefs_choice: "Chef's Choice",
  use_what_i_have: "Use What I Have",
  cook_the_specials: "Cook the Specials",
};

/** Mon–Thu are weeknights (UTC weekday of an ISO date). */
export function isWeeknight(date: IsoDate): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 4;
}

/**
 * Which days get a dinner when the household plans fewer than seven:
 * spread out so cooking days don't bunch together.
 */
export function chooseDinnerDays(weekStart: IsoDate, dinnersPerWeek: number): IsoDate[] {
  const n = Math.max(0, Math.min(7, Math.round(dinnersPerWeek)));
  const offsets: Record<number, number[]> = {
    0: [],
    1: [2],
    2: [1, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 5],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return offsets[n]!.map((o) => addDays(weekStart, o));
}

/** Small seeded PRNG so a given seed always produces the same plan. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (s: string) => s.toLowerCase().trim();

/** Spices, oils, baking basics and condiments last for ages — sharing them saves nothing. */
const SHELF_STABLE = STAPLES.filter((s) => ["spice", "oil", "baking", "sauce", "condiment"].includes(s.category))
  .flatMap((s) => [s.name, ...s.aliases])
  .map((n) => new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
export function isShelfStable(item: string): boolean {
  const t = norm(item);
  return SHELF_STABLE.some((re) => re.test(t));
}

interface Chosen {
  ranked: RankedRecipe;
  date: IsoDate;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function modeScore(r: RankedRecipe, mode: PlanningMode, specials: readonly Special[] = []): { score: number; why: string | null } {
  const { coverage, recipe } = r;
  const missing = coverage.missing.length;
  const ratio = coverage.requiredCount > 0 ? coverage.owned.length / coverage.requiredCount : 0;
  switch (mode) {
    case "budget_first": {
      let s = -5 * missing;
      if (recipe.tags.includes("budget")) s += 10;
      return { score: s, why: missing <= 3 ? `Only ${missing} thing${missing === 1 ? "" : "s"} to buy` : null };
    }
    case "use_what_i_have": {
      const s = ratio * 45 + coverage.usesSoon.length * 18 - 4 * missing;
      return { score: s, why: coverage.owned.length > 0 ? `Uses ${coverage.owned.length} things you already have` : null };
    }
    case "chefs_choice": {
      let s = recipe.skillLevel * 6 - missing * 1;
      if (r.rating && r.rating.count > 0) s += (r.rating.average - 3) * 8;
      if (r.favorite) s += 6;
      return { score: s, why: recipe.skillLevel >= 3 ? "A standout dish worth the effort" : null };
    }
    case "cook_the_specials": {
      const all = saleMatches(r, specials);
      const main = all.filter((m) => !isMinorSaleItem(m.item));
      if (all.length === 0) return { score: -2 * missing - (specials.length > 0 ? 6 : 0), why: null };
      const best = [...(main.length > 0 ? main : all)].sort((a, b) => b.special.percentOff - a.special.percentOff)[0]!;
      const s = Math.min(main.length, 3) * 12 + Math.min(all.length - main.length, 2) * 2 + (main.length > 0 ? Math.min(best.special.percentOff, 50) / 4 : 0) - 2 * missing;
      const names = (main.length > 0 ? main : all).slice(0, 2).map((m) => lowerFirst(m.item));
      return { score: s, why: main.length > 0 ? `On sale: ${names.join(" and ")} (${best.special.percentOff}% off)` : null };
    }
    case "balanced":
    default:
      return { score: -1.5 * missing, why: null };
  }
}

/** Score a candidate for a specific day, given what's already planned. */
function scoreFor(
  r: RankedRecipe,
  date: IsoDate,
  chosen: Chosen[],
  input: PlanWeekInput,
  rand: () => number,
): { score: number; note: string } {
  const { recipe } = r;
  const mode = modeScore(r, input.mode, input.specials);
  let score = r.score + mode.score;
  let note = mode.why ?? r.reasons[0] ?? "A good fit for your household";

  // Basket: shared purchases. Each item this recipe needs to buy that another
  // planned recipe also buys makes the package go further.
  const plannedToBuy = new Set(
    chosen.flatMap((c) => c.ranked.coverage.missing.filter((i) => !isShelfStable(i.item)).map((i) => norm(i.item))),
  );
  const shared = r.coverage.missing.filter((i) => !isShelfStable(i.item) && plannedToBuy.has(norm(i.item))).map((i) => i.item);
  if (shared.length > 0) {
    const weight = input.mode === "budget_first" ? 9 : input.mode === "chefs_choice" ? 3 : 6;
    score += Math.min(shared.length, 3) * weight;
    // Name the interesting overlap (spinach, cream), not garlic and onions.
    const notable = shared.filter((x) => !/^(garlic|yellow onion|onion|lemon|butter)$/i.test(x));
    if (notable.length > 0 && input.mode !== "chefs_choice" && !(input.mode === "cook_the_specials" && mode.why)) {
      note = `Shares ${notable.slice(0, 2).join(" and ").toLowerCase()} with another meal this week`;
    }
  }

  // Use-it-up items should be used once, not fought over by several recipes.
  const plannedUseSoon = new Set(chosen.flatMap((c) => c.ranked.coverage.usesSoon.map((p) => p.id)));
  const newUseSoon = r.coverage.usesSoon.filter((p) => !plannedUseSoon.has(p.id));
  if (r.coverage.usesSoon.length > 0 && newUseSoon.length === 0) score -= 10;

  // Variety: proteins and cuisines.
  const proteins = recipeProteins(recipe);
  const sorted = [...chosen].sort((a, b) => a.date.localeCompare(b.date));
  const prev = [...sorted].reverse().find((c) => c.date < date);
  const next = sorted.find((c) => c.date > date);
  const neighbours = [prev, next].filter((c): c is Chosen => Boolean(c));
  for (const n of neighbours) {
    const nProteins = recipeProteins(n.ranked.recipe);
    if (proteins.some((p) => nProteins.includes(p))) score -= 12;
    if (recipe.cuisine && recipe.cuisine === n.ranked.recipe.cuisine) score -= 6;
  }
  const sameProteinCount = chosen.filter((c) => recipeProteins(c.ranked.recipe).some((p) => proteins.includes(p))).length;
  score -= sameProteinCount * 5;

  // Weeknights vs weekends.
  const hurry = input.goals.includes("save_time") ? 1.5 : 1;
  if (isWeeknight(date)) {
    if (recipe.totalMinutes > 40) score -= ((recipe.totalMinutes - 40) / 15) * 7 * hurry;
    // Past 45 minutes a weeknight dinner is a real ask: only when nothing quicker fits.
    if (recipe.totalMinutes > 45) score -= 12 * hurry;
  } else if (recipe.skillLevel >= 3 || recipe.totalMinutes > 60) {
    score += 10;
    if (recipe.totalMinutes > 60 && !note.startsWith("Shares")) note = "Saved for the weekend — it takes a little longer";
  }

  if (input.avoid?.has(recipe.id)) score -= 14;
  score += (rand() - 0.5) * (input.seed ? 8 : 0.001);
  return { score, note };
}

/** Plan the open days of a week. Pure and deterministic for a given seed. */
export function planWeek(input: PlanWeekInput): PlanWeekResult {
  const rand = mulberry32(input.seed ?? 1);
  const pool = input.candidates.filter((c) => c.allowed && !c.dismissed && !c.aboveSkill);
  const byId = new Map(pool.map((c) => [c.recipe.id, c]));
  const fixedIds = new Set((input.fixed ?? []).map((f) => f.recipeId).filter((id): id is string => Boolean(id)));

  const chosen: Chosen[] = (input.fixed ?? [])
    .filter((f) => f.recipeId && byId.has(f.recipeId))
    .map((f) => ({ ranked: byId.get(f.recipeId!)!, date: f.date }));

  const picks: PlannedPick[] = [];
  const unfilled: IsoDate[] = [];
  // Fill weekend days first so the bigger projects land there, then weeknights.
  const order = [...input.days].sort((a, b) => Number(isWeeknight(a)) - Number(isWeeknight(b)) || a.localeCompare(b));

  for (const date of order) {
    const used = new Set([...fixedIds, ...chosen.map((c) => c.ranked.recipe.id)]);
    let best: { ranked: RankedRecipe; score: number; note: string } | null = null;
    for (const c of pool) {
      if (used.has(c.recipe.id)) continue;
      const { score, note } = scoreFor(c, date, chosen, input, rand);
      if (!best || score > best.score) best = { ranked: c, score, note };
    }
    if (!best) {
      unfilled.push(date);
      continue;
    }
    chosen.push({ ranked: best.ranked, date });
    picks.push({ date, recipeId: best.ranked.recipe.id, servings: input.servings, note: best.note });
  }

  picks.sort((a, b) => a.date.localeCompare(b.date));
  // Choosing one night at a time can leave the same protein on back-to-back
  // nights when there are few recipes to choose from; re-order to fix it.
  const spread = spreadProteins(picks, new Map(input.candidates.map((c) => [c.recipe.id, c])), input.fixed ?? []);
  return { picks: spread, unfilled: unfilled.sort(), summary: summarize(spread, chosen, input) };
}

/**
 * Re-order a week's dinners so the same main protein doesn't land on two
 * nights in a row (the AI doesn't always manage it, and the built-in planner's
 * one-night-at-a-time choice can't always avoid it with a small pool), without moving long
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


function summarize(picks: PlannedPick[], chosen: Chosen[], input: PlanWeekInput): string {
  if (picks.length === 0) return "We couldn't find enough recipes that fit your household this week.";
  const all = chosen.map((c) => c.ranked);
  const toBuy = new Set(all.flatMap((r) => r.coverage.missing.map((i) => norm(i.item))));
  const usedUp = new Set(all.flatMap((r) => r.coverage.usesSoon.map((p) => p.name)));
  const parts = [`${MODE_LABEL[input.mode]} week: ${picks.length} new dinner${picks.length === 1 ? "" : "s"}`];
  if (usedUp.size > 0) parts.push(`uses up your ${[...usedUp].slice(0, 3).join(", ").toLowerCase()}`);
  parts.push(`about ${toBuy.size} different item${toBuy.size === 1 ? "" : "s"} to buy`);
  if (input.mode === "cook_the_specials") {
    const onSale = new Map<string, string>();
    for (const r of all) for (const m of saleMatches(r, input.specials ?? [])) onSale.set(norm(m.item), m.item);
    const src = input.specialsSource;
    if (!input.specials || input.specials.length === 0) parts.push("no sale prices were available, so it's planned like Balanced");
    else if (onSale.size === 0) parts.push("nothing these recipes need is on sale right now");
    else {
      const when = src ? ` at ${src.storeName}` : "";
      const names = [...onSale.values()].sort((a, b) => Number(isMinorSaleItem(a)) - Number(isMinorSaleItem(b)));
      parts.push(`${onSale.size} item${onSale.size === 1 ? "" : "s"} on sale${when} (${names.slice(0, 4).join(", ").toLowerCase()}) — sale prices can change`);
    }
  }
  return `${parts.join(" · ")}.`;
}

/**
 * Best replacement for one day: the top-scoring candidate that isn't
 * already in the week (and isn't the meal being swapped out).
 */
export function suggestSwap(
  input: Omit<PlanWeekInput, "days" | "avoid">,
  date: IsoDate,
  currentRecipeId: string | null,
  skip: ReadonlySet<string> = new Set(),
): PlannedPick | null {
  const others = (input.fixed ?? []).filter((f) => f.date !== date);
  const avoid = new Set([...skip, ...(currentRecipeId ? [currentRecipeId] : [])]);
  const pool = input.candidates.filter((c) => !avoid.has(c.recipe.id));
  const result = planWeek({ ...input, candidates: pool, days: [date], fixed: others });
  return result.picks[0] ?? null;
}

export interface BasketItem {
  item: string;
  /** Recipe titles that need it. */
  neededFor: string[];
}

export interface WeekBasket {
  toBuy: BasketItem[];
  /** Pantry items close to their date that the week uses up. */
  usesUp: string[];
  /** Ingredients already in the kitchen that the week uses. */
  fromKitchen: number;
}

/**
 * What the planned week means for shopping (names only — quantities, unit
 * conversion and package maths arrive with the grocery list milestone).
 */
export function weekBasket(planned: RankedRecipe[]): WeekBasket {
  const map = new Map<string, BasketItem>();
  for (const r of planned) {
    for (const i of r.coverage.missing) {
      const key = norm(i.item);
      const entry = map.get(key) ?? { item: i.item, neededFor: [] };
      if (!entry.neededFor.includes(r.recipe.title)) entry.neededFor.push(r.recipe.title);
      map.set(key, entry);
    }
  }
  const usesUp = [...new Set(planned.flatMap((r) => r.coverage.usesSoon.map((p) => p.name)))];
  const fromKitchen = new Set(planned.flatMap((r) => r.coverage.owned.map((i) => norm(i.item)))).size;
  return {
    toBuy: [...map.values()].sort((a, b) => b.neededFor.length - a.neededFor.length || a.item.localeCompare(b.item)),
    usesUp,
    fromKitchen,
  };
}
