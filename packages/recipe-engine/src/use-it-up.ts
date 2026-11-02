import { assessUrgency, convert, STAPLES } from "@kitchen-pantry/inventory-engine";
import type { IsoDate, PantryItem, RecipeIngredient } from "@kitchen-pantry/shared-types";
import { formatAmount, formatIngredientLine, pantryItemMatches, type RankedRecipe } from "./recipes";

/**
 * "Use It Before You Lose It" (spec 01 §6): the household picks one or more
 * ingredients to use up; we suggest recipes that use as many of them as
 * possible, need the fewest extra things, and otherwise suit the household
 * (the normal ranking already applied allergies, diet, equipment, skill and
 * taste).
 *
 * Safety: anything past its use-by date is never used, even if picked — we
 * only go by the dates the household entered and never suggest food past them.
 */
export interface UseUpIdea {
  ranked: RankedRecipe;
  /** The picked kitchen items this recipe uses, most urgent first. */
  uses: PantryItem[];
  /** How the recipe uses each of them, e.g. "1 lb chicken thighs". */
  usage: Array<{ item: PantryItem; lines: string[]; /** Set when the recipe needs more than you have, e.g. "you have 1½ lb". */ short: string | null }>;
  /** What you'd still need to buy (required ingredients you don't have), basics left out. */
  missing: RecipeIngredient[];
  /** Salt, pepper, oil and dried spices the recipe needs that aren't in My Kitchen (most kitchens have them). */
  basics: RecipeIngredient[];
  /** Required ingredients you already have, out of how many. */
  have: number;
  of: number;
  /** One plain sentence: what it uses and what you'd need. */
  why: string;
}

export interface UseUpResult {
  picks: UseUpIdea[];
  /** Picked items no suggestion uses (so we can say so plainly). */
  unused: PantryItem[];
  /** Picked items left out because they're past their date. */
  pastDate: PantryItem[];
}

/** Seasonings and cooking oils: listed separately as "if you're out", never counted as shopping. */
const BASICS: PantryItem[] = STAPLES.filter((s) => s.category === "spice" || s.category === "oil").map((s) => ({
  id: `basic:${s.name}`, ingredientId: null, name: s.name, category: s.category, quantity: null, unit: null, storageLocation: "pantry",
  purchasedOn: null, useBy: null, openedOn: null, estimatedRemainingPct: null, pricePaidCents: null, isStaple: true, createdAt: "", updatedAt: "",
}));
const isBasic = (i: RecipeIngredient) => BASICS.some((b) => pantryItemMatches(i.item, b));

/** "you have 1½ lb" when the amounts compare and the recipe (as written) needs more. */
function shortOf(item: PantryItem, used: RecipeIngredient[]): string | null {
  if (item.quantity === null || !item.unit) return null;
  let need = 0;
  for (const i of used) {
    if (i.quantity === null) return null;
    const v = convert({ value: i.quantity, unit: i.unit ?? "each" }, item.unit);
    if (v === null || !Number.isFinite(v)) return null;
    need += v;
  }
  return need > item.quantity * 1.02 ? `you have ${formatAmount(item.quantity)} ${item.unit}` : null;
}

const urgencyRank = (item: PantryItem, today: IsoDate) => {
  const u = assessUrgency(item.useBy, today);
  return u.daysLeft === null ? 99 : u.daysLeft;
};

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function sentence(uses: PantryItem[], missing: RecipeIngredient[], basics: RecipeIngredient[], have: number, of: number): string {
  const first = `Uses your ${list(uses.map((u) => u.name.toLowerCase()))}.`;
  const b = basics.map((x) => x.item.toLowerCase());
  const extra = b.length > 0 ? ` (Plus ${b.length > 3 ? `${b.slice(0, 3).join(", ")} and other basics` : list(b)} if you're out.)` : "";
  if (missing.length === 0) return `${first} You already have everything else you need.${extra}`;
  const m = missing.map((x) => x.item.toLowerCase());
  const named = m.length > 3 ? `${m.slice(0, 3).join(", ")} and ${m.length - 3} more` : list(m);
  const what = `${m.length === 1 ? "one thing" : `${m.length} things`}: ${named}.`;
  if (have >= of / 2 && missing.length <= 3) return `${first} You already have most of the ingredients — you'd only need to buy ${what}${extra}`;
  return `${first} You'd need to buy ${what}${extra}`;
}

