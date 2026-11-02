import {
  authenticityLevels,
  cookingMethods,
  dessertCategories,
  equipment as equipmentCatalog,
  flavorProfiles,
  holidays,
  recipeCategories,
  recipeCourses,
  recipeVariants,
  worldCuisines,
  type Authenticity,
  type CookingMethod,
  type EquipmentCode,
  type FlavorProfile,
  type Recipe,
  type RecipeCategory,
  type RecipeCourse,
  type RecipeImage,
  type RecipeIngredient,
  type RecipeLibraryInfo,
  type RecipeSourceKind,
  type RecipeStatus,
  type RecipeStep,
  type RecipeVariant,
  type SkillLevel,
} from "@kitchen-pantry/shared-types";
import { dishKeyFor, inferCategories, inferFlavors, inferMethods, recipeFacets, type RecipeFacets } from "./facets";
import { slugify, stableUuid } from "./ids";
import { MAX_COUNT_WITHOUT_UNIT, normalizeUnit, parseQuantity, UNITS } from "./units";

/**
 * The library's import format and its validator (spec 08 §6–7, §10).
 *
 * Every source — the Test Kitchen, a licensed partner feed, a public-domain
 * collection, an AI draft — is converted to `LibraryRecipeInput` first, then
 * goes through `prepareRecipe`, which:
 *   - rejects records with missing or implausible data (errors), and notes
 *     things worth a reviewer's eye (warnings);
 *   - standardises units, parses quantities, converts °F to °C;
 *   - enforces USDA safe internal temperatures and requires a safety note
 *     for raw fish, shellfish and meat;
 *   - works out allergens, diet tags, proteins, methods and flavours from the
 *     ingredients (never trusting a source's own claim alone);
 *   - caps the status: a feed can't mark anything "tested" or "reviewed"
 *     (a reviewer does that afterwards), so imports are "pending_review";
 *   - drops photos and nutrition that don't say where they came from.
 * It never fetches anything: inputs come from files someone is licensed to use.
 */

export interface LibraryIngredientInput {
  component?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  item: string;
  preparation?: string | null;
  optional?: boolean;
}

export interface LibraryStepInput {
  component?: string | null;
  body: string;
  minutes?: number | null;
  tempF?: number | null;
  tempC?: number | null;
  /** Safe internal temperature for this step (USDA), °F or °C. */
  safeF?: number | null;
  safeC?: number | null;
}

export type TextLicense = "owned" | "public-domain" | "cc0" | "cc-by-4.0" | "cc-by-sa-4.0" | `licensed:${string}`;

export interface LibraryRecipeInput {
  /** The source's own id; with the source name it makes the recipe's stable id. */
  externalId: string;
  title: string;
  description?: string;
  cuisine: string;
  region?: string | null;
  authenticity?: Authenticity | null;
  dishKey?: string | null;
  variant?: RecipeVariant;
  course?: RecipeCourse;
  dessertCategory?: string | null;
  categories?: string[];
  methods?: string[];
  flavors?: string[];
  occasions?: string[];
  skillLevel: number;
  prepMinutes?: number;
  cookMinutes?: number;
  chillMinutes?: number;
  servings?: number;
  equipment?: string[];
  tags?: string[];
  tips?: string[];
  storage?: string | null;
  safetyNote?: string | null;
  ingredients?: LibraryIngredientInput[];
  steps?: LibraryStepInput[];
  /** Ingredient allergens the source declares; merged with what the ingredients show. */
  declaredAllergens?: string[];
  nutrition?: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number; source?: string } | null;
  image?: Partial<RecipeImage> | null;
  /** "idea" or "pending_review" (default). "tested"/"reviewed" are set by a reviewer after import, never by a feed. */
  status?: RecipeStatus;
}

export interface LibrarySourceInput {
  name: string;
  kind: RecipeSourceKind;
  url?: string | null;
  license: TextLicense;
  /** Required for CC BY / CC BY-SA and most partner licences. */
  attribution?: string | null;
}

