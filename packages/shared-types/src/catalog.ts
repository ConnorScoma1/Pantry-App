/**
 * Canonical option catalogs shared by web, mobile, validation and the
 * database seed. Codes are stable identifiers stored in Postgres — never
 * rename a code; add a new one and migrate instead. Labels are UI copy.
 */

export const countries = [
  { code: "US", label: "United States", postalLabel: "ZIP code" },
  { code: "CA", label: "Canada", postalLabel: "Postal code" },
  { code: "GB", label: "United Kingdom", postalLabel: "Postcode" },
  { code: "AU", label: "Australia", postalLabel: "Postcode" },
  { code: "OTHER", label: "Somewhere else", postalLabel: "Postal code" },
] as const;
export type CountryCode = (typeof countries)[number]["code"];

export const mealTypes = [
  { code: "breakfast", label: "Breakfast" },
  { code: "lunch", label: "Lunch" },
  { code: "dinner", label: "Dinner" },
  { code: "snack", label: "Snacks" },
] as const;
export type MealType = (typeof mealTypes)[number]["code"];

export const budgetPeriods = [
  { code: "week", label: "per week", shortLabel: "Weekly" },
  { code: "two_weeks", label: "every two weeks", shortLabel: "Every 2 weeks" },
  { code: "month", label: "per month", shortLabel: "Monthly" },
] as const;
export type BudgetPeriod = (typeof budgetPeriods)[number]["code"];

export const budgetIncludes = [
  { code: "breakfast", label: "Breakfast" },
  { code: "lunch", label: "Lunch" },
  { code: "dinner", label: "Dinner" },
  { code: "snack", label: "Snacks" },
  { code: "drinks", label: "Drinks" },
  { code: "household", label: "Household items" },
] as const;
export type BudgetInclude = (typeof budgetIncludes)[number]["code"];

export const budgetPriorities = [
  {
    code: "lowest_cost",
    label: "Spend as little as possible",
    description: "Cheapest workable week, every week.",
  },
  {
    code: "balanced",
    label: "Balance cost and quality",
    description: "Good food at a sensible price.",
  },
  {
    code: "quality",
    label: "Prioritize quality ingredients",
    description: "Better produce and proteins where it counts.",
  },
  {
    code: "premium",
    label: "Premium cooking, cost no object",
    description: "Cook the best version of every dish.",
  },
] as const;
export type BudgetPriority = (typeof budgetPriorities)[number]["code"];

export const cookingGoals = [
  { code: "save_money", label: "Save money" },
  { code: "reduce_waste", label: "Reduce food waste" },
  { code: "eat_healthier", label: "Eat healthier" },
  { code: "lose_weight", label: "Lose weight" },
  { code: "more_protein", label: "Increase protein" },
  { code: "learn_to_cook", label: "Learn to cook" },
  { code: "interesting_meals", label: "Cook more interesting meals" },
  { code: "gourmet", label: "Prepare gourmet meals" },
  { code: "save_time", label: "Save time" },
  { code: "meal_prep", label: "Meal prep" },
  { code: "use_what_i_have", label: "Use up existing groceries" },
] as const;
export type CookingGoal = (typeof cookingGoals)[number]["code"];

/**
 * Allergens treated as strict exclusions. Alias matching lives in
 * @kitchen-pantry/recipe-engine; this list is the user-facing catalog.
 */
export const allergens = [
  { code: "milk", label: "Dairy / milk" },
  { code: "egg", label: "Eggs" },
  { code: "peanut", label: "Peanuts" },
  { code: "tree_nut", label: "Tree nuts" },
  { code: "soy", label: "Soy" },
  { code: "wheat", label: "Wheat" },
  { code: "gluten", label: "Gluten" },
  { code: "fish", label: "Fish" },
  { code: "shellfish", label: "Shellfish" },
  { code: "sesame", label: "Sesame" },
] as const;
export type AllergenCode = (typeof allergens)[number]["code"];

