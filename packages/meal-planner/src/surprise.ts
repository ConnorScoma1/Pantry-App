import type { RecipeCost, RecipeCostInput, Special } from "@kitchen-pantry/grocery-pricing";
import { canonicalUnit, normalize } from "@kitchen-pantry/inventory-engine";
import { MIN_RATINGS_FOR_COMMUNITY_LABEL, tasteFit, type RankedRecipe, type TasteProfile } from "@kitchen-pantry/recipe-engine";
import { cuisines, labelFor, type IsoDate, type Recipe, type RecipeRating, type RecommendationEvent, type SurpriseKind } from "@kitchen-pantry/shared-types";
import { isShelfStable } from "./planner";
import { isMinorSaleItem, saleMatches, type SaleMatch } from "./specials";
import { addDays } from "./week";

/**
 * Surprise Me (spec 02 §5): a few fresh ideas of the kind the household asks
 * for, each with a plain "why". It only picks from recipes that already
 * passed every hard filter, never invents ratings or prices, and doesn't
 * repeat what was cooked or suggested in the last two weeks (favourites
 * excepted).
 */
export interface SurpriseHistory {
  /** Last day each recipe was cooked (ratings and "cooked" events). */
  cookedOn: ReadonlyMap<string, IsoDate>;
  /** Last day Surprise Me showed each recipe. */
  shownOn: ReadonlyMap<string, IsoDate>;
}

export function surpriseHistory(events: readonly RecommendationEvent[], myRatings: ReadonlyMap<string, RecipeRating>): SurpriseHistory {
  const cookedOn = new Map<string, IsoDate>();
  const shownOn = new Map<string, IsoDate>();
  const later = (m: Map<string, IsoDate>, id: string, day: IsoDate) => {
    if (!m.has(id) || m.get(id)! < day) m.set(id, day);
  };
  for (const r of myRatings.values()) later(cookedOn, r.recipeId, r.createdAt.slice(0, 10));
  for (const e of events) {
    if (e.event === "cooked") later(cookedOn, e.recipeId, e.createdAt.slice(0, 10));
    if (e.event === "shown" && e.surface === "surprise") later(shownOn, e.recipeId, e.createdAt.slice(0, 10));
  }
  return { cookedOn, shownOn };
}

export interface SurpriseInput {
  kind: SurpriseKind;
  /** rankRecipes(..., { includeAboveSkill: true }).recipes — main courses. */
  ranked: readonly RankedRecipe[];
  history: SurpriseHistory;
  today: IsoDate;
  skillLevel: number;
  taste?: TasteProfile | null;
  /** The household's own latest rating per recipe. */
  myRatings?: ReadonlyMap<string, RecipeRating>;
  /** Sale prices at the household's store (Cook the Specials / Specials). */
  specials?: readonly Special[];
  /** Cost per serving from the store's real prices, by recipe id. */
  costs?: ReadonlyMap<string, RecipeCost>;
  storeName?: string | null;
  /** Already shown in this session ("Show me others"). */
  exclude?: ReadonlySet<string>;
  count?: number;
}

export interface SurprisePick {
  ranked: RankedRecipe;
  why: string;
  costPerServingCents: number | null;
}

export interface SurpriseResult {
  picks: SurprisePick[];
  /** Plain words when there's little or nothing to show, or a caveat. */
  note: string | null;
  /** What's missing to answer this kind at all. */
  needs: null | "store" | "prices";
}

const REPEAT_DAYS = 14;
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const list = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function ownedNames(r: RankedRecipe): string[] {
  const owned = r.coverage.owned.map((i) => i.item.toLowerCase());
  const interesting = owned.filter((n) => !isShelfStable(n));
  return [...interesting, ...owned.filter((n) => isShelfStable(n))].slice(0, 2);
}

/** "You're getting this because …" — kind first, then sale, pantry and taste. */
export function explainPick(r: RankedRecipe, parts: { lead?: string | null; sales?: readonly SaleMatch[]; storeName?: string | null; taste?: TasteProfile | null }): string {
  const clauses: string[] = [];
  if (parts.lead) clauses.push(parts.lead);
  const sales = (parts.sales ?? []).filter((m) => !isMinorSaleItem(m.item));
  if (sales.length > 0) {
    const names = sales.slice(0, 2).map((m) => m.item.toLowerCase());
    clauses.push(`${list(names)} ${names.length === 1 && !/s$/.test(names[0]!) ? "is" : "are"} on sale${parts.storeName ? ` at ${parts.storeName}` : ""}`);
  }
  const owned = ownedNames(r);
  if (owned.length > 0) clauses.push(`you already have ${list(owned)}`);
  if (parts.taste) {
    const t = tasteFit(r.recipe, parts.taste);
    if (t.reason) clauses.push(t.reason.charAt(0).toLowerCase() + t.reason.slice(1));
  }
  if (clauses.length === 0) return r.reasons[0] ?? "A good fit for your household.";
  return `You're getting this because ${list(clauses.slice(0, 3))}.`;
}

