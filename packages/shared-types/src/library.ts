/**
 * The recipe library's vocabulary (milestone 18): world cuisines with their
 * region, categories, cooking methods, flavours, how authentic a version is,
 * and how far a recipe has been checked.
 *
 * Codes are stored in the database; labels are for display. Adding a code is
 * safe; renaming one needs a migration.
 */

/** Every cuisine a recipe can have. `cuisines` (catalog.ts) is the shorter list people pick favourites from. */
export const worldCuisines = [
  // Americas
  { code: "american", label: "American", region: "americas" },
  { code: "southern", label: "Southern / BBQ", region: "americas" },
  { code: "cajun_creole", label: "Cajun & Creole", region: "americas" },
  { code: "tex_mex", label: "Tex-Mex", region: "americas" },
  { code: "hawaiian", label: "Hawaiian", region: "americas" },
  { code: "canadian", label: "Canadian", region: "americas" },
  { code: "mexican", label: "Mexican", region: "americas" },
  { code: "caribbean", label: "Caribbean", region: "americas" },
  { code: "jamaican", label: "Jamaican", region: "americas" },
  { code: "cuban", label: "Cuban", region: "americas" },
  { code: "puerto_rican", label: "Puerto Rican", region: "americas" },
  { code: "peruvian", label: "Peruvian", region: "americas" },
  { code: "argentine", label: "Argentine", region: "americas" },
  { code: "brazilian", label: "Brazilian", region: "americas" },
  { code: "colombian", label: "Colombian", region: "americas" },
  { code: "venezuelan", label: "Venezuelan", region: "americas" },
  { code: "salvadoran", label: "Salvadoran", region: "americas" },
  // Europe
  { code: "italian", label: "Italian", region: "europe" },
  { code: "french", label: "French", region: "europe" },
  { code: "spanish", label: "Spanish", region: "europe" },
  { code: "portuguese", label: "Portuguese", region: "europe" },
  { code: "greek", label: "Greek", region: "europe" },
  { code: "british", label: "British", region: "europe" },
  { code: "irish", label: "Irish", region: "europe" },
  { code: "german", label: "German", region: "europe" },
  { code: "austrian", label: "Austrian", region: "europe" },
  { code: "swiss", label: "Swiss", region: "europe" },
  { code: "scandinavian", label: "Scandinavian", region: "europe" },
  { code: "polish", label: "Polish", region: "europe" },
  { code: "hungarian", label: "Hungarian", region: "europe" },
  { code: "ukrainian", label: "Ukrainian", region: "europe" },
  { code: "russian", label: "Russian", region: "europe" },
  { code: "georgian", label: "Georgian", region: "europe" },
  // Mediterranean, Middle East and North Africa
  { code: "mediterranean", label: "Mediterranean", region: "mena" },
  { code: "middle_eastern", label: "Middle Eastern", region: "mena" },
  { code: "lebanese", label: "Lebanese", region: "mena" },
  { code: "turkish", label: "Turkish", region: "mena" },
  { code: "persian", label: "Persian", region: "mena" },
  { code: "israeli", label: "Israeli", region: "mena" },
  { code: "moroccan", label: "Moroccan", region: "mena" },
  { code: "egyptian", label: "Egyptian", region: "mena" },
  { code: "tunisian", label: "Tunisian", region: "mena" },
  // Sub-Saharan Africa
  { code: "ethiopian", label: "Ethiopian & Eritrean", region: "africa" },
  { code: "nigerian", label: "Nigerian", region: "africa" },
  { code: "ghanaian", label: "Ghanaian", region: "africa" },
  { code: "senegalese", label: "Senegalese", region: "africa" },
  { code: "kenyan", label: "Kenyan", region: "africa" },
  { code: "south_african", label: "South African", region: "africa" },
  // Asia
  { code: "chinese", label: "Chinese", region: "asia" },
  { code: "sichuan", label: "Sichuan", region: "asia" },
  { code: "cantonese", label: "Cantonese", region: "asia" },
  { code: "taiwanese", label: "Taiwanese", region: "asia" },
  { code: "japanese", label: "Japanese", region: "asia" },
  { code: "korean", label: "Korean", region: "asia" },
  { code: "thai", label: "Thai", region: "asia" },
  { code: "vietnamese", label: "Vietnamese", region: "asia" },
  { code: "filipino", label: "Filipino", region: "asia" },
  { code: "indonesian", label: "Indonesian", region: "asia" },
  { code: "malaysian", label: "Malaysian", region: "asia" },
  { code: "singaporean", label: "Singaporean", region: "asia" },
  { code: "burmese", label: "Burmese", region: "asia" },
  { code: "cambodian", label: "Cambodian", region: "asia" },
  { code: "laotian", label: "Lao", region: "asia" },
  { code: "indian", label: "Indian", region: "asia" },
  { code: "pakistani", label: "Pakistani", region: "asia" },
  { code: "bangladeshi", label: "Bangladeshi", region: "asia" },
  { code: "sri_lankan", label: "Sri Lankan", region: "asia" },
  { code: "nepali", label: "Nepali & Tibetan", region: "asia" },
  { code: "afghan", label: "Afghan", region: "asia" },
  { code: "uzbek", label: "Central Asian", region: "asia" },
  // Oceania
  { code: "australian", label: "Australian & New Zealand", region: "oceania" },
  { code: "pacific_islands", label: "Pacific Islands", region: "oceania" },
  // Cross-cutting
  { code: "jewish", label: "Jewish", region: "global" },
  { code: "seafood", label: "Seafood & raw bar", region: "global" },
  { code: "fusion", label: "Fusion", region: "global" },
] as const;
export type WorldCuisine = (typeof worldCuisines)[number]["code"];

