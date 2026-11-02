import {
  allergens as allergenCatalog,
  type AllergenCode,
  type CookingMethod,
  type FlavorProfile,
  type Recipe,
  type RecipeCategory,
  type RecipeLibraryInfo,
} from "@kitchen-pantry/shared-types";
import { screenAllergens } from "../allergens";
import { DIET_EXCLUDED_TERMS } from "../eligibility";
import { ingredientLines, recipeProteins } from "../recipes";
import { slugify } from "./ids";

/**
 * Searchable facts about a recipe, worked out from its ingredients and
 * steps the same way for every source: allergens, proteins, diet tags,
 * methods, flavours and categories. Stored at import time (so the database
 * can filter 50,000 recipes), and recomputed here for preview mode.
 */
export interface RecipeFacets {
  allergens: AllergenCode[];
  proteins: string[];
  /** vegetarian, vegan, pescatarian, gluten_free, dairy_free — only when no ingredient says otherwise. */
  dietTags: string[];
  /** Core ingredients ("chicken thigh", "fish sauce"), for pantry matching, reuse and duplicate checks. */
  core: string[];
  /** Sorted core ingredients joined by "|" — two recipes with the same fingerprint are probably the same dish. */
  fingerprint: string;
}

const ALL_ALLERGENS = allergenCatalog.map((a) => a.code) as AllergenCode[];

/** Words that describe an ingredient rather than name it. */
const DESCRIPTORS = new Set(
  (
    "fresh freshly chopped finely roughly coarsely minced diced sliced thinly thickly grated shredded crushed ground-up large small medium extra " +
    "boneless skinless bone-in skin-on bone skin in on lean trimmed whole halved quartered peeled seeded deveined cubed julienned " +
    "kosher fine flaky sea unsalted salted plain organic baby young ripe firm soft hot cold warm room temperature cooked uncooked raw " +
    "virgin extra-virgin light dark packed loosely heaping level good quality best store-bought homemade optional about plus more to taste " +
    "of a an and or for the with into cut pieces piece inch inches"
  ).split(/\s+/),
);

function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => (w.endsWith("ies") && w.length > 4 ? `${w.slice(0, -3)}y` : w.endsWith("oes") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** "2 lb bone-in, skin-on chicken thighs" item → "chicken thigh". */
export function coreIngredient(item: string): string {
  const kept = words(item.split(",")[0] ?? item).filter((w) => !DESCRIPTORS.has(w));
  return kept.slice(-2).join(" ");
}

export function recipeFacets(recipe: Pick<Recipe, "ingredients">): RecipeFacets {
  const lines = ingredientLines(recipe as Recipe);
  const screened = screenAllergens(lines, ALL_ALLERGENS);
  const allergens = [...new Set(screened.conflicts.map((c) => c.allergen))].sort() as AllergenCode[];
  const proteins = recipeProteins(recipe as Recipe);
  const required = recipe.ingredients.filter((i) => !i.optional).map((i) => [i.item, i.preparation].filter(Boolean).join(", "));
  const hits = (terms: readonly string[]) => required.some((line) => terms.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(line)));
  const dietTags: string[] = [];
  if (!hits(DIET_EXCLUDED_TERMS.pescatarian)) dietTags.push("pescatarian");
  if (!hits(DIET_EXCLUDED_TERMS.vegetarian)) dietTags.push("vegetarian");
  if (!hits(DIET_EXCLUDED_TERMS.vegan)) dietTags.push("vegan");
  const requiredAllergens = new Set(screenAllergens(required, ALL_ALLERGENS).conflicts.map((c) => c.allergen));
  if (!requiredAllergens.has("gluten") && !requiredAllergens.has("wheat")) dietTags.push("gluten_free");
  if (!requiredAllergens.has("milk")) dietTags.push("dairy_free");
  const core = [...new Set(recipe.ingredients.filter((i) => !i.optional).map((i) => coreIngredient(i.item)).filter((c) => c && !STAPLE_CORE.has(c)))];
  return { allergens, proteins, dietTags, core, fingerprint: [...core].sort().join("|") };
}

/** Pantry staples that don't make one dish different from another. */
const STAPLE_CORE = new Set(["salt", "black pepper", "pepper", "water", "oil", "olive oil", "vegetable oil", "neutral oil", "sugar", "butter", "flour", "all-purpose flour"]);

// ---------------------------------------------------------------------------
// Methods, flavours and categories (inferred when a source doesn't say)
// ---------------------------------------------------------------------------

