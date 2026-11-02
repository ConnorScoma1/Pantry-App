import type { RecipeLibraryInfo } from "./library";
import type {
  AllergenCode,
  BudgetInclude,
  BudgetPeriod,
  BudgetPriority,
  CookingGoal,
  CountryCode,
  Cuisine,
  DessertCategory,
  DessertFrequency,
  HolidayCode,
  SeasonalRegionCode,
  RecipeCourse,
  DietaryRestriction,
  DietStyle,
  EquipmentCode,
  GroceryDepartment,
  MealType,
  PantryCategory,
  PlanningMode,
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
  /** Optional dessert planning (spec 05). Frequency and categories are the household's; skill is personal. */
  desserts: DessertSettings;
  /** Seasonal cooking (spec 06): on by default, personal; the region override is the household's. */
  seasonal: SeasonalSettings;
  /**
   * Everyone in the household combined (Supabase mode). `diet` is the
   * signed-in person's own choices; planning uses both, so shared meals
   * are safe for everyone. Absent in preview mode.
   */
  householdDiet?: HouseholdDiet;
}

export interface DessertSettings {
  frequency: DessertFrequency;
  /** Null = same as the regular cooking skill. */
  skillLevel: SkillLevel | null;
  /** Empty = any category. */
  categories: DessertCategory[];
}

export interface SeasonalSettings {
  /** "Enjoy seasonal recipes". Seasons nudge suggestions; they never limit them. */
  enabled: boolean;
  produce: boolean;
  meals: boolean;
  desserts: boolean;
  /** Holiday/occasion recipes — only for the holidays picked in holidayOptIns. */
  holidays: boolean;
  /** Seasonal grocery deals: opt-in; uses live store sale prices only. */
  deals: boolean;
  holidayOptIns: HolidayCode[];
  /** Household override; null = worked out from country and postal code. */
  region: SeasonalRegionCode | null;
}