export const cuisineRegions = [
  { code: "americas", label: "The Americas" },
  { code: "europe", label: "Europe" },
  { code: "mena", label: "Mediterranean & Middle East" },
  { code: "africa", label: "Africa" },
  { code: "asia", label: "Asia" },
  { code: "oceania", label: "Oceania" },
  { code: "global", label: "Everywhere" },
] as const;
export type CuisineRegion = (typeof cuisineRegions)[number]["code"];

/** Spec 04 §3. A recipe can be in several. */
export const recipeCategories = [
  { code: "breakfast", label: "Breakfast & brunch" },
  { code: "lunch", label: "Lunch" },
  { code: "dinner", label: "Dinner" },
  { code: "appetizer", label: "Appetizers & snacks" },
  { code: "soup", label: "Soups" },
  { code: "salad", label: "Salads" },
  { code: "main", label: "Main courses" },
  { code: "side", label: "Side dishes" },
  { code: "seafood_raw_bar", label: "Seafood & raw bar" },
  { code: "grilling", label: "Grilling, smoking & barbecue" },
  { code: "comfort", label: "Comfort food & family favourites" },
  { code: "quick", label: "Quick weeknight dinners" },
  { code: "budget", label: "Budget meals" },
  { code: "holiday", label: "Holiday & special occasions" },
  { code: "date_night", label: "Date night" },
  { code: "entertaining", label: "Dinner parties & entertaining" },
  { code: "dessert", label: "Desserts & pastry" },
  { code: "baking", label: "Baking & bread" },
  { code: "sauce", label: "Sauces, stocks & condiments" },
  { code: "tasting_menu", label: "Multi-course tasting menus" },
] as const;
export type RecipeCategory = (typeof recipeCategories)[number]["code"];

export const cookingMethods = [
  { code: "roast", label: "Roast" },
  { code: "bake", label: "Bake" },
  { code: "braise", label: "Braise" },
  { code: "stew", label: "Stew & simmer" },
  { code: "grill", label: "Grill" },
  { code: "smoke", label: "Smoke" },
  { code: "fry", label: "Deep-fry" },
  { code: "pan_fry", label: "Pan-fry & sear" },
  { code: "stir_fry", label: "Stir-fry" },
  { code: "steam", label: "Steam" },
  { code: "poach", label: "Poach" },
  { code: "boil", label: "Boil" },
  { code: "raw", label: "Raw & cured" },
  { code: "no_cook", label: "No cooking" },
  { code: "slow_cook", label: "Slow cooker" },
  { code: "pressure_cook", label: "Pressure cooker" },
  { code: "sous_vide", label: "Sous vide" },
] as const;
export type CookingMethod = (typeof cookingMethods)[number]["code"];