export interface ImportIssue {
  field: string;
  message: string;
}

/** A recipe ready for the library, with the facts the database stores for search. */
export interface LibraryRecipe extends Recipe {
  library: RecipeLibraryInfo;
  facets: RecipeFacets;
  externalId: string;
  nutrition: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; source: string } | null;
  attribution: string | null;
  review: { by: string; at: string } | null;
}

export type PrepareResult =
  | { ok: true; recipe: LibraryRecipe; warnings: ImportIssue[] }
  | { ok: false; errors: ImportIssue[]; warnings: ImportIssue[] };

const codesOf = <T extends { code: string }>(list: readonly T[]) => new Set<string>(list.map((x) => x.code));
const CUISINES = codesOf(worldCuisines);
const CATEGORIES = codesOf(recipeCategories);
const METHODS = codesOf(cookingMethods);
const FLAVORS = codesOf(flavorProfiles);
const EQUIPMENT = codesOf(equipmentCatalog);
const COURSES = codesOf(recipeCourses);
const VARIANTS = codesOf(recipeVariants);
const AUTHENTICITY = codesOf(authenticityLevels);
const DESSERT_CATEGORIES = codesOf(dessertCategories);
const OCCASIONS = new Set<string>([...holidays.map((h) => h.code), "date-night", "game-day", "birthday", "anniversary", "picnic", "potluck", "brunch-party", "dinner-party"]);
const IMAGE_LICENSES = new Set(["unsplash", "pexels", "cc0", "cc-by", "cc-by-sa", "owned"]);
const LICENSE_RE = /^(owned|public-domain|cc0|cc-by-4\.0|cc-by-sa-4\.0|licensed:[a-z0-9][a-z0-9 ._-]{1,60})$/i;

const fToC = (f: number): number => Math.round((((f - 32) * 5) / 9) * 10) / 10;

/** USDA minimum internal temperatures, °C. */
export const SAFE_MIN_C = { wholeCut: 62.8, ground: 71.1, poultry: 73.9 } as const;

const POULTRY = /\b(chicken|turkey|duck|goose|quail|cornish hen|poussin)\b/i;
const GROUND = /\b(ground|minced?)\s+(beef|pork|lamb|veal|turkey|chicken|meat|bison|goat)\b|\b(raw sausage|sausage meat|meatballs?|burger patt)/i;
const WHOLE_MEAT = /\b(beef|steak|pork|lamb|veal|goat|venison|bison|brisket|short ribs?|oxtail|chuck|sirloin|ribeye|tenderloin|pork shoulder|pork belly|loin|chops?|leg of lamb|prime rib)\b/i;
const FISH = /\b(salmon|cod|tuna|halibut|trout|snapper|sea bass|branzino|tilapia|catfish|mackerel|sardines?|swordfish|mahi|haddock|sole|flounder|monkfish|fish fillets?|whitefish|pollock)\b/i;
const SHELLFISH = /\b(shrimp|prawns?|scallops?|crab|lobster|mussels?|clams?|oysters?|octopus|squid|calamari|crawfish|langoustines?)\b/i;
/** Already cooked, cured or shelf-stable forms that don't need a cooking temperature. */
const READY = /\b(cooked|rotisserie|leftover|smoked salmon|lox|canned|tinned|cured|prosciutto|salami|pepperoni|ham\b|bacon bits|broth|stock|bouillon|sauce|paste|dried shrimp|bonito|anchov|jerky|deli|stock cube|gelatin|fat\b|lard|drippings|cheese|milk|yogurt|butter|demi-glace|consomm[eé])\b/i;

