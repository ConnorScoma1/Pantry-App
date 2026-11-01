import type {
  AllergenCode,
  BudgetInclude,
  BudgetPeriod,
  BudgetPriority,
  CookingGoal,
  CountryCode,
  Cuisine,
  DietaryRestriction,
  DietStyle,
  EquipmentCode,
  GroceryDepartment,
  MealType,
  PantryCategory,
  PriceStatus,
  Protein,
  SkillLevel,
  StorageLocation,
} from "./catalog";

/** ISO-8601 date string, e.g. "2026-11-09". */
export type IsoDate = string;
/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;
export type Uuid = string;

/** Money is always integer cents in a known currency — never floats. */
export interface Money {
  cents: number;
  currency: "USD" | "CAD" | "GBP" | "AUD" | "EUR";
}

// ---------------------------------------------------------------------------
// Onboarding profile — the shape collected by the questionnaire and returned
// by the `get_onboarding_profile()` database function.
// ---------------------------------------------------------------------------

export interface HouseholdSettings {
  country: CountryCode;
  postalCode: string;
  adults: number;
  children: number;
  /** People cooked for at a typical dinner (may differ from household size). */
  cookingFor: number;
  dinnersPerWeek: number;
  mealsIncluded: MealType[];
  /** Per-meal servings when different from `cookingFor`, e.g. lunch for 1. */
  servingsByMeal: Partial<Record<MealType, number>>;
}

export interface BudgetSettings {
  /** null = no strict budget. */
  amountCents: number | null;
  period: BudgetPeriod;
  includes: BudgetInclude[];
  priority: BudgetPriority;
}

export interface GoalSettings {
  /** Ordered most → least important. */
  ranked: CookingGoal[];
}

export interface NutritionTargets {
  caloriesPerDay: number | null;
  proteinGramsPerDay: number | null;
}

export interface DietSettings {
  /** Strict exclusions, including aliases and cross-contact warnings. */
  allergies: AllergenCode[];
  style: DietStyle;
  restrictions: DietaryRestriction[];
  dislikes: string[];
  neverRecommend: string[];
  cuisines: Cuisine[];
  proteins: Protein[];
  nutrition: NutritionTargets;
}

export interface StoreSettings {
  /** Free-text/slug preference only — not a claim of integration support. */
  usualRetailer: string | null;
  /** Set only when a supported integration returned a real store location. */
  storeLocationId: Uuid | null;
}

export interface OnboardingProfile {
  household: HouseholdSettings;
  budget: BudgetSettings;
  goals: GoalSettings;
  diet: DietSettings;
  skillLevel: SkillLevel;
  equipment: EquipmentCode[];
  store: StoreSettings;
}

// ---------------------------------------------------------------------------
// Inventory, recipes, pricing — used from Phase 2 onward. Defined now so the
// database schema and engines share one vocabulary.
// ---------------------------------------------------------------------------

/** Base units every quantity normalises to. */
export type BaseUnit = "g" | "ml" | "each";

export interface Quantity {
  value: number;
  unit: string;
}

export interface PantryItem {
  id: Uuid;
  ingredientId: Uuid | null;
  name: string;
  category: PantryCategory;
  /** Null = "have it" without tracking an amount (e.g. salt). */
  quantity: number | null;
  unit: string | null;
  storageLocation: StorageLocation;
  purchasedOn: IsoDate | null;
  useBy: IsoDate | null;
  openedOn: IsoDate | null;
  /** Rough amount left, 0–100. */
  estimatedRemainingPct: number | null;
  pricePaidCents: number | null;
  isStaple: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** A canonical ingredient from the catalogue (search results, staples). */
export interface IngredientOption {
  id: Uuid | null;
  name: string;
  category: PantryCategory;
  defaultUnit: string;
  storageLocation: StorageLocation;
}

export type RecipeSourceKind =
  | "licensed_api"
  | "partner"
  | "user_submitted"
  | "original"
  | "editorial"
  | "ai_generated";

export interface RecipeSummary {
  id: Uuid;
  title: string;
  imageUrl: string | null;
  cuisine: Cuisine | null;
  skillLevel: SkillLevel;
  totalMinutes: number | null;
  servings: number;
  requiredEquipment: EquipmentCode[];
  sourceKind: RecipeSourceKind;
  /** Only real, verified ratings. null when there are none — never invented. */
  rating: { average: number; count: number } | null;
}

export interface PriceQuote {
  status: PriceStatus;
  packagePrice: Money | null;
  unitPrice: Money | null;
  /** When the provider reported the price. Required unless status = unavailable. */
  observedAt: IsoTimestamp | null;
  provider: string;
  /** True for sample data — UI shows a "Sample data" badge. */
  isMock: boolean;
}

export interface GroceryListItem {
  id: Uuid;
  name: string;
  department: GroceryDepartment;
  required: Quantity;
  purchase: Quantity;
  price: PriceQuote;
  isChecked: boolean;
  isOwned: boolean;
}