export const flavorProfiles = [
  { code: "spicy", label: "Spicy" },
  { code: "smoky", label: "Smoky" },
  { code: "tangy", label: "Bright & tangy" },
  { code: "rich", label: "Rich & creamy" },
  { code: "fresh", label: "Fresh & herby" },
  { code: "savory", label: "Savoury & umami" },
  { code: "sweet", label: "Sweet" },
  { code: "aromatic", label: "Warm spices" },
] as const;
export type FlavorProfile = (typeof flavorProfiles)[number]["code"];

/** How a version relates to the dish's tradition. Spec 04 §1: authentic vs fusion must be clear. */
export const authenticityLevels = [
  { code: "traditional", label: "Traditional", description: "Made the way it's made where it comes from." },
  { code: "regional", label: "Regional style", description: "One region's own version of the dish." },
  { code: "adapted", label: "Adapted", description: "Close to tradition, with swaps for easier-to-find ingredients or home kitchens." },
  { code: "fusion", label: "Fusion", description: "Combines more than one tradition on purpose." },
] as const;
export type Authenticity = (typeof authenticityLevels)[number]["code"];

/** Alternative versions of the same dish (spec 08 §5). */
export const recipeVariants = [
  { code: "classic", label: "Classic" },
  { code: "simplified", label: "Simplified" },
  { code: "budget", label: "Budget-friendly" },
  { code: "elevated", label: "Elevated" },
] as const;
export type RecipeVariant = (typeof recipeVariants)[number]["code"];

/**
 * How far a recipe has been checked (spec 08 §7). Only "tested" may be
 * called tested; "idea" has no instructions and can't be cooked yet.
 */
export const recipeStatuses = [
  { code: "tested", label: "Kitchen-tested", description: "Cooked and checked by a person." },
  { code: "reviewed", label: "Reviewed", description: "A person checked the amounts, steps and food safety." },
  { code: "pending_review", label: "Not yet reviewed", description: "Complete and checked automatically, waiting for a person to review it." },
  { code: "idea", label: "Menu idea", description: "A dish idea without full instructions yet." },
  { code: "retired", label: "Retired", description: "No longer shown." },
] as const;
export type RecipeStatus = (typeof recipeStatuses)[number]["code"];

/** Who the household wants to see: familiar favourites, a mix, or new things (spec 08 §5). */
export const varietyModes = [
  { code: "familiar", label: "Familiar favourites" },
  { code: "balanced", label: "A good mix" },
  { code: "adventurous", label: "Something new" },
] as const;
export type VarietyMode = (typeof varietyModes)[number]["code"];

/** Menu courses, in serving order. */
export const menuCourses = [
  { code: "amuse", label: "Amuse-bouche" },
  { code: "starter", label: "Starter" },
  { code: "raw_bar", label: "Raw bar" },
  { code: "soup", label: "Soup" },
  { code: "salad", label: "Salad" },
  { code: "fish", label: "Fish course" },
  { code: "main", label: "Main" },
  { code: "side", label: "Side" },
  { code: "sauce", label: "Sauce" },
  { code: "palate_cleanser", label: "Palate cleanser" },
  { code: "dessert", label: "Dessert" },
] as const;
export type MenuCourse = (typeof menuCourses)[number]["code"];

/** Library-specific details of a recipe. Optional on `Recipe` so older data keeps working. */
export interface RecipeLibraryInfo {
  status: RecipeStatus;
  categories: RecipeCategory[];
  methods: CookingMethod[];
  flavors: FlavorProfile[];
  /** A region within the cuisine, e.g. "Oaxaca", "Sichuan", "Emilia-Romagna". */
  region: string | null;
  authenticity: Authenticity | null;
  /** The dish this is a version of, e.g. "pad-thai" — used to keep near-duplicates apart and to offer versions. */
  dishKey: string;
  variant: RecipeVariant;
  /** Occasions it suits (holiday codes, "date-night", "game-day"…). */
  occasions: string[];
  /** How to keep and reheat leftovers. */
  storage: string | null;
  /** Food-safety guidance beyond the step temperatures (raw fish, raw eggs, shellfish). */
  safetyNote: string | null;
  /** Licence of the text: owned, cc-by-sa-4.0, public-domain, licensed:<partner>. */
  license: string;
}

/** A menu a household saved (spec 08 §4). */
export interface SavedMenu {
  id: string;
  templateCode: string;
  title: string;
  guests: number;
  budgetCents: number | null;
  serveOn: string | null;
  notes: string | null;
  courses: Array<{ course: MenuCourse; label: string; recipeId: string | null }>;
  createdAt: string;
}
