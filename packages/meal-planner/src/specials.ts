import { matchScore, MIN_MATCH, STAPLE_SPECIALS_TERMS, type Special, type SpecialsTerm } from "@kitchen-pantry/grocery-pricing";
import { householdProfile, matchProduce, produceSearchName, screenProduct, type RankedRecipe, type SeasonalContext } from "@kitchen-pantry/recipe-engine";
import { departmentFor } from "./grocery";
import { isShelfStable } from "./planner";
import type { GroceryDepartment, GroceryItem, OnboardingProfile } from "@kitchen-pantry/shared-types";

/**
 * Which products to ask the store about for the Specials tab, most personal
 * first: what's still on the shared grocery list, then this season's
 * produce, then everyday staples by department. Item names only — nothing
 * else about the household leaves the device.
 */
/** How a term is normalised before it's sent (and matched back). */
export const termKey = (term: string) =>
  term.toLowerCase().replace(/[^a-z0-9 &'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export function specialsTerms(input: {
  groceryItems: readonly Pick<GroceryItem, "name" | "department" | "checked">[];
  seasonal?: SeasonalContext | null;
  max?: number;
}): SpecialsTerm[] {
  const max = input.max ?? 45;
  const out: SpecialsTerm[] = [];
  const seen = new Set<string>();
  const push = (term: string, department: GroceryDepartment) => {
    const key = termKey(term);
    if (key.length < 2 || seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push({ term: key, department });
  };
  // Up to 20 from the list, so staples and the season still get a look.
  for (const item of input.groceryItems.filter((i) => !i.checked).slice(0, 20)) push(item.name, item.department);
  if (input.seasonal?.settings.produce) for (const p of input.seasonal.produce.slice(0, 8)) push(produceSearchName(p.name), "produce");
  for (const t of STAPLE_SPECIALS_TERMS) push(t.term, t.department);
  return out;
}

export type SpecialsSort = "relevant" | "discount" | "unit_price";

export interface SpecialsFilter {
  department?: GroceryDepartment | null;
  /** Minimum whole percent off (0 = any). */
  minPercentOff?: number;
  /** Hide products whose names conflict with the household's allergies, diet style or "never recommend" list. */
  fitsDiet?: boolean;
  query?: string;
  sort?: SpecialsSort;
}

export interface ShownSpecial {
  special: Special;
  /** It's for something on the grocery list. */
  onList: boolean;
  /** It's in-season produce. */
  inSeason: boolean;
  /** Why it was hidden by "fits our diet" (shown when the filter is off). */
  conflicts: string[];
}

export interface SpecialsView {
  shown: ShownSpecial[];
  /** Hidden by the diet filter — counted so the page can say so. */
  hiddenForDiet: number;
  departments: Array<{ code: GroceryDepartment; count: number }>;
}

/** Filter and order specials for one household (deterministic; no prices invented or changed). */
export function viewSpecials(
  specials: readonly Special[],
  ctx: { profile: OnboardingProfile; listNames: readonly string[]; seasonal?: SeasonalContext | null },
  filter: SpecialsFilter = {},
): SpecialsView {
  const p = householdProfile(ctx.profile);
  const constraints = { allergies: p.diet.allergies, dietStyle: p.diet.style, neverRecommend: p.diet.neverRecommend };
  const list = new Set(ctx.listNames.map(termKey));
  const q = filter.query?.trim().toLowerCase() ?? "";

  const all: ShownSpecial[] = specials.map((special) => ({
    special,
    onList: list.has(special.matchedTerm),
    inSeason: Boolean(ctx.seasonal?.settings.produce && special.department === "produce" && matchProduce(special.name, ctx.seasonal.produce)),
    conflicts: screenProduct(special.name, constraints),
  }));

  const fitsDiet = filter.fitsDiet ?? true;
  const dietOk = fitsDiet ? all.filter((s) => s.conflicts.length === 0) : all;
  const counts = new Map<GroceryDepartment, number>();
  for (const s of dietOk) counts.set(s.special.department, (counts.get(s.special.department) ?? 0) + 1);

  const shown = dietOk.filter(
    (s) =>
      (!filter.department || s.special.department === filter.department) &&
      s.special.percentOff >= (filter.minPercentOff ?? 0) &&
      (!q || `${s.special.name} ${s.special.brand ?? ""} ${s.special.matchedTerm}`.toLowerCase().includes(q)),
  );

  const sort = filter.sort ?? "relevant";
  const unit = (s: ShownSpecial) => s.special.unitPrice?.saleCents ?? Number.POSITIVE_INFINITY;
  shown.sort((a, b) => {
    if (sort === "discount") return b.special.percentOff - a.special.percentOff || a.special.saleCents - b.special.saleCents;
    if (sort === "unit_price") {
      // Only comparable within the same unit; group by unit, cheapest first.
      const order = ["oz", "lb", "fl oz", "each"];
      const rank = (s: ShownSpecial) => (s.special.unitPrice ? order.indexOf(s.special.unitPrice.per) : order.length);
      return rank(a) - rank(b) || unit(a) - unit(b);
    }
    return Number(b.onList) - Number(a.onList) || Number(b.inSeason) - Number(a.inSeason) || b.special.percentOff - a.special.percentOff;
  });

  return {
    shown,
    hiddenForDiet: all.length - dietOk.length,
    departments: [...counts].map(([code, count]) => ({ code, count })),
  };
}

/** "Save $2.00 (22% off)". */
export function savingsLabel(s: Pick<Special, "regularCents" | "saleCents" | "percentOff">, format: (cents: number) => string): string {
  return `Save ${format(s.regularCents - s.saleCents)} (${s.percentOff}% off)`;
}

// ---------------------------------------------------------------------------
// Cook the Specials (spec 02 §3)
// ---------------------------------------------------------------------------
/**
 * What to ask the store about when planning around sales: the fresh things
 * the best candidate recipes would make you buy, most-needed first.
 */
export function cookTheSpecialsTerms(candidates: readonly RankedRecipe[], max = 45): SpecialsTerm[] {
  const count = new Map<string, { term: string; n: number }>();
  for (const r of candidates.filter((c) => c.allowed && !c.dismissed && !c.aboveSkill).slice(0, 40)) {
    for (const i of r.coverage.missing) {
      if (i.optional || isShelfStable(i.item)) continue;
      const key = termKey(i.item);
      if (key.length < 2) continue;
      const e = count.get(key) ?? { term: key, n: 0 };
      e.n++;
      count.set(key, e);
    }
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || a.term.localeCompare(b.term))
    .slice(0, max)
    .map((e) => ({ term: e.term, department: departmentFor(e.term) }));
}

export interface SaleMatch {
  /** The recipe ingredient (as the recipe names it). */
  item: string;
  special: Special;
}

/**
 * Ingredients this recipe still needs to buy that the store has on sale.
 * Matching uses the same rules as pricing (every key word, no other form:
 * "dill" never matches "dill pickles"); the deepest discount wins.
 */
export function saleMatches(recipe: RankedRecipe, specials: readonly Special[]): SaleMatch[] {
  if (specials.length === 0) return [];
  const out: SaleMatch[] = [];
  for (const i of recipe.coverage.missing) {
    // Spices, oils and other long-lasting basics on sale don't make a dinner worth choosing.
    if (i.optional || isShelfStable(i.item) || departmentFor(i.item) === "spices" || /\b(cinnamon|cardamom|clove|bay lea|peppercorn|star anise|vanilla bean)/i.test(i.item)) continue;
    const hits = specials.filter((s) => matchScore(i.item, s.name) >= MIN_MATCH);
    if (hits.length === 0) continue;
    const best = [...hits].sort((a, b) => b.percentOff - a.percentOff || a.saleCents - b.saleCents)[0]!;
    out.push({ item: i.item, special: best });
  }
  return out;
}

/** Everyday basics (onions, garlic, citrus) on sale count for little when choosing a dinner. */
export function isMinorSaleItem(item: string): boolean {
  return /^(yellow |red |white |sweet )?onions?$|^garlic|^(fresh )?(lemon|lime)s?$|^(green onions?|scallions?)$|^(fresh )?(parsley|cilantro|thyme|thyme leaves|dill|basil|mint|chives)$/i.test(item.trim());
}
