import { assessUrgency, STAPLES } from "@kitchen-pantry/inventory-engine";
import {
  cuisines,
  equipment,
  labelFor,
  type CookingGoal,
  type IsoDate,
  type OnboardingProfile,
  type PantryItem,
  type RatingSummary,
  type Recipe,
  type RecipeIngredient,
  type RecipeRating,
} from "@kitchen-pantry/shared-types";
import { matchesAnyTerm } from "./allergens";
import { checkEligibility, recommendationLabel, type EligibilityResult, type RecommendationLabel } from "./eligibility";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const FRACTIONS: Array<[number, string]> = [
  [0, ""],
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
  [1, ""],
];

/**
 * Kitchen-friendly amounts: 1.5 -> "1½", 0.33 -> "⅓", 0.9 -> "⅞".
 * Scaled amounts snap to the nearest eighth or third, because nobody
 * measures 0.6 of a cup; large amounts (grams, ml) round to whole numbers.
 */
export function formatAmount(value: number): string {
  if (value <= 0) return "0";
  if (value >= 20) return String(Math.round(value));
  const whole = Math.floor(value);
  const frac = value - whole;
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  const w = best[0] === 1 ? whole + 1 : whole;
  if (w === 0 && best[1] === "") return "⅛"; // never round a real amount down to nothing
  return `${w > 0 ? w : ""}${best[1]}`;
}

const PLURAL_UNITS: Record<string, string> = { clove: "cloves", can: "cans", sprig: "sprigs", cup: "cups", pinch: "pinches" };

/** "1½ lb boneless chicken thighs, cut into 1-inch pieces" — scaled by `factor`. */
export function formatIngredientLine(i: RecipeIngredient, factor = 1): string {
  const parts: string[] = [];
  if (i.quantity !== null) {
    const q = i.quantity * factor;
    parts.push(formatAmount(q));
    if (i.unit) parts.push(q > 1 && PLURAL_UNITS[i.unit] ? PLURAL_UNITS[i.unit]! : i.unit);
  }
  parts.push(i.item);
  let line = parts.join(" ");
  if (i.preparation) line += `, ${i.preparation}`;
  return line;
}