export function ideasToUseUp(ranked: readonly RankedRecipe[], picked: readonly PantryItem[], today: IsoDate, limit = 6): UseUpResult {
  const pastDate = picked.filter((p) => !assessUrgency(p.useBy, today).usable);
  const usable = picked.filter((p) => assessUrgency(p.useBy, today).usable).sort((a, b) => urgencyRank(a, today) - urgencyRank(b, today));
  if (usable.length === 0) return { picks: [], unused: [], pastDate };

  const candidates: UseUpIdea[] = [];
  for (const r of ranked) {
    if (!r.allowed || r.dismissed) continue;
    const usage: UseUpIdea["usage"] = [];
    for (const item of usable) {
      const used = r.recipe.ingredients.filter((i) => pantryItemMatches(i.item, item));
      if (used.length > 0) usage.push({ item, lines: used.map((i) => formatIngredientLine(i)), short: shortOf(item, used) });
    }
    if (usage.length === 0) continue;
    const basics = r.coverage.missing.filter(isBasic);
    const missing = r.coverage.missing.filter((m) => !isBasic(m));
    const of = r.coverage.requiredCount - basics.length;
    const have = Math.max(0, of - missing.length);
    const uses = usage.map((u) => u.item);
    candidates.push({ ranked: r, uses, usage, missing, basics, have, of, why: sentence(uses, missing, basics, have, of) });
  }

  // Most picked items used, then the most urgent of them, then fewest to buy,
  // then what suits the household best.
  const soonest = (p: UseUpIdea) => Math.min(...p.uses.map((u) => urgencyRank(u, today)));
  candidates.sort(
    (a, b) =>
      b.uses.length - a.uses.length ||
      soonest(a) - soonest(b) ||
      a.missing.length - b.missing.length ||
      Number(a.ranked.aboveSkill) - Number(b.ranked.aboveSkill) ||
      b.ranked.score - a.ranked.score,
  );

  // Make sure every picked item gets at least one idea when one exists,
  // instead of six ways to use the same thing.
  const picks: UseUpIdea[] = [];
  const covered = new Set<string>();
  for (const item of usable) {
    if (picks.length >= limit) break;
    if (covered.has(item.id)) continue;
    const best = candidates.find((c) => !picks.includes(c) && c.uses.some((u) => u.id === item.id));
    if (best) {
      picks.push(best);
      for (const u of best.uses) covered.add(u.id);
    }
  }
  for (const c of candidates) {
    if (picks.length >= limit) break;
    if (!picks.includes(c)) picks.push(c);
  }
  picks.sort(
    (a, b) =>
      b.uses.length - a.uses.length || soonest(a) - soonest(b) || a.missing.length - b.missing.length || b.ranked.score - a.ranked.score,
  );
  const used = new Set(candidates.flatMap((c) => c.uses.map((u) => u.id)));
  return { picks, unused: usable.filter((u) => !used.has(u.id)), pastDate };
}

/** The items to suggest picking first: usable, not staples, due within a week (soonest first). */
export function toUseUpFirst(pantry: readonly PantryItem[], today: IsoDate): PantryItem[] {
  return pantry
    .filter((p) => !p.isStaple)
    .filter((p) => {
      const u = assessUrgency(p.useBy, today);
      return u.usable && (u.urgency === "today" || u.urgency === "soon" || u.urgency === "this_week");
    })
    .sort((a, b) => urgencyRank(a, today) - urgencyRank(b, today) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// "What would the extra shopping cost?" — the request for the store's real
// shelf prices, and adding them up per idea. Nothing is estimated: items
// without a price are counted and reported.
// ---------------------------------------------------------------------------
export function shoppingForIdeas(ideas: readonly UseUpIdea[]): Array<{ id: string; name: string; quantity: { value: number; unit: string } | null }> {
  return ideas
    .flatMap((idea) =>
      idea.missing.map((m, i) => ({
        id: `${idea.ranked.recipe.id}~${i}`.slice(0, 64),
        name: m.item.slice(0, 120),
        quantity: m.quantity !== null && m.quantity > 0 && m.unit ? { value: m.quantity, unit: m.unit } : null,
      })),
    )
    .slice(0, 80);
}

export interface ExtraCost {
  cents: number;
  priced: number;
  of: number;
  /** Some amounts couldn't be compared to a package, so one package was counted. */
  assumed: boolean;
  observedAt: string | null;
}

export function extraCosts(
  ideas: readonly UseUpIdea[],
  lines: ReadonlyArray<{ id: string; lineTotalCents: number | null; outOfStock: boolean; assumedOnePackage: boolean; observedAt: string | null }>,
): Map<string, ExtraCost> {
  const costs = new Map<string, ExtraCost>();
  for (const idea of ideas) {
    const prefix = `${idea.ranked.recipe.id}~`;
    const priced = lines.filter((l) => l.id.startsWith(prefix) && l.lineTotalCents !== null && !l.outOfStock);
    const dates = priced.map((l) => l.observedAt).filter((d): d is string => Boolean(d)).sort();
    costs.set(idea.ranked.recipe.id, {
      cents: priced.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0),
      priced: priced.length,
      of: idea.missing.length,
      assumed: priced.some((l) => l.assumedOnePackage),
      observedAt: dates[0] ?? null,
    });
  }
  return costs;
}