function issue(list: ImportIssue[], field: string, message: string) {
  list.push({ field, message });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

const MARKUP = /<\/?[a-z][^>]*>|javascript:|https?:\/\//i;

function int(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

/**
 * Validate and normalise one record. `source` describes where the whole
 * batch came from; the recipe's id is stable for (source, externalId).
 */
export function prepareRecipe(input: LibraryRecipeInput, source: LibrarySourceInput): PrepareResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  // --- Source and licence --------------------------------------------------
  if (!cleanText(source.name, 120)) issue(errors, "source.name", "The source needs a name.");
  if (!LICENSE_RE.test(source.license ?? "")) issue(errors, "source.license", "Say what licence the recipe text is under (owned, public-domain, cc0, cc-by-4.0, cc-by-sa-4.0 or licensed:<partner>).");
  if (/^cc-by/i.test(source.license) && !cleanText(source.attribution, 300)) issue(errors, "source.attribution", "Creative Commons recipes must carry their attribution.");

  // --- Identity --------------------------------------------------------------
  const externalId = cleanText(input.externalId, 200);
  if (!externalId) issue(errors, "externalId", "Each record needs the source's own id.");
  const title = cleanText(input.title, 160);
  if (title.length < 2) issue(errors, "title", "A recipe needs a title.");
  if (MARKUP.test(title)) issue(errors, "title", "Titles can't contain links or markup.");
  const description = cleanText(input.description, 600);
  if (MARKUP.test(description)) issue(errors, "description", "Descriptions can't contain links or markup.");
  if (!CUISINES.has(input.cuisine)) issue(errors, "cuisine", `Unknown cuisine "${String(input.cuisine)}".`);

  const course = (input.course ?? "main") as RecipeCourse;
  if (!COURSES.has(course)) issue(errors, "course", `Unknown course "${String(input.course)}".`);
  const dessertCategory = course === "dessert" ? (input.dessertCategory ?? "plated") : null;
  if (dessertCategory !== null && !DESSERT_CATEGORIES.has(dessertCategory)) issue(errors, "dessertCategory", `Unknown dessert category "${dessertCategory}".`);

  const skill = int(input.skillLevel, 0);
  if (skill < 1 || skill > 5) issue(errors, "skillLevel", "Difficulty must be 1 (beginner) to 5 (professional).");
  const prep = int(input.prepMinutes, 0);
  const cook = int(input.cookMinutes, 0);
  const chill = int(input.chillMinutes, 0);
  for (const [field, v] of [["prepMinutes", prep], ["cookMinutes", cook], ["chillMinutes", chill]] as const) {
    if (v < 0 || v > 2880) issue(errors, field, "Times must be between 0 and 48 hours.");
  }
  const servings = int(input.servings, 4);
  if (servings < 1 || servings > 50) issue(errors, "servings", "Servings must be between 1 and 50.");

  const equipment = [...new Set(input.equipment ?? [])];
  for (const e of equipment) if (!EQUIPMENT.has(e)) issue(errors, "equipment", `Unknown equipment "${e}".`);

  // --- Ingredients -------------------------------------------------------------
  const rawIngredients = input.ingredients ?? [];
  const rawSteps = input.steps ?? [];
  const isIdea = input.status === "idea" || (rawSteps.length === 0 && rawIngredients.length === 0);
  if (!isIdea) {
    if (rawIngredients.length < 2) issue(errors, "ingredients", "A complete recipe needs at least two ingredients.");
    if (rawSteps.length < 2) issue(errors, "steps", "A complete recipe needs at least two steps.");
  }
  if (rawIngredients.length > 80) issue(errors, "ingredients", "More than 80 ingredients — split it into components or recipes.");
  if (rawSteps.length > 60) issue(errors, "steps", "More than 60 steps — split it into components or recipes.");

  const ingredients: RecipeIngredient[] = [];
  rawIngredients.forEach((raw, idx) => {
    const field = `ingredients[${idx}]`;
    const item = cleanText(raw.item, 160);
    if (!item) {
      issue(errors, field, "Each ingredient needs a name.");
      return;
    }
    if (MARKUP.test(item)) issue(errors, field, "Ingredients can't contain links or markup.");
    const unit = normalizeUnit(raw.unit);
    if (unit === undefined) issue(errors, `${field}.unit`, `Unknown unit "${String(raw.unit)}" for ${item}.`);
    const quantity = parseQuantity(raw.quantity);
    if (quantity === undefined) issue(errors, `${field}.quantity`, `Can't read the amount "${String(raw.quantity)}" for ${item}.`);
    else if (quantity !== null) {
      const max = unit ? (UNITS[unit]?.max ?? 0) : MAX_COUNT_WITHOUT_UNIT;
      if (quantity <= 0) issue(errors, `${field}.quantity`, `The amount for ${item} must be more than zero.`);
      else if (quantity > max) issue(errors, `${field}.quantity`, `${quantity} ${unit ?? ""} of ${item} looks like a typo.`);
    } else if (unit && unit !== "pinch" && unit !== "dash") {
      issue(errors, `${field}.quantity`, `${item} has a unit but no amount.`);
    }
    ingredients.push({
      position: ingredients.length + 1,
      component: cleanText(raw.component, 80) || null,
      quantity: quantity ?? null,
      unit: unit ?? null,
      item,
      preparation: cleanText(raw.preparation, 160) || null,
      optional: Boolean(raw.optional),
    });
  });

  // --- Steps ------------------------------------------------------------------
  const steps: RecipeStep[] = [];
  rawSteps.forEach((raw, idx) => {
    const field = `steps[${idx}]`;
    const body = cleanText(raw.body, 1500);
    if (body.length < 8) {
      issue(errors, field, "Each step needs real instructions.");
      return;
    }
    if (MARKUP.test(body)) issue(errors, field, "Steps can't contain links or markup.");
    const tempC = typeof raw.tempC === "number" ? raw.tempC : typeof raw.tempF === "number" ? fToC(raw.tempF) : null;
    const safeC = typeof raw.safeC === "number" ? raw.safeC : typeof raw.safeF === "number" ? fToC(raw.safeF) : null;
    if (tempC !== null && (tempC < -30 || tempC > 320)) issue(errors, `${field}.temp`, "That cooking temperature looks wrong.");
    if (safeC !== null && (safeC < 50 || safeC > 100)) issue(errors, `${field}.safe`, "That safe internal temperature looks wrong.");
    const minutes = typeof raw.minutes === "number" ? raw.minutes : null;
    if (minutes !== null && (minutes <= 0 || minutes > 2880)) issue(errors, `${field}.minutes`, "Step timers must be between 1 minute and 48 hours.");
    steps.push({
      position: steps.length + 1,
      component: cleanText(raw.component, 80) || null,
      body,
      timerSeconds: minutes ? Math.round(minutes * 60) : null,
      temperatureC: tempC,
      safeInternalTempC: safeC,
    });
  });

  // --- Inferred and declared tags ---------------------------------------------
  const pick = <T extends string>(values: string[] | undefined, allowed: Set<string>, field: string): T[] => {
    const out: T[] = [];
    for (const v of values ?? []) {
      if (allowed.has(v)) out.push(v as T);
      else issue(warnings, field, `Ignored unknown ${field.replace(/s$/, "")} "${v}".`);
    }
    return [...new Set(out)];
  };
  const totalMinutes = prep + cook + chill;
  const draft: Recipe = {
    id: "",
    slug: "",
    title,
    description,
    cuisine: input.cuisine as Recipe["cuisine"],
    skillLevel: (Math.min(5, Math.max(1, skill)) || 1) as SkillLevel,
    prepMinutes: prep,
    cookMinutes: cook,
    totalMinutes,
    servings,
    course,
    dessertCategory: dessertCategory as Recipe["dessertCategory"],
    chillMinutes: chill,
    requiredEquipment: equipment.filter((e) => EQUIPMENT.has(e)) as EquipmentCode[],
    tags: [...new Set((input.tags ?? []).map((t) => slugify(t, 40)).filter(Boolean))].slice(0, 20),
    tips: (input.tips ?? []).map((t) => cleanText(t, 300)).filter(Boolean).slice(0, 8),
    image: null,
    source: { kind: source.kind, name: cleanText(source.name, 120), url: source.url ?? null },
    ingredients,
    steps,
  };
  const occasions = pick<string>(input.occasions, OCCASIONS, "occasions");
  const methods = input.methods?.length ? pick<CookingMethod>(input.methods, METHODS, "methods") : inferMethods(draft);
  const flavors = input.flavors?.length ? pick<FlavorProfile>(input.flavors, FLAVORS, "flavors") : inferFlavors(draft);
  const categories = [...new Set([...pick<RecipeCategory>(input.categories, CATEGORIES, "categories"), ...inferCategories(draft, methods, occasions)])];
  if (input.authenticity && !AUTHENTICITY.has(input.authenticity)) issue(errors, "authenticity", `Unknown authenticity "${input.authenticity}".`);
  const variant = (input.variant ?? "classic") as RecipeVariant;
  if (!VARIANTS.has(variant)) issue(errors, "variant", `Unknown version "${String(input.variant)}".`);
  const facets = recipeFacets(draft);

  // --- Food safety ----------------------------------------------------------
  if (!isIdea) foodSafety(draft, methods, cleanText(input.safetyNote, 400), errors, warnings);

  // --- Allergens the source declares must agree with the ingredients ----------
  const declared = (input.declaredAllergens ?? []).filter((a) => typeof a === "string");
  const missingFromDeclared = facets.allergens.filter((a) => declared.length > 0 && !declared.includes(a));
  if (missingFromDeclared.length) issue(warnings, "declaredAllergens", `The ingredients also contain ${missingFromDeclared.join(", ")}; those are added.`);
  const extraDeclared = declared.filter((a) => !facets.allergens.includes(a as never));
  if (extraDeclared.length) {
    issue(warnings, "declaredAllergens", `The source lists ${extraDeclared.join(", ")} that the ingredients don't show; kept to be safe.`);
    facets.allergens = [...new Set([...facets.allergens, ...(extraDeclared as typeof facets.allergens)])].sort();
  }

  // --- Status ---------------------------------------------------------------
  // Feeds can't mark anything tested or reviewed: a person does that afterwards,
  // in the database, once they've cooked or checked it.
  let status: RecipeStatus = isIdea ? "idea" : (input.status ?? "pending_review");
  if (status === "idea" && !isIdea) status = "pending_review";
  if (status === "tested" || status === "reviewed") {
    issue(warnings, "status", `Imported as not yet reviewed: "${status}" is set by a reviewer after import, not by a feed.`);
    status = "pending_review";
  }
  if (status === "retired") issue(warnings, "status", "Imported as retired: it won't be shown.");
  const review = null;

  // --- Photo and nutrition: only with provenance ----------------------------
  let image: RecipeImage | null = null;
  if (input.image) {
    const i = input.image;
    const https = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s<>"]+$/.test(u);
    if (https(i.url) && i.license && IMAGE_LICENSES.has(i.license) && https(i.sourceUrl) && (i.creditUrl == null || https(i.creditUrl)) && (i.license === "owned" || i.creditName)) {
      image = { url: i.url!, alt: cleanText(i.alt, 200), license: i.license, creditName: cleanText(i.creditName, 120), creditUrl: i.creditUrl ?? null, sourceUrl: i.sourceUrl!, representative: i.representative ?? true };
    } else issue(warnings, "image", "Photo dropped: it needs an https URL, a licence we accept, a source page and a credit.");
  }
  let nutrition: LibraryRecipe["nutrition"] = null;
  if (input.nutrition) {
    const n = input.nutrition;
    if (n.source && cleanText(n.source, 80)) {
      const val = (v: number | undefined, max: number) => (typeof v === "number" && v >= 0 && v <= max ? Math.round(v * 10) / 10 : null);
      nutrition = { calories: val(n.calories, 5000), proteinG: val(n.proteinG, 400), carbsG: val(n.carbsG, 800), fatG: val(n.fatG, 400), source: cleanText(n.source, 80) };
    } else issue(warnings, "nutrition", "Nutrition dropped: say how it was calculated (e.g. usda-fdc).");
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  const dishKey = slugify(input.dishKey ?? "", 60) || dishKeyFor(title);
  const id = stableUuid(`${draft.source.name}\u0000${externalId}`);
  const slug = slugify(`${title}${variant !== "classic" ? `-${variant}` : ""}`, 72) + `-${id.slice(0, 6)}`;
  const library: RecipeLibraryInfo = {
    status,
    categories,
    methods,
    flavors,
    region: cleanText(input.region, 60) || null,
    authenticity: (input.authenticity as Authenticity | undefined) ?? null,
    dishKey,
    variant,
    occasions,
    storage: cleanText(input.storage, 400) || null,
    safetyNote: cleanText(input.safetyNote, 400) || null,
    license: source.license,
  };
  return {
    ok: true,
    warnings,
    recipe: {
      ...draft,
      id,
      slug,
      image,
      library,
      facets,
      externalId,
      nutrition,
      attribution: cleanText(source.attribution, 300) || null,
      review,
    },
  };
}

/**
 * USDA safe minimum internal temperatures: poultry 165°F, ground meat 160°F,
 * whole cuts of beef/pork/lamb/veal and fish 145°F. Raw or cured dishes must
 * carry a safety note instead.
 */
function foodSafety(recipe: Recipe, methods: readonly CookingMethod[], safetyNote: string, errors: ImportIssue[], warnings: ImportIssue[]) {
  const raw = recipe.ingredients.filter((i) => !i.optional && !READY.test(`${i.item} ${i.preparation ?? ""}`)).map((i) => i.item);
  const has = (re: RegExp) => raw.some((t) => re.test(t));
  const poultry = has(POULTRY);
  const ground = has(GROUND);
  const meat = has(WHOLE_MEAT) || ground;
  const fish = has(FISH);
  const shellfish = has(SHELLFISH);
  const safe = recipe.steps.map((s) => s.safeInternalTempC).filter((t): t is number => t !== null);
  const maxSafe = safe.length ? Math.max(...safe) : null;
  const text = recipe.steps.map((s) => s.body).join(" ");

  for (const t of safe) {
    if (t < SAFE_MIN_C.wholeCut - 0.2) issue(errors, "steps.safe", `A safe internal temperature of ${Math.round((t * 9) / 5 + 32)}°F is below the USDA minimum (145°F).`);
  }
  if (methods.includes("raw") || methods.includes("no_cook")) {
    if ((fish || shellfish || meat || poultry) && !safetyNote) {
      issue(errors, "safetyNote", "Raw or cured fish, shellfish or meat needs a food-safety note (sourcing, freshness, who should avoid it).");
    }
    return;
  }
  if (poultry && (maxSafe === null || maxSafe < SAFE_MIN_C.poultry - 0.2)) issue(errors, "steps.safe", "Poultry must reach 165°F: add the safe temperature to the step where it's cooked.");
  if (ground && (maxSafe === null || maxSafe < SAFE_MIN_C.ground - 0.2)) issue(errors, "steps.safe", "Ground meat must reach 160°F: add the safe temperature to the step where it's cooked.");
  const longBraise = (methods.includes("braise") || methods.includes("stew") || methods.includes("slow_cook")) && recipe.cookMinutes >= 60;
  if ((meat || fish) && !poultry && !ground && maxSafe === null) {
    if (longBraise) issue(warnings, "steps.safe", "Long braise without a safe temperature; consider adding one.");
    else issue(errors, "steps.safe", "Meat and fish need a safe internal temperature (145°F) on the step where they're cooked.");
  }
  if (shellfish && !fish && !meat && !poultry && maxSafe === null && !/\b(opaque|shells? open|until (pink|pearly))\b/i.test(text)) {
    issue(warnings, "steps.safe", "Shellfish steps should say how to tell they're cooked (opaque, or shells open).");
  }
}
