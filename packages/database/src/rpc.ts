/**
 * @kitchen-pantry/database — the boundary between app code and Postgres.
 *
 * Phase 1 talks to the database through two RPCs (save/get onboarding
 * profile) so the multi-table write is atomic and runs under RLS. Every
 * value crossing this boundary is validated with the shared zod schemas.
 *
 * Generated table types: run `npm run db:types` (with `supabase start`
 * running) to write src/database.types.ts, then pass `Database` as the
 * generic to createClient for fully-typed queries.
 */
import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import { onboardingProfileSchema } from "@kitchen-pantry/validation";

export const rpc = {
  saveOnboardingProfile: "save_onboarding_profile",
  getOnboardingProfile: "get_onboarding_profile",
  getHouseholdOnboardingDraft: "get_household_onboarding_draft",
  setSkillLevel: "set_skill_level",
  resetLearnedPreferences: "reset_learned_preferences",
  recipeRatingSummary: "recipe_rating_summary",
} as const;

export const tables = {
  profiles: "profiles",
  households: "households",
  householdMembers: "household_members",
  userPreferences: "user_preferences",
  householdAllergies: "household_allergies",
  dietaryRestrictions: "dietary_restrictions",
  householdEquipment: "household_equipment",
  pantryItems: "pantry_items",
  pantryTransactions: "pantry_transactions",
  ingredients: "ingredients",
  recipes: "recipes",
  recipeIngredients: "recipe_ingredients",
  recipeInstructions: "recipe_instructions",
  recipeSources: "recipe_sources",
  recipeRatings: "recipe_ratings",
  userFavorites: "user_favorites",
  mealPlans: "meal_plans",
  plannedMeals: "planned_meals",
  groceryLists: "grocery_lists",
  groceryListItems: "grocery_list_items",
  retailers: "retailers",
  storeLocations: "store_locations",
  retailerProducts: "retailer_products",
  productPriceObservations: "product_price_observations",
  ingredientProductMappings: "ingredient_product_mappings",
  cookingHistory: "cooking_history",
  allergens: "allergens",
  equipment: "equipment",
} as const;

/** Validate and normalise a profile before sending it to save_onboarding_profile. */
export function toSaveProfilePayload(input: unknown): { profile: OnboardingProfile } {
  return { profile: onboardingProfileSchema.parse(input) };
}

/**
 * Parse the jsonb returned by get_onboarding_profile. Returns null for a
 * user who hasn't finished onboarding or if stored data no longer matches
 * the current schema (the UI then re-runs onboarding rather than crashing).
 */
export function parseStoredProfile(value: unknown): OnboardingProfile | null {
  if (value === null || value === undefined) return null;
  const result = onboardingProfileSchema.safeParse(value);
  return result.success ? result.data : null;
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  active_household_id: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}