/** Stored °C -> "425°F". Kitchen temperatures round cleanly after conversion. */
export function formatTemperature(celsius: number, units: "F" | "C" = "F"): string {
  if (units === "C") return `${Math.round(celsius)}°C`;
  return `${Math.round((celsius * 9) / 5 + 32)}°F`;
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Every ingredient line, for allergen and exclusion screening. */
export function ingredientLines(recipe: Recipe): string[] {
  return recipe.ingredients.map((i) => [i.item, i.preparation].filter(Boolean).join(", "));
}

// ---------------------------------------------------------------------------
// Pantry matching
// ---------------------------------------------------------------------------

/** Things every kitchen has; never listed as "missing". */
const ALWAYS_ON_HAND = ["water", "hot water", "ice"];

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => (w.endsWith("oes") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/** Names a pantry item can be recognised by (its own name plus catalogue aliases). */
function pantryNames(item: PantryItem): string[][] {
  const own = item.name.toLowerCase();
  const staple = STAPLES.find((s) => s.name === own || s.aliases.includes(own));
  const names = staple ? [staple.name, ...staple.aliases, own] : [own];
  return [...new Set(names)].map(normalizeWords);
}

/**
 * Does a pantry item satisfy a recipe ingredient? The pantry name must
 * appear as whole words in the ingredient ("chicken thighs" ⊂ "boneless
 * chicken thighs"), so "garlic powder" never counts as fresh garlic.
 */
export function pantryItemMatches(ingredientItem: string, pantryItem: PantryItem): boolean {
  const target = normalizeWords(ingredientItem);
  return pantryNames(pantryItem).some((name) => containsPhrase(target, name));
}

export interface PantryCoverage {
  owned: RecipeIngredient[];
  missing: RecipeIngredient[];
  /** Pantry items close to their use-by date that this recipe would use up. */
  usesSoon: PantryItem[];
  /** Required (non-optional) ingredients, excluding always-on-hand ones. */
  requiredCount: number;
}

/** Only usable items count: anything past its use-by date is ignored. */
export function pantryCoverage(recipe: Recipe, pantry: PantryItem[], today: IsoDate): PantryCoverage {
  const usable = pantry.filter((p) => assessUrgency(p.useBy, today).usable);
  const owned: RecipeIngredient[] = [];
  const missing: RecipeIngredient[] = [];
  const usesSoon = new Map<string, PantryItem>();

  for (const ingredient of recipe.ingredients) {
    if (ALWAYS_ON_HAND.includes(ingredient.item.toLowerCase())) continue;
    const matches = usable.filter((p) => pantryItemMatches(ingredient.item, p));
    if (matches.length > 0) {
      owned.push(ingredient);
      for (const m of matches) {
        const u = assessUrgency(m.useBy, today).urgency;
        if (u === "today" || u === "soon" || u === "this_week") usesSoon.set(m.id, m);
      }
    } else if (!ingredient.optional) {
      missing.push(ingredient);
    }
  }
  const requiredCount = recipe.ingredients.filter(
    (i) => !i.optional && !ALWAYS_ON_HAND.includes(i.item.toLowerCase()),
  ).length;
  return { owned, missing, usesSoon: [...usesSoon.values()], requiredCount };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface RankingContext {
  profile: OnboardingProfile;
  pantry: PantryItem[];
  today: IsoDate;
  favorites: ReadonlySet<string>;
  /** Real community rating summaries, by recipe id. */
  ratings: ReadonlyMap<string, RatingSummary>;
  /** This household's own most recent rating per recipe. */
  myRatings: ReadonlyMap<string, RecipeRating>;
}

export interface RankedRecipe {
  recipe: Recipe;
  score: number;
  /** Plain-English "why you're seeing this", most important first. */
  reasons: string[];
  /** Soft negatives, e.g. a disliked ingredient. */
  cautions: string[];
  coverage: PantryCoverage;
  eligibility: EligibilityResult;
  /** Passes hard filters (allergies, diet, never-recommend, equipment). */
  allowed: boolean;
  aboveSkill: boolean;
  label: RecommendationLabel;
  rating: RatingSummary | null;
  favorite: boolean;
}

function goalWeight(goals: readonly CookingGoal[], goal: CookingGoal): number {
  const i = goals.indexOf(goal);
  if (i < 0) return 0;
  return i === 0 ? 1.5 : i === 1 ? 1.25 : 1;
}

const PROTEIN_WORDS: Record<string, string[]> = {
  chicken: ["chicken"],
  beef: ["beef", "steak", "short rib"],
  pork: ["pork", "bacon", "ham", "sausage"],
  turkey: ["turkey"],
  lamb: ["lamb"],
  fish: ["salmon", "cod", "tuna", "fish", "trout", "halibut"],
  shellfish: ["shrimp", "scallop", "crab", "lobster", "mussel", "clam"],
  eggs: ["egg"],
  tofu: ["tofu", "tempeh"],
  beans: ["bean", "chickpea", "lentil"],
};

/**
 * Deterministic recommendation scoring. Hard filters come from
 * checkEligibility; everything else nudges order and produces the
 * explanation shown to the user. (AI re-ranking builds on this in a later
 * milestone — it never replaces the hard filters.)
 */
export function rankRecipe(recipe: Recipe, ctx: RankingContext): RankedRecipe {
  const { profile } = ctx;
  const lines = ingredientLines(recipe);
  const eligibility = checkEligibility(
    { ingredientLines: lines, skillLevel: recipe.skillLevel, requiredEquipment: recipe.requiredEquipment },
    {
      allergies: profile.diet.allergies,
      dietStyle: profile.diet.style,
      neverRecommend: profile.diet.neverRecommend,
      maxSkillLevel: 5, // skill is handled separately so users can opt in to stretch recipes
      equipment: profile.equipment,
    },
  );
  const aboveSkill = recipe.skillLevel > profile.skillLevel;
  const coverage = pantryCoverage(recipe, ctx.pantry, ctx.today);
  const goals = profile.goals.ranked;
  const rating = ctx.ratings.get(recipe.id) ?? null;
  const mine = ctx.myRatings.get(recipe.id);
  const favorite = ctx.favorites.has(recipe.id);

  const reasons: Array<[number, string]> = [];
  const cautions: string[] = [];
  let score = 0;

  // Use-it-up and pantry overlap.
  const wasteWeight = 1 + goalWeight(goals, "reduce_waste") * 0.5 + goalWeight(goals, "use_what_i_have") * 0.5;
  if (coverage.usesSoon.length > 0) {
    const pts = Math.min(coverage.usesSoon.length, 2) * 14 * wasteWeight;
    score += pts;
    const names = coverage.usesSoon.slice(0, 2).map((p) => p.name.toLowerCase());
    reasons.push([pts, `Uses up your ${names.join(" and ")} before ${coverage.usesSoon.length === 1 ? "it goes" : "they go"} off`]);
  }
  if (coverage.requiredCount > 0 && coverage.owned.length > 0) {
    const ratio = coverage.owned.length / coverage.requiredCount;
    const pts = ratio * 30 * wasteWeight;
    score += pts;
    if (coverage.missing.length === 0) reasons.push([pts, "You already have everything for this"]);
    else if (coverage.owned.length >= 3)
      reasons.push([pts, `You already have ${coverage.owned.length} of the ingredients — only ${coverage.missing.length} to buy`]);
  }

  // Taste preferences.
  if (recipe.cuisine && profile.diet.cuisines.includes(recipe.cuisine)) {
    score += 10;
    reasons.push([10, `${labelFor(cuisines, recipe.cuisine)} is one of your favourite cuisines`]);
  }
  const lowerLines = lines.join(" ").toLowerCase();
  const likedProtein = profile.diet.proteins.find((p) => (PROTEIN_WORDS[p] ?? []).some((w) => lowerLines.includes(w)));
  if (likedProtein) {
    score += 6;
    reasons.push([6, `Features ${likedProtein === "beans" ? "beans" : likedProtein}, a protein you like`]);
  }

  // Goals.
  const timeW = goalWeight(goals, "save_time");
  if (timeW && recipe.totalMinutes <= 30) {
    score += 8 * timeW;
    reasons.push([8 * timeW, `Ready in ${recipe.totalMinutes} minutes`]);
  }
  const proteinW = goalWeight(goals, "more_protein");
  if (proteinW && recipe.tags.includes("high-protein")) {
    score += 8 * proteinW;
    reasons.push([8 * proteinW, "High in protein"]);
  }
  const healthW = goalWeight(goals, "eat_healthier") + goalWeight(goals, "lose_weight");
  if (healthW && (recipe.tags.includes("healthy") || recipe.tags.includes("vegetarian") || recipe.tags.includes("vegan"))) {
    score += 6 * healthW;
    reasons.push([6 * healthW, "A lighter, vegetable-forward choice"]);
  }
  const prepW = goalWeight(goals, "meal_prep");
  if (prepW && (recipe.tags.includes("meal-prep") || recipe.tags.includes("make-ahead"))) {
    score += 8 * prepW;
    reasons.push([8 * prepW, "Great for meal prep — it keeps well"]);
  }
  const adventurousW = goalWeight(goals, "gourmet") + goalWeight(goals, "interesting_meals");
  if (adventurousW && recipe.skillLevel >= 3 && !aboveSkill) {
    score += 8 * adventurousW;
    reasons.push([8 * adventurousW, "A step up from everyday cooking"]);
  }
  const learnW = goalWeight(goals, "learn_to_cook");
  if (learnW && recipe.skillLevel === profile.skillLevel) {
    score += 5 * learnW;
    reasons.push([5 * learnW, "Builds skills right at your level"]);
  }
  const moneyW = goalWeight(goals, "save_money");
  if (moneyW && (recipe.tags.includes("budget") || recipe.tags.includes("use-it-up"))) {
    score += 5 * moneyW;
    reasons.push([5 * moneyW, "Budget-friendly"]);
  }

  // Skill fit.
  if (!aboveSkill) score += recipe.skillLevel === profile.skillLevel ? 6 : recipe.skillLevel === profile.skillLevel - 1 ? 3 : 0;
  else score -= 10 * (recipe.skillLevel - profile.skillLevel);

  // Favourites and real ratings only.
  if (favorite) {
    score += 10;
    reasons.push([10, "One of your favourites"]);
  }
  if (rating && rating.count > 0) {
    const confidence = Math.min(rating.count / 20, 1);
    score += (rating.average - 3) * 6 * confidence;
    if (rating.count >= 20 && rating.average >= 4.3) reasons.push([7, `Rated ${rating.average.toFixed(1)}★ by ${rating.count} households`]);
  }
  if (mine) {
    if (mine.wouldCookAgain === false || mine.overall <= 2) {
      score -= 25;
      cautions.push("You rated this low last time");
    } else if (mine.overall >= 4) {
      score += 6;
      reasons.push([6, `You gave this ${mine.overall}★`]);
    }
  }

  // Soft dislikes.
  const disliked = matchesAnyTerm(lines, profile.diet.dislikes);
  if (disliked.length > 0) {
    score -= 25;
    cautions.push(`Contains ${disliked.join(", ").toLowerCase()}, which you'd rather avoid`);
  }
  if (eligibility.equipment.adaptations.length > 0) {
    const a = eligibility.equipment.adaptations[0]!;
    cautions.push(`Made with your ${labelFor(equipment, a.use).toLowerCase()} instead of the ${labelFor(equipment, a.requires).toLowerCase()}`);
  }

  reasons.sort((a, b) => b[0] - a[0]);
  return {
    recipe,
    score: Math.round(score * 10) / 10,
    reasons: reasons.slice(0, 3).map(([, r]) => r),
    cautions,
    coverage,
    eligibility,
    allowed: eligibility.eligible,
    aboveSkill,
    label: recommendationLabel(rating ? { average: rating.average, count: rating.count } : null, recipe.source.kind),
    rating,
    favorite,
  };
}

export interface RecipeFilters {
  query?: string;
  maxMinutes?: number | null;
  cuisine?: string | null;
  includeAboveSkill?: boolean;
  favoritesOnly?: boolean;
  /** Only recipes needing at most this many items you don't have. */
  maxMissing?: number | null;
}

export interface RankedList {
  recipes: RankedRecipe[];
  /** Recipes hidden by hard filters, with the reason — shown on request. */
  hidden: RankedRecipe[];
}

export function rankRecipes(recipes: Recipe[], ctx: RankingContext, filters: RecipeFilters = {}): RankedList {
  const q = filters.query?.trim().toLowerCase() ?? "";
  const ranked = recipes.map((r) => rankRecipe(r, ctx));
  const hidden = ranked.filter((r) => !r.allowed);
  const visible = ranked.filter(
    (r) =>
      r.allowed &&
      (filters.includeAboveSkill || !r.aboveSkill) &&
      (!q ||
        r.recipe.title.toLowerCase().includes(q) ||
        r.recipe.ingredients.some((i) => i.item.toLowerCase().includes(q)) ||
        r.recipe.tags.some((t) => t.includes(q))) &&
      (!filters.maxMinutes || r.recipe.totalMinutes <= filters.maxMinutes) &&
      (!filters.cuisine || r.recipe.cuisine === filters.cuisine) &&
      (!filters.favoritesOnly || r.favorite) &&
      (filters.maxMissing === null || filters.maxMissing === undefined || r.coverage.missing.length <= filters.maxMissing),
  );
  visible.sort((a, b) => b.score - a.score || a.recipe.totalMinutes - b.recipe.totalMinutes);
  return { recipes: visible, hidden };
}

/** Group a recipe's ingredients or steps by component, preserving order. */
export function groupByComponent<T extends { component: string | null }>(items: T[]): Array<{ component: string | null; items: T[] }> {
  const groups: Array<{ component: string | null; items: T[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.component === item.component) last.items.push(item);
    else groups.push({ component: item.component, items: [item] });
  }
  return groups;
}