export const dietStyles = [
  { code: "omnivore", label: "Anything" },
  { code: "pescatarian", label: "Pescatarian" },
  { code: "vegetarian", label: "Vegetarian" },
  { code: "vegan", label: "Vegan" },
] as const;
export type DietStyle = (typeof dietStyles)[number]["code"];

export const dietaryRestrictions = [
  { code: "halal", label: "Halal" },
  { code: "kosher", label: "Kosher" },
  { code: "gluten_free", label: "Gluten-free" },
  { code: "dairy_free", label: "Dairy-free" },
  { code: "low_sodium", label: "Low sodium" },
  { code: "low_carb", label: "Lower carb" },
  { code: "keto", label: "Keto" },
  { code: "paleo", label: "Paleo" },
  { code: "mediterranean", label: "Mediterranean" },
  { code: "diabetic_friendly", label: "Diabetes-friendly" },
] as const;
export type DietaryRestriction = (typeof dietaryRestrictions)[number]["code"];

export const commonDislikes = [
  "Mushrooms",
  "Olives",
  "Cilantro",
  "Eggplant",
  "Coconut",
  "Tofu",
  "Blue cheese",
  "Anchovies",
  "Spicy food",
  "Raw onion",
] as const;

export const cuisines = [
  { code: "american", label: "American" },
  { code: "italian", label: "Italian" },
  { code: "mexican", label: "Mexican" },
  { code: "chinese", label: "Chinese" },
  { code: "japanese", label: "Japanese" },
  { code: "korean", label: "Korean" },
  { code: "thai", label: "Thai" },
  { code: "vietnamese", label: "Vietnamese" },
  { code: "indian", label: "Indian" },
  { code: "mediterranean", label: "Mediterranean" },
  { code: "middle_eastern", label: "Middle Eastern" },
  { code: "french", label: "French" },
  { code: "spanish", label: "Spanish" },
  { code: "southern", label: "Southern / BBQ" },
  { code: "caribbean", label: "Caribbean" },
] as const;
export type Cuisine = (typeof cuisines)[number]["code"];

export const proteins = [
  { code: "chicken", label: "Chicken" },
  { code: "beef", label: "Beef" },
  { code: "pork", label: "Pork" },
  { code: "turkey", label: "Turkey" },
  { code: "lamb", label: "Lamb" },
  { code: "fish", label: "Fish" },
  { code: "shellfish", label: "Shellfish" },
  { code: "eggs", label: "Eggs" },
  { code: "tofu", label: "Tofu & tempeh" },
  { code: "beans", label: "Beans & lentils" },
] as const;
export type Protein = (typeof proteins)[number]["code"];

export const skillLevels = [
  {
    level: 1,
    code: "beginner",
    label: "Beginner",
    summary: "Simple recipes, few ingredients, very detailed steps, basic equipment.",
  },
  {
    level: 2,
    code: "home_cook",
    label: "Home Cook",
    summary: "Everyday cooking — pan sauces, roasting, sautéing and basic knife skills.",
  },
  {
    level: 3,
    code: "experienced",
    label: "Experienced Home Cook",
    summary: "Homemade stocks, reductions, braising, temperature control and layered flavors.",
  },
  {
    level: 4,
    code: "advanced",
    label: "Advanced / Professional",
    summary: "Emulsions, compound sauces, advanced protein cookery and refined plating.",
  },
  {
    level: 5,
    code: "chefs_table",
    label: "Fine Dining / Chef's Table",
    summary:
      "Tasting-menu technique: sous vide, gastriques, beurre blanc, consommé, confit and composed plates.",
  },
] as const;
export type SkillLevel = (typeof skillLevels)[number]["level"];

export const equipment = [
  { code: "stove", label: "Stove" },
  { code: "oven", label: "Oven" },
  { code: "microwave", label: "Microwave" },
  { code: "air_fryer", label: "Air fryer" },
  { code: "slow_cooker", label: "Slow cooker" },
  { code: "pressure_cooker", label: "Pressure cooker" },
  { code: "grill", label: "Grill" },
  { code: "smoker", label: "Smoker" },
  { code: "sous_vide", label: "Sous vide" },
  { code: "stand_mixer", label: "Stand mixer" },
  { code: "blender", label: "Blender" },
  { code: "food_processor", label: "Food processor" },
  { code: "cast_iron", label: "Cast iron" },
  { code: "dutch_oven", label: "Dutch oven" },
] as const;
export type EquipmentCode = (typeof equipment)[number]["code"];

