import type {
  AllergenCode,
  DietaryRestriction,
  DietStyle,
  EquipmentCode,
  RecipeSourceKind,
  SkillLevel,
} from "@kitchen-pantry/shared-types";
import { allergens, dietStyles, equipment, labelFor } from "@kitchen-pantry/shared-types";
import { matchesAnyTerm, screenAllergens, type AllergenScreenResult } from "./allergens";

/**
 * Equipment substitutions we consider genuinely viable. Each entry lists
 * alternatives in preference order; a recipe is only offered when the user
 * owns the equipment or one of these alternatives.
 */
export const EQUIPMENT_ALTERNATIVES: Partial<Record<EquipmentCode, EquipmentCode[]>> = {
  air_fryer: ["oven"],
  slow_cooker: ["dutch_oven", "pressure_cooker"],
  pressure_cooker: ["dutch_oven", "slow_cooker"],
  cast_iron: ["stove"],
  dutch_oven: ["slow_cooker"],
  grill: ["cast_iron", "oven"],
  food_processor: ["blender"],
  blender: ["food_processor"],
  stand_mixer: [],
  sous_vide: [],
  smoker: [],
  microwave: ["stove"],
};

export interface EquipmentCheck {
  ok: boolean;
  adaptations: Array<{ requires: EquipmentCode; use: EquipmentCode }>;
  missing: EquipmentCode[];
}

export function checkEquipment(
  required: readonly EquipmentCode[],
  owned: readonly EquipmentCode[],
): EquipmentCheck {
  const have = new Set(owned);
  const adaptations: EquipmentCheck["adaptations"] = [];
  const missing: EquipmentCode[] = [];

  for (const item of required) {
    if (have.has(item)) continue;
    const alternative = EQUIPMENT_ALTERNATIVES[item]?.find((alt) => have.has(alt));
    if (alternative) adaptations.push({ requires: item, use: alternative });
    else missing.push(item);
  }
  return { ok: missing.length === 0, adaptations, missing };
}

/** Meat words (cuts and products too, so "ribeye" or "brisket" isn't mistaken for a vegetable). */
export const MEAT_TERMS = [
  "chicken", "beef", "pork", "bacon", "ham", "sausage", "turkey", "lamb", "veal", "duck", "goose", "quail", "rabbit", "venison", "bison", "goat meat", "mutton",
  "prosciutto", "pancetta", "guanciale", "chorizo", "salami", "pepperoni", "pastrami", "hot dog", "bratwurst", "kielbasa", "andouille",
  "steak", "ribeye", "rib eye", "sirloin", "tenderloin", "brisket", "short rib", "short ribs", "flank", "skirt steak", "chuck", "oxtail", "spare ribs", "pork belly",
  "ground meat", "meatball", "meatballs", "liver", "bone marrow", "bone broth", "gelatin", "lard", "suet", "tallow", "schmaltz",
];
const PORK_TERMS = ["pork", "bacon", "ham", "prosciutto", "pancetta", "guanciale", "chorizo", "salami", "pepperoni", "lard", "pork belly", "spare ribs", "gelatin", "hot dog", "bratwurst", "kielbasa", "andouille"];
const ALCOHOL_TERMS = ["wine", "beer", "rum", "vodka", "whiskey", "whisky", "bourbon", "brandy", "cognac", "sherry", "sake", "mirin", "liqueur", "vermouth", "tequila", "gin", "stout", "ale", "marsala", "shaoxing"];

export const DIET_EXCLUDED_TERMS: Record<DietStyle, string[]> = {
  omnivore: [],
  pescatarian: [...MEAT_TERMS],
  vegetarian: [],
  vegan: [],
};
DIET_EXCLUDED_TERMS.vegetarian = [
  ...DIET_EXCLUDED_TERMS.pescatarian,
  "fish",
  "salmon",
  "tuna",
  "shrimp",
  "anchovy",
  "anchovies",
  "fish sauce",
  "worcestershire",
  "crab",
  "lobster",
  "scallop",
  "clam",
  "mussel",
  "oyster",
];
DIET_EXCLUDED_TERMS.vegan = [
  ...DIET_EXCLUDED_TERMS.vegetarian,
  "egg",
  "milk",
  "butter",
  "cream",
  "cheese",
  "yogurt",
  "honey",
  "ghee",
  "whey",
];

/**
 * Diet style and dietary restrictions, as hard filters. The term lists are
 * backed by the allergen rules (which know "cheddar" is dairy and "fish
 * sauce" is fish). Restrictions we can't check from ingredients — low
 * sodium, lower carb, keto, paleo — aren't claimed: no nutrition is invented.
 * Halal and kosher only exclude what the ingredients show (pork, alcohol,
 * shellfish, meat with dairy); sourcing and certification can't be checked.
 */