const METHOD_WORDS: Array<[CookingMethod, RegExp]> = [
  ["sous_vide", /\bsous[ -]vide\b/i],
  ["pressure_cook", /\b(pressure cook|instant pot|pressure cooker)\b/i],
  ["slow_cook", /\bslow[ -]cooker?\b/i],
  ["smoke", /\bsmoker?\b(?!d)/i],
  ["grill", /\bgrill(ed|ing)?\b/i],
  ["roast", /\broast(ed|ing)?\b/i],
  ["braise", /\bbrais(e|ed|ing)\b/i],
  ["stew", /\b(simmer|stew)(s|ed|ing)?\b/i],
  ["fry", /\b(deep[- ]fry|deep[- ]fried|fry .* (oil|until golden) .*350|350°f oil|oil to 3[5-7]\d)/i],
  ["stir_fry", /\b(stir[- ]fr(y|ied)|wok)\b/i],
  ["pan_fry", /\b(sear|pan[- ]fr(y|ied)|saut[eé]|brown(ed)? (on|the|all))/i],
  ["steam", /\bsteam(ed|ing|er)?\b/i],
  ["poach", /\bpoach(ed|ing)?\b/i],
  ["bake", /\bbake(d|s)?\b/i],
  ["boil", /\b(boil|blanch)(ed|ing)?\b/i],
  ["raw", /\b(cure|cured|ceviche|crudo|tartare|raw|shuck)\b/i],
];

export function inferMethods(recipe: Pick<Recipe, "steps" | "requiredEquipment">): CookingMethod[] {
  const text = recipe.steps.map((s) => s.body).join(" \n ");
  const out = new Set<CookingMethod>(METHOD_WORDS.filter(([, re]) => re.test(text)).map(([m]) => m));
  if (recipe.requiredEquipment.includes("slow_cooker")) out.add("slow_cook");
  if (recipe.requiredEquipment.includes("pressure_cooker")) out.add("pressure_cook");
  if (recipe.requiredEquipment.includes("smoker")) out.add("smoke");
  if (recipe.requiredEquipment.includes("sous_vide")) out.add("sous_vide");
  const heated = recipe.steps.some((s) => s.temperatureC !== null || /\b(heat|cook|oven|boil|simmer|fry|roast|bake|grill|toast|sear)\b/i.test(s.body));
  if (!heated) out.add("no_cook");
  return [...out];
}