export interface HouseholdDiet {
  allergies: AllergenCode[];
  restrictions: DietaryRestriction[];
  dislikes: string[];
  neverRecommend: string[];
  memberCount: number;
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
  /** Credit line the licence requires (e.g. CC BY-SA), shown on the recipe. */
  attribution?: string;
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
  /** "dessert" recipes never fill a dinner slot. */
  course: RecipeCourse;
  dessertCategory: DessertCategory | null;
  /** Hands-off chilling/setting time, already included in totalMinutes. */
  chillMinutes: number;
  requiredEquipment: EquipmentCode[];
  tags: string[];
  tips: string[];
  /** Only openly licensed or owned photos, always credited; null shows a typographic tile. */
  image: RecipeImage | null;
  source: RecipeSourceInfo;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** Library details (status, categories, versions…). Absent on older data: treat as not yet reviewed. */
  library?: RecipeLibraryInfo;
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
export type RecommendationSurface = "home" | "recipes" | "detail" | "plan" | "surprise";

/** Append-only history of how the household responded to a recipe. */
export interface RecommendationEvent {
  recipeId: Uuid;
  event: RecommendationEventType;
  surface: RecommendationSurface;
  createdAt: IsoTimestamp;
}

export type MealPlanStatus = "draft" | "active" | "archived";
export type PlanSource = "ai" | "rules" | "manual";

export interface PlannedMeal {
  id: Uuid;
  date: IsoDate;
  mealType: "dinner" | "dessert";
  /** Null for a custom meal ("Leftovers", "Eating out"). */
  recipeId: Uuid | null;
  customTitle: string | null;
  servings: number;
  locked: boolean;
  /** Why this meal is here — short, shown on the card. */
  note: string | null;
}

export interface MealPlan {
  id: Uuid;
  weekStart: IsoDate;
  status: MealPlanStatus;
  mode: PlanningMode;
  /** Set when the household confirms the week; never overwritten silently. */
  confirmedAt: IsoTimestamp | null;
  generatedBy: PlanSource;
  /** Short explanation of the week from the planner (AI or rules). */
  summary: string | null;
  meals: PlannedMeal[];
  updatedAt: IsoTimestamp;
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

/**
 * A line on the household's shared shopping list. Who added or checked it
 * is set by the database from the signed-in session, never by the client.
 */
export interface GroceryItem {
  id: Uuid;
  listId: Uuid;
  name: string;
  department: GroceryDepartment;
  /** Free-text amount, e.g. "1½ lb" or "2 cans". */
  amount: string | null;
  note: string | null;
  /** "plan" lines come from the week's meal plan and are replaced when it changes. */
  source: "manual" | "plan";
  /** Merge key for plan lines (ingredient name, lower-cased). */
  key: string | null;
  neededFor: string[];
  /** Structured amount for package math (plan lines); null for typed items. */
  quantity: Quantity | null;
  checked: boolean;
  addedBy: Uuid | null;
  checkedBy: Uuid | null;
  checkedAt: IsoTimestamp | null;
  position: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** The store a household's grocery list is priced at (Supabase: households.pricing_*). */
export interface PricingStore {
  provider: "kroger";
  storeId: string;
  name: string;
  address: string | null;
  setAt: IsoTimestamp | null;
}

/**
 * Weekly drafts (milestone 11): per household, off by default. `runDay` is
 * an ISO weekday (1 = Monday … 7 = Sunday) in the household's time zone; the
 * draft is for the week starting the following Monday.
 */
export interface WeeklyPlanningSettings {
  enabled: boolean;
  runDay: number;
  runHour: number;
  timeZone: string;
  mode: PlanningMode;
  /** Whose skill and tastes drafts are planned with (allergies and diets are everyone's). */
  enabledByName: string | null;
  enabledByYou: boolean;
}

export type PlanningJobStatus = "running" | "drafted" | "skipped" | "failed";

export interface PlanningJob {
  id: Uuid;
  weekStart: IsoDate;
  mode: PlanningMode;
  status: PlanningJobStatus;
  mealPlanId: Uuid | null;
  message: string | null;
  details: {
    source?: PlanSource;
    specialsUsed?: number;
    storeName?: string | null;
    useSoon?: string[];
    unfilled?: number;
    notes?: string[];
  };
  createdAt: IsoTimestamp;
  finishedAt: IsoTimestamp | null;
}

export interface AppNotification {
  id: Uuid;
  kind: "plan_ready";
  title: string;
  body: string | null;
  /** In-app path, e.g. /plan?week=2026-11-09 */
  link: string | null;
  readAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
}

/** Per person, not per household. */
export interface NotificationPreferences {
  planReadyInApp: boolean;
  planReadyPush: boolean;
}

/** Smart Savings (milestone 12): an item that left the kitchen, from the pantry log. */
export interface PantryOutcome {
  itemName: string;
  reason: "consumed" | "discarded" | "expired";
  /** What the household typed in when adding it; null when unknown (never estimated). */
  pricePaidCents: number | null;
  useBy: IsoDate | null;
  at: IsoTimestamp;
}

/** A shop the household logged: what they actually spent. */
export interface SpendingEntry {
  id: Uuid;
  spentOn: IsoDate;
  amountCents: number;
  storeName: string | null;
  note: string | null;
  /** The ordered Smart Cart this shop was for, if any. */
  cartDraftId: Uuid | null;
  createdAt: IsoTimestamp;
}

/** Shared household part 2: who's eating (milestone 15). */
export interface AttendanceMember {
  userId: Uuid;
  name: string;
  isYou: boolean;
  /** Servings this person usually eats (1 = one serving). */
  portion: number;
}

export interface AttendanceData {
  members: AttendanceMember[];
  /** Explicit answers; no answer means eating. */
  answers: Array<{ day: IsoDate; userId: Uuid; eating: boolean }>;
  guests: Array<{ day: IsoDate; guests: number }>;
}

export type ActivityKind =
  | "pantry_added"
  | "pantry_consumed"
  | "pantry_discarded"
  | "pantry_expired"
  | "grocery_added"
  | "grocery_checked"
  | "rated"
  | "cart_ordered"
  | "shop_logged"
  | "plan_confirmed"
  | "plan_drafted";

export interface ActivityEvent {
  kind: ActivityKind;
  /** "You", a member's name, "A former member", or null (the app itself / unknown). */
  actorName: string | null;
  isYou: boolean;
  at: IsoTimestamp;
  subject: string;
  detail: string | null;
}