export function dietConflicts(lines: string[], dietStyle: DietStyle, restrictions: readonly DietaryRestriction[] = []): string[] {
  const reasons: string[] = [];
  const conflictsOf = (codes: AllergenCode[]) => [...new Set(screenAllergens(lines, codes).conflicts.map((c) => c.matchedTerm))];
  const style = [...matchesAnyTerm(lines, DIET_EXCLUDED_TERMS[dietStyle])];
  if (dietStyle === "vegetarian" || dietStyle === "vegan") style.push(...conflictsOf(["fish", "shellfish"]));
  if (dietStyle === "vegan") style.push(...conflictsOf(["milk", "egg"]));
  if (style.length > 0) reasons.push(`Not ${labelFor(dietStyles, dietStyle).toLowerCase()}: ${[...new Set(style)].slice(0, 4).join(", ")}`);
  const r = new Set(restrictions);
  if (r.has("gluten_free")) {
    const hits = conflictsOf(["gluten", "wheat"]);
    if (hits.length) reasons.push(`Not gluten-free: ${hits.slice(0, 3).join(", ")}`);
  }
  if (r.has("dairy_free")) {
    const hits = conflictsOf(["milk"]);
    if (hits.length) reasons.push(`Not dairy-free: ${hits.slice(0, 3).join(", ")}`);
  }
  if (r.has("halal") || r.has("kosher")) {
    const hits = [...matchesAnyTerm(lines, PORK_TERMS)];
    // Vinegars made from wine aren't alcoholic drinks.
    if (r.has("halal")) hits.push(...matchesAnyTerm(lines.map((l) => l.replace(/\b(rice |red |white )?(wine|sherry|champagne|malt) vinegar\b/gi, "vinegar")), ALCOHOL_TERMS));
    if (r.has("kosher")) {
      hits.push(...conflictsOf(["shellfish"]));
      if (matchesAnyTerm(lines, MEAT_TERMS.filter((t) => !["gelatin", "bone broth"].includes(t))).length && conflictsOf(["milk"]).length) hits.push("meat with dairy");
    }
    if (hits.length) reasons.push(`Not ${r.has("halal") ? "halal" : "kosher"}: ${[...new Set(hits)].slice(0, 3).join(", ")}`);
  }
  return reasons;
}

export interface EligibilityInput {
  ingredientLines: string[];
  skillLevel: SkillLevel;
  requiredEquipment: EquipmentCode[];
}

export interface HouseholdConstraints {
  allergies: readonly AllergenCode[];
  dietStyle: DietStyle;
  /** Gluten-free, dairy-free, halal, kosher… (the ones ingredients can show). */
  restrictions?: readonly DietaryRestriction[];
  /** Free-text "never recommend" terms. */
  neverRecommend: readonly string[];
  maxSkillLevel: SkillLevel;
  equipment: readonly EquipmentCode[];
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  allergens: AllergenScreenResult;
  equipment: EquipmentCheck;
}

/**
 * Hard filters a recipe must pass before it can be recommended. Ranking
 * (ratings, cost, preferences) happens after this, never instead of it.
 */
export function checkEligibility(
  recipe: EligibilityInput,
  household: HouseholdConstraints,
): EligibilityResult {
  const reasons: string[] = [];
  const allergenResult = screenAllergens(recipe.ingredientLines, household.allergies);
  if (allergenResult.conflicts.length > 0) {
    const names = [...new Set(allergenResult.conflicts.map((c) => labelFor(allergens, c.allergen).toLowerCase()))].join(", ");
    reasons.push(`Contains allergens: ${names}`);
  }

  reasons.push(...dietConflicts(recipe.ingredientLines, household.dietStyle, household.restrictions));

  const neverHits = matchesAnyTerm(recipe.ingredientLines, household.neverRecommend);
  if (neverHits.length > 0) reasons.push(`Excluded ingredients: ${neverHits.join(", ")}`);

  if (recipe.skillLevel > household.maxSkillLevel) {
    reasons.push(`Above your skill level (level ${recipe.skillLevel})`);
  }

  const equipmentResult = checkEquipment(recipe.requiredEquipment, household.equipment);
  if (!equipmentResult.ok) reasons.push(`Needs equipment you don't have: ${equipmentResult.missing.map((e) => labelFor(equipment, e)).join(", ")}`);

  return {
    eligible: reasons.length === 0,
    reasons,
    allergens: allergenResult,
    equipment: equipmentResult,
  };
}

/** Minimum number of verified ratings before we call something "highly rated". */
export const MIN_RATINGS_FOR_COMMUNITY_LABEL = 20;

export type RecommendationLabel =
  | "community_rated"
  | "few_ratings"
  | "editorial"
  | "ai_suggestion"
  | "your_recipe";

/** How we're allowed to describe a recipe — ratings are never invented. */
export function recommendationLabel(
  rating: { average: number; count: number } | null,
  sourceKind: RecipeSourceKind,
): RecommendationLabel {
  if (rating && rating.count >= MIN_RATINGS_FOR_COMMUNITY_LABEL) return "community_rated";
  if (rating && rating.count > 0) return "few_ratings";
  if (sourceKind === "ai_generated") return "ai_suggestion";
  if (sourceKind === "user_submitted") return "your_recipe";
  return "editorial";
}

/**
 * Screen a store product by its name (Specials). Text only, so it errs on
 * the side of hiding: "chicken-style nuggets" is hidden for vegetarians.
 * It can't read ingredient labels, so it never says a product is safe.
 */
export function screenProduct(
  name: string,
  household: Pick<HouseholdConstraints, "allergies" | "dietStyle" | "neverRecommend" | "restrictions">,
): string[] {
  const reasons: string[] = [];
  const allergen = screenAllergens([name], household.allergies);
  if (allergen.conflicts.length > 0) {
    reasons.push(`May contain ${[...new Set(allergen.conflicts.map((c) => labelFor(allergens, c.allergen).toLowerCase()))].join(", ")}`);
  }
  if (dietConflicts([name], household.dietStyle, household.restrictions).length > 0) {
    reasons.push(`Not ${labelFor(dietStyles, household.dietStyle).toLowerCase()}${household.restrictions?.length ? " or doesn't fit your restrictions" : ""}`);
  }
  const never = matchesAnyTerm([name], household.neverRecommend);
  if (never.length > 0) reasons.push(`You asked us to skip ${never.join(", ")}`);
  return reasons;
}