const FLAVOR_WORDS: Array<[FlavorProfile, RegExp]> = [
  ["spicy", /\b(chil[ie]|chile|jalape|serrano|habanero|scotch bonnet|cayenne|gochujang|gochugaru|sriracha|sambal|harissa|chipotle|sichuan pepper|red pepper flakes|bird'?s eye)\b/i],
  ["smoky", /\b(smoked|chipotle|smoky|liquid smoke)\b/i],
  ["tangy", /\b(lemon|lime|vinegar|tamarind|sumac|yogurt|buttermilk|pickled|capers)\b/i],
  ["rich", /\b(heavy cream|double cream|cream cheese|mascarpone|coconut milk|ghee|bone marrow|duck fat|cr[eè]me fra[iî]che)\b/i],
  ["fresh", /\b(fresh (basil|cilantro|mint|parsley|dill|chives|tarragon)|basil|cilantro|mint leaves|dill)\b/i],
  ["savory", /\b(soy sauce|tamari|fish sauce|miso|parmesan|parmigiano|anchov|mushroom|dashi|oyster sauce|worcestershire|kombu)\b/i],
  ["aromatic", /\b(cumin|cinnamon|cardamom|garam masala|star anise|cloves?\b(?! garlic)|allspice|ras el hanout|berbere|five[- ]spice|curry powder|turmeric|baharat|za'?atar)\b/i],
];

export function inferFlavors(recipe: Pick<Recipe, "ingredients" | "course">): FlavorProfile[] {
  const text = recipe.ingredients.map((i) => `${i.item} ${i.preparation ?? ""}`).join(" | ");
  const out = FLAVOR_WORDS.filter(([, re]) => re.test(text)).map(([f]) => f);
  if (recipe.course === "dessert") out.push("sweet");
  return [...new Set(out)];
}

const BREAKFAST = /\b(pancake|waffle|omelet|omelette|frittata|granola|oatmeal|porridge|shakshuka|french toast|breakfast|brunch|scrambled|chilaquiles|congee|hash brown)\b/i;

export function inferCategories(recipe: Pick<Recipe, "title" | "course" | "totalMinutes" | "tags" | "requiredEquipment">, methods: readonly CookingMethod[], occasions: readonly string[] = []): RecipeCategory[] {
  const out = new Set<RecipeCategory>();
  const title = recipe.title;
  switch (recipe.course) {
    case "dessert":
      out.add("dessert");
      break;
    case "side":
      out.add("side");
      break;
    case "starter":
      out.add("appetizer");
      break;
    case "sauce":
      out.add("sauce");
      break;
    case "breakfast":
      out.add("breakfast");
      break;
    default:
      out.add("main");
      out.add("dinner");
  }
  if (BREAKFAST.test(title)) out.add("breakfast");
  if (/\b(soup|stew|chowder|bisque|pho|ramen|pozole|gumbo|jjigae|tom yum|broth)\b/i.test(title)) out.add("soup");
  if (/\bsalad|slaw\b/i.test(title)) out.add("salad");
  if (methods.includes("grill") || methods.includes("smoke") || recipe.requiredEquipment.includes("grill") || recipe.requiredEquipment.includes("smoker")) out.add("grilling");
  if (methods.includes("raw") && /\b(oyster|shrimp|crab|lobster|ceviche|crudo|tuna|scallop|clam|sashimi|seafood)\b/i.test(title)) out.add("seafood_raw_bar");
  if (/\b(bread|loaf|focaccia|brioche|biscuit|scone|rolls?|bagel|naan|pita|tortillas?)\b/i.test(title) && methods.includes("bake")) out.add("baking");
  if (recipe.course === "dessert" && methods.includes("bake")) out.add("baking");
  if (recipe.totalMinutes <= 30 && recipe.course === "main") out.add("quick");
  if (occasions.length > 0) out.add("holiday");
  const tags = new Set(recipe.tags.map((t) => t.toLowerCase()));
  for (const [tag, cat] of [
    ["budget", "budget"],
    ["comfort", "comfort"],
    ["kid-friendly", "comfort"],
    ["date-night", "date_night"],
    ["entertaining", "entertaining"],
    ["dinner-party", "entertaining"],
    ["tasting-menu", "tasting_menu"],
    ["lunch", "lunch"],
  ] as const) {
    if (tags.has(tag)) out.add(cat);
  }
  return [...out];
}

/**
 * The dish a recipe is a version of. "Classic Pad Thai", "Easy Pad Thai" and
 * "Pad Thai (Budget)" all → "pad-thai", so the library can tell versions of
 * one dish apart from genuinely different dishes.
 */
const DISH_NOISE = new Set(
  "the a an my our easy quick simple best classic perfect ultimate homemade authentic traditional weeknight budget elevated simplified restaurant style -style recipe one pan one-pan sheet pan sheet-pan 30 minute minutes healthy".split(" "),
);
export function dishKeyFor(title: string): string {
  const cleaned = title
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(\w+)-style\b/gi, " ")
    .split(/\s+/)
    .filter((w) => !DISH_NOISE.has(w.toLowerCase().replace(/[^a-z-]/g, "")))
    .join(" ");
  return slugify(cleaned || title, 60);
}

/** Library details for any recipe, filling in what older data doesn't have. */
const libraryCache = new WeakMap<Recipe, RecipeLibraryInfo>();
export function libraryOf(recipe: Recipe): RecipeLibraryInfo {
  if (recipe.library) return recipe.library;
  const cached = libraryCache.get(recipe);
  if (cached) return cached;
  const methods = inferMethods(recipe);
  const info: RecipeLibraryInfo = {
    status: "pending_review",
    categories: inferCategories(recipe, methods),
    methods,
    flavors: inferFlavors(recipe),
    region: null,
    authenticity: null,
    dishKey: dishKeyFor(recipe.title),
    variant: "classic",
    occasions: [],
    storage: null,
    safetyNote: null,
    license: recipe.source.kind === "original" ? "owned" : "unknown",
  };
  libraryCache.set(recipe, info);
  return info;
}

const facetCache = new WeakMap<Recipe, RecipeFacets>();
export function facetsOf(recipe: Recipe): RecipeFacets {
  const cached = facetCache.get(recipe);
  if (cached) return cached;
  const f = recipeFacets(recipe);
  facetCache.set(recipe, f);
  return f;
}

/** True when the recipe can be cooked (an idea has no instructions yet). */
export function isCookable(recipe: Recipe): boolean {
  const status = libraryOf(recipe).status;
  return status !== "idea" && status !== "retired" && recipe.steps.length > 0 && recipe.ingredients.length > 0;
}
