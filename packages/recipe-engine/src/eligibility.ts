import type {
  AllergenCode,
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

const DIET_EXCLUDED_TERMS: Record<DietStyle, string[]> = {
  omnivore: [],
  pescatarian: ["chicken", "beef", "pork", "bacon", "ham", "sausage", "turkey", "lamb", "veal", "duck", "prosciutto", "pancetta", "chorizo", "salami", "pepperoni", "gelatin", "lard"],
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

export interface EligibilityInput {
  ingredientLines: string[];
  skillLevel: SkillLevel;
  requiredEquipment: EquipmentCode[];
}

export interface HouseholdConstraints {
  allergies: readonly AllergenCode[];
  dietStyle: DietStyle;
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

  const dietHits = matchesAnyTerm(recipe.ingredientLines, DIET_EXCLUDED_TERMS[household.dietStyle]);
  if (dietHits.length > 0) reasons.push(`Not ${labelFor(dietStyles, household.dietStyle).toLowerCase()}: ${dietHits.join(", ")}`);

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
