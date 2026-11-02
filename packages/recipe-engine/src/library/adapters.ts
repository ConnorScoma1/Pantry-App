import type { LibraryIngredientInput, LibraryRecipe, LibraryRecipeInput, LibraryStepInput } from "./import";
import { formatIngredientLine } from "../recipes";
import { normalizeUnit, parseQuantity } from "./units";

/**
 * Source adapters: turn a licensed feed into the library's import format.
 * Many partners deliver schema.org/Recipe JSON (the format recipe sites
 * embed for search engines). This adapter reads files a partner gave us —
 * it never fetches pages, and having a schema.org file doesn't make the
 * content licensed: the source's licence is declared separately.
 */

const UNIT_WORDS =
  "teaspoons?|tsps?|t|tablespoons?|tbsps?|tbs|T|cups?|c|fluid ounces?|fl\\.? oz|pints?|pt|quarts?|qt|gallons?|ml|milliliters?|millilitres?|l|liters?|litres?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|pinch(?:es)?|dash(?:es)?|drops?|cloves?|cans?|tins?|sprigs?|bunch(?:es)?|slices?|sticks?|sheets?|heads?|pieces?|packages?|pkg|packets?|jars?|stalks?|leaves|fillets?";
const LINE = new RegExp(
  `^\\s*((?:\\d+\\s+)?\\d+(?:[./]\\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞]|\\d+\\s*[½⅓⅔¼¾⅛⅜⅝⅞])?\\s*(?:-\\s*\\d+(?:[./]\\d+)?\\s*)?(?:\\((?:[^)]*)\\)\\s*)?(?:(${UNIT_WORDS})\\.?\\s+)?(.+)$`,
  "i",
);

/** "1 1/2 cups all-purpose flour, sifted" → { quantity: 1.5, unit: "cup", item: "all-purpose flour", preparation: "sifted" }. */
export function parseIngredientLine(line: string): LibraryIngredientInput {
  const text = line.replace(/\s+/g, " ").trim();
  const optional = /\(optional\)|,?\s*optional$/i.test(text);
  const clean = text.replace(/\(optional\)|,?\s*optional$/i, "").trim();
  const m = LINE.exec(clean);
  if (!m) return { quantity: null, unit: null, item: clean, optional };
  const qty = m[1] ? parseQuantity(m[1].replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞])/, "$1 $2")) : null;
  const unit = m[2] ? normalizeUnit(m[2]) : null;
  const rest = m[3]!.replace(/^of\s+/i, "");
  const [item, ...prep] = rest.split(",");
  const toTaste = /\bto taste\b/i.test(rest);
  return {
    quantity: qty ?? null,
    unit: unit ?? null,
    item: (item ?? rest).replace(/\bto taste\b/i, "").trim(),
    preparation: prep.join(",").trim() || null,
    optional: optional || toTaste,
  };
}

/** ISO 8601 duration ("PT1H30M") → minutes. */
export function isoMinutes(value: unknown): number {
  if (typeof value !== "string") return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(value.trim());
  if (!m) return 0;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

function steps(instructions: unknown): LibraryStepInput[] {
  const out: LibraryStepInput[] = [];
  const walk = (node: unknown, section: string | null) => {
    if (typeof node === "string") {
      for (const part of node.split(/\n+/).map((p) => p.trim()).filter(Boolean)) out.push({ body: part, component: section });
    } else if (Array.isArray(node)) node.forEach((n) => walk(n, section));
    else if (node && typeof node === "object") {
      const o = node as Json;
      if (o["@type"] === "HowToSection") walk(o.itemListElement, str(o.name) || section);
      else if (typeof o.text === "string") out.push({ body: o.text, component: section });
    }
  };
  walk(instructions, null);
  return out;
}

/**
 * One schema.org/Recipe object → import record. Fields the library needs
 * but schema.org doesn't carry (difficulty, equipment, safe temperatures)
 * come from `defaults` or are left for the validator to flag.
 */
export function fromSchemaOrg(recipe: Json, defaults: Partial<LibraryRecipeInput> & { cuisine: string; skillLevel: number }): LibraryRecipeInput {
  const yieldText = str(recipe.recipeYield);
  const servings = Number(/(\d+)/.exec(yieldText)?.[1] ?? defaults.servings ?? 4);
  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []).filter((x): x is string => typeof x === "string").map(parseIngredientLine);
  return {
    ...defaults,
    externalId: str(recipe["@id"]) || str(recipe.identifier) || str(recipe.url) || str(recipe.name),
    title: str(recipe.name),
    description: str(recipe.description),
    prepMinutes: isoMinutes(recipe.prepTime) || defaults.prepMinutes,
    cookMinutes: isoMinutes(recipe.cookTime) || defaults.cookMinutes,
    servings,
    tags: [...(defaults.tags ?? []), ...str(recipe.keywords).split(",").map((k) => k.trim()).filter(Boolean)].slice(0, 20),
    ingredients,
    steps: steps(recipe.recipeInstructions),
  };
}

/** The JSON the database's import_recipe_batch() expects for one prepared recipe. */
export function toImportPayload(r: LibraryRecipe, sourceUrl: string | null = null): Json {
  return {
    id: r.id,
    externalId: r.externalId,
    sourceUrl,
    title: r.title,
    slug: r.slug,
    description: r.description,
    cuisine: r.cuisine,
    skillLevel: r.skillLevel,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    totalMinutes: r.totalMinutes,
    servings: r.servings,
    course: r.course,
    dessertCategory: r.dessertCategory,
    chillMinutes: r.chillMinutes,
    equipment: r.requiredEquipment,
    tags: r.tags,
    tips: r.tips,
    image: r.image,
    nutrition: r.nutrition,
    status: r.library.status,
    categories: r.library.categories,
    methods: r.library.methods,
    flavors: r.library.flavors,
    occasions: r.library.occasions,
    region: r.library.region,
    authenticity: r.library.authenticity,
    dishKey: r.library.dishKey,
    variant: r.library.variant,
    storage: r.library.storage,
    safetyNote: r.library.safetyNote,
    license: r.library.license,
    attribution: r.attribution,
    review: r.review,
    allergens: r.facets.allergens,
    proteins: r.facets.proteins,
    dietTags: r.facets.dietTags,
    core: r.facets.core,
    fingerprint: r.facets.fingerprint,
    ingredients: r.ingredients.map((i) => ({ ...i, rawText: formatIngredientLine(i) })),
    steps: r.steps,
  };
}
