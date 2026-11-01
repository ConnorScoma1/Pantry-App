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

export interface RecipeIngredient {
  position: number;
  /** Groups ingredients for multi-component dishes, e.g. "Tarragon jus". */
  component: string | null;
  quantity: number | null;
  unit: string | null;
  /** The ingredient itself, e.g. "chicken thighs" — used for pantry and allergen matching. */
  item: string;
  /** "finely chopped", "at room temperature" … */
  preparation: string | null;
  optional: boolean;
}

export interface RecipeStep {
  position: number;
  component: string | null;
  body: string;
  timerSeconds: number | null;
  /** Oven / pan / water temperature, stored in °C. */
  temperatureC: number | null;
  /** Food-safety minimum internal temperature for this step, °C. */
  safeInternalTempC: number | null;
}

export interface RecipeSourceInfo {
  kind: RecipeSourceKind;
  name: string;
  url: string | null;
}

export type RecipeImageLicense = "unsplash" | "pexels" | "cc0" | "cc-by" | "cc-by-sa" | "owned";

/**
 * A photo we have the right to show, with credit. Photos from free-licence
 * libraries usually show a *similar* dish, not our exact recipe — the UI
 * must say so when `representative` is true.
 */
export interface RecipeImage {
  url: string;
  alt: string;
  license: RecipeImageLicense;
  /** Photographer / author, as the licence asks us to credit them. */
  creditName: string;
  creditUrl: string | null;
  /** The photo's own page (where its licence is stated). */
  sourceUrl: string;
  /** True when the photo shows a similar dish rather than this exact recipe. */
  representative: boolean;
}

export interface Recipe {
  id: Uuid;
  slug: string;
  title: string;
  description: string;
  cuisine: Cuisine | null;
  skillLevel: SkillLevel;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  servings: number;
  requiredEquipment: EquipmentCode[];
  tags: string[];
  tips: string[];
  /** Only openly licensed or owned photos, always credited; null shows a typographic tile. */
  image: RecipeImage | null;
  source: RecipeSourceInfo;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

/** Aggregate of real ratings. Absent when nobody has rated the recipe. */
export interface RatingSummary {
  recipeId: Uuid;
  average: number;
  count: number;
  wouldCookAgainPct: number | null;
}

export interface RecipeRating {
  recipeId: Uuid;
  overall: number;
  flavor: number | null;
  difficulty: number | null;
  wouldCookAgain: boolean | null;
  actualMinutes: number | null;
  familyApproval: number | null;
  notes: string | null;
  createdAt: IsoTimestamp;
}

export type RecommendationEventType = "shown" | "opened" | "cooked" | "dismissed" | "undismissed";
export type RecommendationSurface = "home" | "recipes" | "detail" | "plan";

/** Append-only history of how the household responded to a recipe. */
export interface RecommendationEvent {
  recipeId: Uuid;
  event: RecommendationEventType;
  surface: RecommendationSurface;
  createdAt: IsoTimestamp;
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
