import {
  worldCuisines,
  type AllergenCode,
  type Authenticity,
  type CookingMethod,
  type CuisineRegion,
  type EquipmentCode,
  type FlavorProfile,
  type Recipe,
  type RecipeCategory,
  type RecipeCourse,
  type RecipeStatus,
  type RecipeVariant,
} from "@kitchen-pantry/shared-types";
import { checkEquipment } from "../eligibility";
import { coreIngredient, facetsOf, libraryOf } from "./facets";
import { stableUuid } from "./ids";

/**
 * Library search filters (spec 08 §9). The same shape is sent to the
 * database's search_recipes() function and run here in preview mode, so
 * both give the same answers. Personal ranking (pantry, taste, variety)
 * happens afterwards on the results.
 */
export interface LibraryQuery {
  text?: string;
  cuisines?: string[];
  regions?: CuisineRegion[];
  categories?: RecipeCategory[];
  proteins?: string[];
  methods?: CookingMethod[];
  flavors?: FlavorProfile[];
  courses?: RecipeCourse[];
  minSkill?: number;
  maxSkill?: number;
  maxMinutes?: number;
  /** Diet tags every result must have: vegetarian, vegan, pescatarian, gluten_free, dairy_free. */
  diet?: string[];
  excludeAllergens?: AllergenCode[];
  /** What the household owns; results need nothing else (allowing substitutes). Omit to skip. */
  equipment?: EquipmentCode[];
  /** Only recipes that use this equipment ("air fryer dinners"). */
  needsEquipment?: EquipmentCode[];
  authenticity?: Authenticity[];
  variants?: RecipeVariant[];
  occasions?: string[];
  /** Must use these ingredients (core names, e.g. "chicken thigh"). */
  ingredients?: string[];
  /** Default: complete recipes only (tested, reviewed, not yet reviewed). */
  statuses?: RecipeStatus[];
  excludeIds?: string[];
  sort?: "relevance" | "quickest" | "rotate";
  /** For "rotate": the same seed gives the same order (e.g. household + day). */
  seed?: string;
  limit?: number;
  offset?: number;
}

export const COOKABLE_STATUSES: RecipeStatus[] = ["tested", "reviewed", "pending_review"];
export const MAX_PAGE = 100;

const REGION_OF = new Map<string, string>(worldCuisines.map((c) => [c.code, c.region]));
const CUISINE_LABEL = new Map<string, string>(worldCuisines.map((c) => [c.code, c.label.toLowerCase()]));

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Text relevance: every word must appear somewhere; title and dish name count most. */
export function textScore(recipe: Recipe, text: string): number {
  const words = tokens(text);
  if (words.length === 0) return 1;
  const lib = libraryOf(recipe);
  const fields: Array<[string, number]> = [
    [normalize(recipe.title), 6],
    [lib.dishKey.replace(/-/g, " "), 4],
    [recipe.ingredients.map((i) => i.item).join(" ").toLowerCase(), 2],
    [[CUISINE_LABEL.get(recipe.cuisine ?? "") ?? "", lib.region ?? "", ...recipe.tags, ...lib.categories, ...lib.methods].join(" ").replace(/[_-]/g, " ").toLowerCase(), 1.5],
    [normalize(recipe.description), 1],
  ];
  let score = 0;
  for (const w of words) {
    let best = 0;
    for (const [field, weight] of fields) {
      const re = new RegExp(`\\b${w}`);
      if (re.test(field)) best = Math.max(best, weight);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

const some = <T>(list: readonly T[] | undefined, pred: (x: T) => boolean) => !list || list.length === 0 || list.some(pred);
const every = <T>(list: readonly T[] | undefined, pred: (x: T) => boolean) => !list || list.length === 0 || list.every(pred);

export function matchesQuery(recipe: Recipe, q: LibraryQuery): boolean {
  const lib = libraryOf(recipe);
  const f = facetsOf(recipe);
  const statuses = q.statuses?.length ? q.statuses : COOKABLE_STATUSES;
  return (
    statuses.includes(lib.status) &&
    !(q.excludeIds ?? []).includes(recipe.id) &&
    some(q.cuisines, (c) => recipe.cuisine === c) &&
    some(q.regions, (r) => REGION_OF.get(recipe.cuisine ?? "") === r) &&
    some(q.categories, (c) => lib.categories.includes(c)) &&
    some(q.proteins, (p) => f.proteins.includes(p)) &&
    some(q.methods, (m) => lib.methods.includes(m)) &&
    some(q.flavors, (fl) => lib.flavors.includes(fl)) &&
    some(q.courses, (c) => (recipe.course ?? "main") === c) &&
    some(q.authenticity, (a) => lib.authenticity === a) &&
    some(q.variants, (v) => lib.variant === v) &&
    some(q.occasions, (o) => lib.occasions.includes(o)) &&
    every(q.diet, (d) => f.dietTags.includes(d)) &&
    every(q.excludeAllergens, (a) => !f.allergens.includes(a)) &&
    every(q.ingredients, (i) => f.core.some((c) => c.includes(coreIngredient(i)) || coreIngredient(i).includes(c))) &&
    (q.minSkill === undefined || recipe.skillLevel >= q.minSkill) &&
    (q.maxSkill === undefined || recipe.skillLevel <= q.maxSkill) &&
    (q.maxMinutes === undefined || recipe.totalMinutes <= q.maxMinutes) &&
    (q.equipment === undefined || checkEquipment(recipe.requiredEquipment, q.equipment).ok) &&
    every(q.needsEquipment, (e) => recipe.requiredEquipment.includes(e)) &&
    (!q.text || textScore(recipe, q.text) > 0)
  );
}

export interface LibraryPage {
  recipes: Recipe[];
  total: number;
}

/** Preview-mode search over an in-memory catalogue; the database does the same in SQL. */
export function searchLibrary(recipes: readonly Recipe[], q: LibraryQuery): LibraryPage {
  const hits = recipes.filter((r) => matchesQuery(r, q));
  const sort = q.sort ?? (q.text ? "relevance" : "rotate");
  const key = new Map<string, number>();
  for (const r of hits) {
    key.set(
      r.id,
      sort === "relevance" ? -textScore(r, q.text ?? "") : sort === "quickest" ? r.totalMinutes : parseInt(stableUuid(`${q.seed ?? ""}:${r.id}`).slice(0, 8), 16),
    );
  }
  hits.sort((a, b) => key.get(a.id)! - key.get(b.id)! || a.title.localeCompare(b.title));
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.min(MAX_PAGE, Math.max(1, q.limit ?? 24));
  return { recipes: hits.slice(offset, offset + limit), total: hits.length };
}

/** Facet counts for the filter chips (cuisines with recipes, etc.). */
export function libraryFacets(recipes: readonly Recipe[]): { cuisines: Map<string, number>; categories: Map<string, number>; ideas: number; complete: number } {
  const cuisines = new Map<string, number>();
  const categories = new Map<string, number>();
  let ideas = 0;
  let complete = 0;
  for (const r of recipes) {
    const lib = libraryOf(r);
    if (lib.status === "retired") continue;
    if (lib.status === "idea") {
      ideas += 1;
      continue; // counts below are complete recipes only (same as the database)
    }
    complete += 1;
    if (r.cuisine) cuisines.set(r.cuisine, (cuisines.get(r.cuisine) ?? 0) + 1);
    for (const c of lib.categories) categories.set(c, (categories.get(c) ?? 0) + 1);
  }
  return { cuisines, categories, ideas, complete };
}