const daysSince = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function surpriseMe(input: SurpriseInput): SurpriseResult {
  const count = input.count ?? 3;
  const cutoff = addDays(input.today, -REPEAT_DAYS);
  const base = input.ranked.filter((r) => r.allowed && !r.dismissed && (r.recipe.course ?? "main") === "main" && !input.exclude?.has(r.recipe.id));
  const withinSkill = base.filter((r) => !r.aboveSkill);
  const fresh = (rs: readonly RankedRecipe[]) =>
    rs.filter((r) => {
      if (r.favorite) return true;
      const cooked = input.history.cookedOn.get(r.recipe.id);
      const shown = input.history.shownOn.get(r.recipe.id);
      return !(cooked && cooked >= cutoff) && !(shown && shown >= cutoff);
    });
  const sales = (r: RankedRecipe) => saleMatches(r, input.specials ?? []);
  const pick = (rs: readonly RankedRecipe[], lead: (r: RankedRecipe) => string | null, cost?: (r: RankedRecipe) => number | null): SurprisePick[] =>
    rs.slice(0, count).map((r) => ({
      ranked: r,
      why: explainPick(r, { lead: lead(r), sales: sales(r), storeName: input.storeName, taste: input.taste }),
      costPerServingCents: cost ? cost(r) : null,
    }));
  const done = (picks: SurprisePick[], note: string | null = null, needs: SurpriseResult["needs"] = null): SurpriseResult => ({ picks, note, needs });
  const fallbackNote = (n: number) => (n === 0 ? "Nothing new fits right now — you've seen or cooked everything that matches lately." : null);

  switch (input.kind) {
    case "never_cooked": {
      const rs = fresh(withinSkill).filter((r) => !input.history.cookedOn.has(r.recipe.id));
      return done(pick(rs, () => "you haven't made it before"), rs.length === 0 ? "You've cooked everything that fits your kitchen — nice work. Try a restaurant-quality idea." : null);
    }
    case "popular": {
      const community = fresh(withinSkill)
        .filter((r) => r.rating && r.rating.count >= MIN_RATINGS_FOR_COMMUNITY_LABEL && r.rating.average >= 4.2)
        .sort((a, b) => b.rating!.average - a.rating!.average || b.rating!.count - a.rating!.count);
      if (community.length > 0) return done(pick(community, (r) => `it's rated ${r.rating!.average.toFixed(1)}★ by ${r.rating!.count} households`));
      // Not enough community ratings yet: say so, and offer the household's own hits instead (clearly labelled).
      const mine = (r: RankedRecipe) => input.myRatings?.get(r.recipe.id);
      const ours = withinSkill
        .filter((r) => (mine(r)?.overall ?? 0) >= 4 && mine(r)!.wouldCookAgain !== false)
        .filter((r) => {
          const cooked = input.history.cookedOn.get(r.recipe.id);
          return r.favorite || !(cooked && cooked >= cutoff);
        })
        .sort((a, b) => mine(b)!.overall - mine(a)!.overall);
      return done(
        pick(ours, (r) => `your household gave it ${mine(r)!.overall}★`),
        `No recipe has at least ${MIN_RATINGS_FOR_COMMUNITY_LABEL} ratings yet, so nothing is called "popular".${ours.length > 0 ? " Here are your household's own favourites." : ""}`,
      );
    }
    case "restaurant": {
      // Composed, technique-led dishes; one level above your skill is allowed, and says so.
      const rs = fresh(base)
        .filter((r) => r.recipe.skillLevel >= Math.min(4, input.skillLevel) && r.recipe.skillLevel <= input.skillLevel + 1)
        .filter((r) => r.recipe.skillLevel >= 4 || r.recipe.tags.some((t) => ["date-night", "dinner-party", "technique", "composed-plate"].includes(t)))
        .sort((a, b) => Number(a.aboveSkill) - Number(b.aboveSkill) || b.recipe.skillLevel - a.recipe.skillLevel || b.score - a.score);
      return done(
        pick(rs, (r) => (r.aboveSkill ? `it's a restaurant-style dish one step up from your usual cooking` : `it's a restaurant-style dish at your skill level`)),
        rs.length === 0 ? "No restaurant-style dishes fit your kitchen and skill right now." : null,
      );
    }
    case "under_5": {
      if (!input.storeName) return done([], "Choose your store on the Grocery List to see what recipes cost there.", "store");
      if (!input.costs || input.costs.size === 0) return done([], "Store prices aren't available right now, so we can't say what a serving costs.", "prices");
      const rs = fresh(withinSkill)
        .map((r) => ({ r, c: input.costs!.get(r.recipe.id) }))
        .filter((x) => x.c && x.c.perServingCents !== null && x.c.perServingCents <= 500 && (x.c.complete || (x.c.unpriced.length <= 1 && x.c.perServingCents <= 450)))
        .sort((a, b) => a.c!.perServingCents! - b.c!.perServingCents!);
      return done(
        pick(
          rs.map((x) => x.r),
          (r) => {
            const c = input.costs!.get(r.recipe.id)!;
            return `the ingredients come to about ${money(c.perServingCents!)} a serving at ${input.storeName}${c.complete ? "" : ` (not counting ${c.unpriced[0]})`}`;
          },
          (r) => input.costs!.get(r.recipe.id)?.perServingCents ?? null,
        ),
        rs.length === 0
          ? (() => {
              const all = [...input.costs!.values()];
              const full = all.filter((c) => c.complete && c.perServingCents !== null).sort((a, b) => a.perServingCents! - b.perServingCents!);
              const partial = all.length - full.length;
              const cheapest = full[0] ? ` The cheapest we could fully price is ${money(full[0].perServingCents!)} a serving.` : "";
              const gaps = partial > 0 ? ` ${partial} of the ${all.length} recipes we checked couldn't be fully priced (amounts like "3 cups" can't always be matched to package sizes).` : "";
              return `None of the recipes we priced come in under $5 a serving at ${input.storeName} right now.${cheapest}${gaps} Tap "Show me others" to check more.`;
            })()
          : "Cost of the amounts used, from the store's current prices; salt, spices and oil you'll have aren't counted. Buying whole packages costs more up front.",
      );
    }
    case "use_what_i_have": {
      const ratio = (r: RankedRecipe) => (r.coverage.requiredCount > 0 ? r.coverage.owned.length / r.coverage.requiredCount : 0);
      const rs = fresh(withinSkill)
        .filter((r) => ratio(r) >= 0.4)
        .sort((a, b) => b.coverage.usesSoon.length - a.coverage.usesSoon.length || ratio(b) - ratio(a) || b.score - a.score);
      return done(
        pick(rs, (r) => (r.coverage.usesSoon.length > 0 ? `it uses up your ${r.coverage.usesSoon[0]!.name.toLowerCase()} before it goes off` : `you have ${r.coverage.owned.length} of its ${r.coverage.requiredCount} ingredients`)),
        rs.length === 0 ? "Add what's in your kitchen on My Kitchen and we'll find dinners that use it." : null,
      );
    }
    case "specials": {
      if (!input.storeName) return done([], "Choose your store on the Grocery List to see what's on sale there.", "store");
      if (!input.specials) return done([], "Sale prices aren't available right now.", "prices");
      const rs = fresh(withinSkill)
        .map((r) => ({ r, m: sales(r).filter((x) => !isMinorSaleItem(x.item)) }))
        .filter((x) => x.m.length > 0)
        .sort((a, b) => b.m.length - a.m.length || Math.max(...b.m.map((x) => x.special.percentOff)) - Math.max(...a.m.map((x) => x.special.percentOff)) || b.r.score - a.r.score);
      return done(pick(rs.map((x) => x.r), () => null), rs.length === 0 ? `Nothing your recipes need is on sale at ${input.storeName} right now.` : "Sale prices can change at the store.");
    }
    case "new_cuisine": {
      const recent = new Set<string>();
      const ever = new Set<string>();
      const byId = new Map(input.ranked.map((r) => [r.recipe.id, r.recipe] as const));
      for (const [id, day] of input.history.cookedOn) {
        const c = byId.get(id)?.cuisine;
        if (!c) continue;
        ever.add(c);
        if (daysSince(day, input.today) <= 30) recent.add(c);
      }
      const seen = new Set<string>();
      const rs = fresh(withinSkill)
        .filter((r) => r.recipe.cuisine && !recent.has(r.recipe.cuisine))
        .sort((a, b) => Number(ever.has(a.recipe.cuisine!)) - Number(ever.has(b.recipe.cuisine!)) || b.score - a.score)
        .filter((r) => (seen.has(r.recipe.cuisine!) ? false : (seen.add(r.recipe.cuisine!), true)));
      return done(
        pick(rs, (r) => {
          const name = labelFor(cuisines, r.recipe.cuisine!);
          return ever.has(r.recipe.cuisine!) ? `you haven't cooked ${name} in the last month` : `you haven't tried ${name} cooking here yet`;
        }),
        fallbackNote(rs.length),
      );
    }
  }
}

/** The ingredients worth pricing for a recipe (amounts scaled to its servings; long-lasting basics left out). */
export function recipeCostInput(recipe: Recipe): RecipeCostInput {
  return {
    id: recipe.id,
    servings: recipe.servings,
    ingredients: recipe.ingredients
      .filter((i) => !i.optional && !isShelfStable(i.item) && !["water", "hot water", "ice"].includes(i.item.toLowerCase()))
      .slice(0, 25)
      .map((i) => ({
        name: i.item,
        quantity: i.quantity === null ? null : (() => {
          const n = normalize({ value: i.quantity, unit: i.unit ? canonicalUnit(i.unit) : "each" });
          return { value: n.value, unit: n.unit };
        })(),
      })),
  };
}