/**
 * Retailers the user may name as their usual store. Listing a retailer here
 * says NOTHING about pricing or location support — that is decided only by
 * the integrations registry (@kitchen-pantry/integrations).
 */
export const knownRetailers = [
  { slug: "walmart", name: "Walmart" },
  { slug: "kroger", name: "Kroger" },
  { slug: "meijer", name: "Meijer" },
  { slug: "aldi", name: "Aldi" },
  { slug: "target", name: "Target" },
  { slug: "costco", name: "Costco" },
  { slug: "whole_foods", name: "Whole Foods" },
  { slug: "publix", name: "Publix" },
  { slug: "hy_vee", name: "Hy-Vee" },
] as const;
export type RetailerSlug = (typeof knownRetailers)[number]["slug"];

export const storageLocations = [
  { code: "fridge", label: "Fridge" },
  { code: "freezer", label: "Freezer" },
  { code: "pantry", label: "Pantry" },
  { code: "counter", label: "Counter" },
] as const;

/** Rough "how much is left" scale used by the inventory UI. */
export const remainingLevels = [
  { pct: 100, label: "Full" },
  { pct: 75, label: "Most left" },
  { pct: 50, label: "About half" },
  { pct: 25, label: "A little left" },
] as const;

/** Why something left the kitchen. Stored on pantry_transactions. */
export const removalReasons = [
  { code: "consumed", label: "Used it up" },
  { code: "discarded", label: "Threw it out" },
  { code: "expired", label: "Went off" },
] as const;
export type RemovalReason = (typeof removalReasons)[number]["code"];
export type StorageLocation = (typeof storageLocations)[number]["code"];

export const pantryCategories = [
  { code: "protein", label: "Proteins" },
  { code: "produce", label: "Produce" },
  { code: "dairy", label: "Dairy" },
  { code: "grain", label: "Grains" },
  { code: "pasta", label: "Pasta" },
  { code: "rice", label: "Rice" },
  { code: "canned", label: "Canned goods" },
  { code: "frozen", label: "Frozen foods" },
  { code: "spice", label: "Spices" },
  { code: "oil", label: "Oils" },
  { code: "sauce", label: "Sauces" },
  { code: "condiment", label: "Condiments" },
  { code: "baking", label: "Baking ingredients" },
  { code: "other", label: "Other" },
] as const;
export type PantryCategory = (typeof pantryCategories)[number]["code"];

export const groceryDepartments = [
  { code: "produce", label: "Produce" },
  { code: "meat_seafood", label: "Meat & seafood" },
  { code: "dairy", label: "Dairy" },
  { code: "bakery", label: "Bakery" },
  { code: "pantry", label: "Pantry" },
  { code: "frozen", label: "Frozen" },
  { code: "spices", label: "Spices" },
  { code: "other", label: "Other" },
] as const;
export type GroceryDepartment = (typeof groceryDepartments)[number]["code"];

/**
 * How trustworthy a displayed price is. UI must always show this status
 * next to a price; an estimate may never be rendered as verified.
 */
export const priceStatuses = [
  {
    code: "verified",
    label: "Verified",
    description: "Current, store-specific price from an authorized provider.",
  },
  {
    code: "cached",
    label: "Recent",
    description: "Store-specific price retrieved recently; may have changed since.",
  },
  {
    code: "estimated",
    label: "Estimate",
    description: "Typical price — not confirmed for your store.",
  },
  {
    code: "unavailable",
    label: "No price",
    description: "We don't have a price for this item.",
  },
] as const;
export type PriceStatus = (typeof priceStatuses)[number]["code"];

/** Look up a label by code in any catalog above. */
export function labelFor<T extends { code: string; label: string }>(
  catalog: readonly T[],
  code: string,
): string {
  return catalog.find((item) => item.code === code)?.label ?? code;
}
