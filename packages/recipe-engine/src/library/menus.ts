import { type AllergenCode, type MenuCourse, type Recipe, type RecipeCategory, type RecipeCourse } from "@kitchen-pantry/shared-types";
import { screenAllergens } from "../allergens";
import { serviceTimeline } from "../cooking";
import type { RankedRecipe } from "../recipes";
import { coreIngredient, facetsOf, isCookable, libraryOf } from "./facets";

/**
 * The menu builder (spec 08 §4): whole meals, not single recipes. A
 * template lists the courses ("Steakhouse Dinner": prime rib, Yorkshire
 * pudding, creamed spinach…); `buildMenu` fills each course from the
 * household's ranked library — so allergies, diet, equipment and "Not for
 * us" already apply — and scales it to the number of guests, the cook's
 * skill, the time they have and (with real store prices) the budget.
 *
 * Honesty rules: a course with only a dish idea says so and can't be
 * cooked yet; costs are added up only from verified store prices, and the
 * menu says how many courses have no price rather than guessing.
 */
export interface CourseMatch {
  /** Preferred dishes, best first ("prime-rib", "standing-rib-roast"). */
  dishKeys?: string[];
  /** Words that should be in the title ("tender", "fries"). */
  terms?: string[];
  courses?: RecipeCourse[];
  categories?: RecipeCategory[];
  cuisines?: string[];
  proteins?: string[];
  minSkill?: number;
}

export interface MenuTemplateCourse {
  course: MenuCourse;
  label: string;
  match: CourseMatch;
  optional?: boolean;
}

export interface MenuTemplate {
  code: string;
  title: string;
  description: string;
  cuisine: string | null;
  /** A holiday code: shown only to households that opted in to it (we never assume holidays). */
  occasion?: string;
  /** Below this skill, the builder prefers simpler versions and says the menu is a stretch. */
  suggestedSkill: number;
  courses: MenuTemplateCourse[];
}

const m = (course: MenuCourse, label: string, match: CourseMatch, optional = false): MenuTemplateCourse => ({ course, label, match, optional });

export const MENU_TEMPLATES: MenuTemplate[] = [
  {
    code: "family-budget",
    title: "Budget Family Dinner",
    description: "Crispy tenders, fries and the fixings — a crowd-pleaser that's easy on the wallet.",
    cuisine: "american",
    suggestedSkill: 1,
    courses: [
      m("main", "Crispy chicken tenders", { dishKeys: ["crispy-chicken-tenders", "chicken-tenders"], terms: ["tender"], courses: ["main"], proteins: ["chicken"] }),
      m("side", "Seasoned fries", { dishKeys: ["seasoned-fries", "oven-fries", "french-fries"], terms: ["fries"], courses: ["side"] }),
      m("sauce", "Homemade honey mustard", { dishKeys: ["honey-mustard"], terms: ["honey mustard"], courses: ["sauce"] }),
      m("side", "Coleslaw", { dishKeys: ["coleslaw"], terms: ["slaw"], courses: ["side"] }),
    ],
  },
  {
    code: "thai-dinner",
    title: "Thai Dinner",
    description: "Satay to start, pad Thai, a bright papaya salad and mango sticky rice.",
    cuisine: "thai",
    suggestedSkill: 2,
    courses: [
      m("starter", "Chicken satay", { dishKeys: ["chicken-satay", "satay"], terms: ["satay"], cuisines: ["thai", "malaysian", "indonesian"] }),
      m("main", "Pad Thai", { dishKeys: ["pad-thai"], terms: ["pad thai"], cuisines: ["thai"], courses: ["main"] }),
      m("salad", "Green papaya salad", { dishKeys: ["green-papaya-salad", "som-tam"], terms: ["papaya"], cuisines: ["thai", "laotian"] }),
      m("dessert", "Mango sticky rice", { dishKeys: ["mango-sticky-rice"], terms: ["sticky rice"], courses: ["dessert"], cuisines: ["thai"] }),
    ],
  },
  {
    code: "steakhouse",
    title: "Steakhouse Dinner",
    description: "Prime rib with Yorkshire pudding, creamed spinach, garlic mash and horseradish cream.",
    cuisine: "american",
    suggestedSkill: 3,
    courses: [
      m("main", "Prime rib roast", { dishKeys: ["prime-rib", "prime-rib-roast", "standing-rib-roast"], terms: ["prime rib", "rib roast"], proteins: ["beef"], courses: ["main"] }),
      m("side", "Yorkshire pudding", { dishKeys: ["yorkshire-pudding"], terms: ["yorkshire"], courses: ["side"] }),
      m("side", "Creamed spinach", { dishKeys: ["creamed-spinach"], terms: ["creamed spinach"], courses: ["side"] }),
      m("side", "Garlic mashed potatoes", { dishKeys: ["garlic-mashed-potatoes", "mashed-potatoes"], terms: ["mash"], courses: ["side"] }),
      m("sauce", "Horseradish cream", { dishKeys: ["horseradish-cream"], terms: ["horseradish"], courses: ["sauce"] }),
    ],
  },
  {
    code: "luxury-seafood",
    title: "Luxury Seafood Dinner",
    description: "Oysters with mignonette, jumbo shrimp cocktail, a chilled seafood tower, butter-poached lobster and lemon tart.",
    cuisine: "seafood",
    suggestedSkill: 3,
    courses: [
      m("raw_bar", "Oysters with mignonette", { dishKeys: ["oysters-mignonette", "oysters-on-the-half-shell"], terms: ["oyster"], categories: ["seafood_raw_bar"] }),
      m("starter", "Jumbo shrimp cocktail", { dishKeys: ["shrimp-cocktail", "jumbo-shrimp-cocktail"], terms: ["shrimp cocktail"] }),
      m("raw_bar", "Chilled seafood tower", { dishKeys: ["seafood-tower", "chilled-seafood-tower"], terms: ["tower", "plateau"] }, true),
      m("main", "Butter-poached lobster", { dishKeys: ["butter-poached-lobster"], terms: ["lobster"], proteins: ["shellfish"], courses: ["main"] }),
      m("dessert", "Lemon tart", { dishKeys: ["lemon-tart", "tarte-au-citron"], terms: ["lemon tart", "citron"], courses: ["dessert"] }),
    ],
  },
  {
    code: "fine-dining",
    title: "Fine Dining Dinner Party",
    description: "Six courses, from amuse-bouche to a composed dessert. Plan it a day ahead.",
    cuisine: null,
    suggestedSkill: 4,
    courses: [
      m("amuse", "Amuse-bouche", { terms: ["amuse", "gougère", "gougere", "crudo", "tartlet", "bite"], courses: ["starter"], categories: ["appetizer"] }),
      m("starter", "Seasonal appetizer", { courses: ["starter"], categories: ["appetizer", "salad", "soup"], minSkill: 3 }),
      m("fish", "Fish course", { proteins: ["fish", "shellfish"], courses: ["main", "starter"], minSkill: 3 }),
      m("main", "Main course", { courses: ["main"], categories: ["entertaining", "date_night"], minSkill: 3 }),
      m("palate_cleanser", "Palate cleanser", { terms: ["sorbet", "granita"], courses: ["dessert"] }),
      m("dessert", "Composed dessert", { courses: ["dessert"], minSkill: 3 }),
    ],
  },
  {
    code: "taco-night",
    title: "Taco Night",
    description: "A slow-cooked taco filling, salsa, rice and beans.",
    cuisine: "mexican",
    suggestedSkill: 2,
    courses: [
      m("main", "Tacos", { dishKeys: ["carnitas", "birria-tacos", "tacos-al-pastor", "carne-asada-tacos"], terms: ["taco", "carnitas", "birria", "pastor"], cuisines: ["mexican"], courses: ["main"] }),
      m("sauce", "Salsa", { terms: ["salsa", "guacamole", "pico"], courses: ["sauce", "side", "starter"], cuisines: ["mexican"] }),
      m("side", "Rice and beans", { terms: ["rice", "beans", "frijoles"], courses: ["side"], cuisines: ["mexican", "tex_mex"] }),
      m("dessert", "Something sweet", { terms: ["churro", "flan", "tres leches"], courses: ["dessert"], cuisines: ["mexican"] }, true),
    ],
  },
  {
    code: "sunday-roast",
    title: "Sunday Roast",
    description: "A British roast with all the trimmings and a warm pudding.",
    cuisine: "british",
    suggestedSkill: 2,
    courses: [
      m("main", "The roast", { terms: ["roast"], courses: ["main"], cuisines: ["british", "american"] }),
      m("side", "Roast potatoes", { dishKeys: ["roast-potatoes"], terms: ["roast potato", "potatoes"], courses: ["side"] }),
      m("side", "Yorkshire pudding", { dishKeys: ["yorkshire-pudding"], terms: ["yorkshire"], courses: ["side"] }),
      m("sauce", "Gravy", { dishKeys: ["gravy", "pan-gravy"], terms: ["gravy"], courses: ["sauce"] }),
      m("dessert", "Pudding", { terms: ["crumble", "sticky toffee", "pudding"], courses: ["dessert"] }, true),
    ],
  },
  {
    code: "mezze",
    title: "Mezze Spread",
    description: "Dips, salads and something off the grill to share.",
    cuisine: "middle_eastern",
    suggestedSkill: 2,
    courses: [
      m("starter", "Hummus", { dishKeys: ["hummus"], terms: ["hummus"], courses: ["starter", "side", "sauce"] }),
      m("starter", "Falafel", { dishKeys: ["falafel"], terms: ["falafel"] }, true),
      m("salad", "Fattoush or tabbouleh", { terms: ["fattoush", "tabbouleh", "salad"], cuisines: ["lebanese", "middle_eastern", "israeli", "turkish"] }),
      m("main", "Shawarma or kebabs", { terms: ["shawarma", "kebab", "kofta"], courses: ["main"] }),
      m("dessert", "Something sweet", { terms: ["baklava", "knafeh", "halva"], courses: ["dessert"] }, true),
    ],
  },
  {
    code: "trattoria",
    title: "Italian Trattoria",
    description: "Antipasto, a pasta or risotto, and tiramisu.",
    cuisine: "italian",
    suggestedSkill: 2,
    courses: [
      m("starter", "Antipasto", { terms: ["bruschetta", "crostini", "antipasto", "caprese", "arancini"], courses: ["starter"], cuisines: ["italian"] }),
      m("main", "Pasta or risotto", { terms: ["pasta", "risotto", "carbonara", "lasagna", "gnocchi", "ragù", "ragu"], courses: ["main"], cuisines: ["italian"] }),
      m("side", "Something green", { courses: ["side"], categories: ["salad", "side"], cuisines: ["italian"] }, true),
      m("dessert", "Tiramisu", { dishKeys: ["tiramisu"], terms: ["tiramisu", "panna cotta"], courses: ["dessert"], cuisines: ["italian"] }),
    ],
  },
  {
    code: "korean-bbq",
    title: "Korean Barbecue Night",
    description: "Grilled marinated beef, banchan, a bubbling stew and dipping sauce.",
    cuisine: "korean",
    suggestedSkill: 2,
    courses: [
      m("main", "Bulgogi or galbi", { dishKeys: ["bulgogi", "galbi"], terms: ["bulgogi", "galbi"], cuisines: ["korean"], courses: ["main"] }),
      m("side", "Banchan", { terms: ["kimchi", "namul", "muchim", "banchan", "pickle", "cucumber"], courses: ["side", "starter"], cuisines: ["korean"] }),
      m("soup", "Stew", { terms: ["jjigae", "stew", "soup"], cuisines: ["korean"] }, true),
      m("sauce", "Ssamjang", { terms: ["ssamjang", "sauce"], courses: ["sauce"], cuisines: ["korean"] }, true),
    ],
  },
  {
    code: "indian-feast",
    title: "Indian Feast",
    description: "A rich curry, a dal, rice, bread and raita.",
    cuisine: "indian",
    suggestedSkill: 2,
    courses: [
      m("main", "Curry", { terms: ["butter chicken", "tikka masala", "curry", "korma", "vindaloo"], cuisines: ["indian", "pakistani", "bangladeshi"], courses: ["main"] }),
      m("main", "Dal or vegetables", { terms: ["dal", "chana", "saag", "aloo"], cuisines: ["indian"] }, true),
      m("side", "Rice", { terms: ["rice", "pulao", "biryani"], courses: ["side", "main"], cuisines: ["indian"] }),
      m("side", "Bread", { terms: ["naan", "roti", "paratha", "chapati"], cuisines: ["indian"] }, true),
      m("sauce", "Raita or chutney", { terms: ["raita", "chutney"], courses: ["sauce", "side"] }, true),
    ],
  },
  {
    code: "thanksgiving",
    title: "Thanksgiving Dinner",
    description: "Roast turkey, stuffing, mashed potatoes, gravy, cranberry sauce and pie.",
    cuisine: "american",
    occasion: "thanksgiving",
    suggestedSkill: 3,
    courses: [
      m("main", "Roast turkey", { dishKeys: ["thanksgiving-roast-turkey", "roast-turkey"], terms: ["roast turkey"], proteins: ["turkey"], courses: ["main"] }),
      m("side", "Stuffing", { terms: ["stuffing", "dressing"], courses: ["side"] }),
      m("side", "Mashed potatoes", { dishKeys: ["mashed-potatoes", "garlic-mashed-potatoes"], terms: ["mash"], courses: ["side"] }),
      m("sauce", "Gravy and cranberry sauce", { terms: ["gravy", "cranberry"], courses: ["sauce"] }),
      m("side", "Green vegetable", { terms: ["green bean", "brussels", "sprouts"], courses: ["side"] }, true),
      m("dessert", "Pie", { terms: ["pie"], courses: ["dessert"] }),
    ],
  },
];

/** A simple menu for any cuisine: starter, main, side and dessert from that cuisine. */
export function cuisineMenuTemplate(cuisine: string, label: string): MenuTemplate {
  return {
    code: `cuisine:${cuisine}`,
    title: `${label} Dinner`,
    description: `A starter, main, side and dessert from ${label} cooking.`,
    cuisine,
    suggestedSkill: 2,
    courses: [
      m("starter", "Starter", { courses: ["starter"], categories: ["appetizer", "soup", "salad"], cuisines: [cuisine] }, true),
      m("main", "Main", { courses: ["main"], cuisines: [cuisine] }),
      m("side", "Side", { courses: ["side"], cuisines: [cuisine] }, true),
      m("dessert", "Dessert", { courses: ["dessert"], cuisines: [cuisine] }, true),
    ],
  };
}

export function templatesFor(optedInHolidays: readonly string[]): MenuTemplate[] {
  return MENU_TEMPLATES.filter((t) => !t.occasion || optedInHolidays.includes(t.occasion));
}

export interface MenuContext {
  guests: number;
  /** The cook's skill (1–5). */
  skill: number;
  /** Let the builder pick recipes above the cook's skill. */
  stretch?: boolean;
  /** Most hands-on minutes the cook wants to spend (prep, summed). */
  maxActiveMinutes?: number | null;
  /** Total budget in cents; only applied with verified prices. */
  budgetCents?: number | null;
  /** Verified per-serving costs from the household's store, by recipe id. Never estimated. */
  prices?: ReadonlyMap<string, number>;
  /** Household allergens, for screening dish ideas that have no ingredient list yet. */
  allergies?: readonly AllergenCode[];
  /** Recipes to avoid (e.g. already used in another course or this week). */
  exclude?: ReadonlySet<string>;
  /** The cook's own choice for a course (course index → recipe id), kept when it's allowed. */
  pinned?: ReadonlyMap<number, string>;
}

export interface MenuCoursePick {
  course: MenuCourse;
  label: string;
  optional: boolean;
  recipe: Recipe | null;
  /** True when the pick is a dish idea without full instructions. */
  idea: boolean;
  /** Servings multiplier from the recipe's yield to the guest count. */
  factor: number;
  aboveSkill: boolean;
  /** Per-serving cost from verified store prices, or null when we don't know it. */
  perServingCents: number | null;
  alternatives: Recipe[];
  note: string | null;
}

export interface BuiltMenu {
  template: MenuTemplate;
  guests: number;
  courses: MenuCoursePick[];
  /** Courses that have a cookable recipe. */
  ready: number;
  /** Hands-on minutes (prep), and how long before dinner to start. */
  activeMinutes: number;
  startBefore: number;
  /** Total from verified prices only; `unpriced` courses aren't in it. */
  cost: { cents: number; unpriced: number; overBudget: boolean | null };
  /** The running order across courses: what to start when. */
  schedule: Array<{ startsBefore: number; label: string; recipeTitle: string }>;
  /** Everything to buy, merged across courses and scaled to the guests. */
  shopping: Array<{ item: string; quantity: number | null; unit: string | null; courses: string[] }>;
  warnings: string[];
}

function matchScore(r: RankedRecipe, match: CourseMatch, template: MenuTemplate): number | null {
  const recipe = r.recipe;
  const lib = libraryOf(recipe);
  const f = facetsOf(recipe);
  const course = recipe.course ?? "main";
  if (match.courses?.length && !match.courses.includes(course)) {
    // A main-course soup can still fill a "soup" course; desserts never fill savoury ones.
    if (course === "dessert" || !match.categories?.some((c) => lib.categories.includes(c))) return null;
  }
  if (match.cuisines?.length && !match.cuisines.includes(recipe.cuisine ?? "")) return null;
  // Dish ideas have no ingredient list yet, so their protein is unknown: match on the name instead.
  if (match.proteins?.length && recipe.ingredients.length > 0 && !match.proteins.some((p) => f.proteins.includes(p))) return null;
  if (match.minSkill && recipe.skillLevel < match.minSkill) return null;
  const title = recipe.title.toLowerCase();
  const dishRank = match.dishKeys?.indexOf(lib.dishKey) ?? -1;
  const termHit = match.terms?.some((t) => title.includes(t.toLowerCase())) ?? false;
  const categoryHit = match.categories?.some((c) => lib.categories.includes(c)) ?? false;
  const specific = Boolean(match.dishKeys?.length || match.terms?.length);
  if (specific && dishRank < 0 && !termHit) return null;
  if (!specific && match.categories?.length && !categoryHit && !match.courses?.includes(course)) return null;
  let s = 0;
  if (dishRank >= 0) s += 40 - dishRank * 3;
  if (termHit) s += 20;
  if (categoryHit) s += specific ? 6 : 15;
  if (template.cuisine && recipe.cuisine === template.cuisine) s += 6;
  return s;
}

/** Fill a menu template from the household's ranked library (use rankRecipes with course "any" and ideas included). */
export function buildMenu(template: MenuTemplate, pool: readonly RankedRecipe[], ctx: MenuContext): BuiltMenu {
  const guests = Math.max(1, Math.min(50, Math.round(ctx.guests)));
  const used = new Set<string>(ctx.exclude ?? []);
  const usedProteins = new Set<string>();
  const warnings: string[] = [];
  const maxSkill = ctx.stretch ? 5 : Math.max(ctx.skill, 1);

  // Pinned choices are reserved first so other courses don't take them.
  for (const id of ctx.pinned?.values() ?? []) used.add(id);
  const courses: MenuCoursePick[] = template.courses.map((tc, index) => {
    const pinnedId = ctx.pinned?.get(index);
    const scored: Array<{ r: RankedRecipe; s: number }> = [];
    for (const r of pool) {
      if (!r.allowed || r.dismissed || used.has(r.recipe.id)) continue;
      const base = matchScore(r, tc.match, template);
      if (base === null) continue;
      const lib = libraryOf(r.recipe);
      const idea = !isCookable(r.recipe);
      if (idea && ctx.allergies?.length && screenAllergens([`${r.recipe.title}. ${r.recipe.description}`], ctx.allergies).conflicts.length > 0) continue;
      let s = base + Math.max(-20, Math.min(30, r.score / 4));
      if (!idea) s += 25;
      if (lib.status === "tested") s += 4;
      else if (lib.status === "reviewed") s += 2;
      if (r.recipe.skillLevel > maxSkill) s -= 30;
      else if (ctx.skill <= 2 && lib.variant === "simplified") s += 6;
      else if (ctx.skill >= 4 && lib.variant === "elevated") s += 6;
      const protein = facetsOf(r.recipe).proteins[0];
      if (protein && usedProteins.has(protein) && tc.course !== "sauce") s -= 8;
      if (ctx.prices?.has(r.recipe.id) && ctx.budgetCents) s -= Math.min(10, ctx.prices.get(r.recipe.id)! / 200);
      scored.push({ r, s });
    }
    scored.sort((a, b) => b.s - a.s);
    const pinned = pinnedId ? pool.find((r) => r.recipe.id === pinnedId && r.allowed) : undefined;
    if (pinned) {
      const at = scored.findIndex((x) => x.r.recipe.id === pinnedId);
      if (at >= 0) scored.splice(at, 1);
      scored.unshift({ r: pinned, s: Infinity });
    }
    const best = scored[0]?.r ?? null;
    if (best) {
      used.add(best.recipe.id);
      const p = facetsOf(best.recipe).proteins[0];
      if (p) usedProteins.add(p);
    }
    const recipe = best?.recipe ?? null;
    const idea = recipe ? !isCookable(recipe) : false;
    return {
      course: tc.course,
      label: tc.label,
      optional: Boolean(tc.optional),
      recipe,
      idea,
      factor: recipe ? guests / recipe.servings : 1,
      aboveSkill: recipe ? recipe.skillLevel > ctx.skill : false,
      perServingCents: recipe && ctx.prices?.has(recipe.id) ? ctx.prices.get(recipe.id)! : null,
      alternatives: scored.slice(1, 4).map((x) => x.r.recipe),
      note: !recipe
        ? tc.optional
          ? "Nothing in the library fits yet — skip it or add your own."
          : "We don't have a recipe for this course yet."
        : idea
          ? "A dish idea for now — the full recipe isn't in the library yet."
          : null,
    };
  });

  // Over budget with real prices? Swap the priciest course for its cheapest priced alternative, a few times.
  const total = () => courses.reduce((sum, c) => sum + (c.perServingCents ?? 0) * guests, 0);
  if (ctx.budgetCents && ctx.prices) {
    for (let round = 0; round < courses.length && total() > ctx.budgetCents; round++) {
      const priced = courses.filter((c) => c.perServingCents !== null).sort((a, b) => b.perServingCents! - a.perServingCents!);
      let swapped = false;
      for (const c of priced) {
        const cheaper = c.alternatives
          .filter((a) => ctx.prices!.has(a.id) && ctx.prices!.get(a.id)! < c.perServingCents! && isCookable(a))
          .sort((a, b) => ctx.prices!.get(a.id)! - ctx.prices!.get(b.id)!)[0];
        if (cheaper) {
          c.alternatives = [c.recipe!, ...c.alternatives.filter((a) => a.id !== cheaper.id)];
          c.recipe = cheaper;
          c.perServingCents = ctx.prices.get(cheaper.id)!;
          c.factor = guests / cheaper.servings;
          c.aboveSkill = cheaper.skillLevel > ctx.skill;
          swapped = true;
          break;
        }
      }
      if (!swapped) break;
    }
  }

  const picked = courses.filter((c) => c.recipe && !c.idea);
  const activeMinutes = picked.reduce((sum, c) => sum + c.recipe!.prepMinutes, 0);
  const startBefore = picked.reduce((mx, c) => Math.max(mx, c.recipe!.totalMinutes, serviceTimeline(c.recipe!).totalMinutes), 0);
  if (ctx.maxActiveMinutes && activeMinutes > ctx.maxActiveMinutes) warnings.push(`About ${activeMinutes} minutes of hands-on prep — more than the ${ctx.maxActiveMinutes} you have. Drop an optional course or make something ahead.`);
  if (courses.some((c) => c.aboveSkill)) warnings.push("Some courses are above your usual skill level.");
  if (template.suggestedSkill > ctx.skill + 1) warnings.push(`This menu is a stretch at your skill level (it suits level ${template.suggestedSkill}).`);
  const required = courses.filter((c) => !c.optional);
  if (required.some((c) => !c.recipe)) warnings.push("Some courses don't have a recipe in the library yet.");

  const unpriced = picked.filter((c) => c.perServingCents === null).length;
  const cents = total();
  const overBudget = ctx.budgetCents && ctx.prices && unpriced === 0 ? cents > ctx.budgetCents : null;
  if (overBudget) warnings.push(`At your store's prices this comes to more than your budget.`);

  // What to start when: longest first.
  const schedule = picked
    .map((c) => ({ startsBefore: Math.max(c.recipe!.totalMinutes, serviceTimeline(c.recipe!).totalMinutes), label: c.label, recipeTitle: c.recipe!.title }))
    .sort((a, b) => b.startsBefore - a.startsBefore);

  // Shopping list, merged by ingredient and unit, scaled to the guests.
  const shop = new Map<string, { item: string; quantity: number | null; unit: string | null; courses: string[] }>();
  for (const c of picked) {
    for (const i of c.recipe!.ingredients) {
      if (i.optional) continue;
      const key = `${coreIngredient(i.item) || i.item.toLowerCase()}|${i.unit ?? ""}`;
      const q = i.quantity === null ? null : i.quantity * c.factor;
      const existing = shop.get(key);
      if (existing) {
        existing.quantity = existing.quantity === null || q === null ? null : existing.quantity + q;
        if (!existing.courses.includes(c.label)) existing.courses.push(c.label);
      } else shop.set(key, { item: i.item, quantity: q, unit: i.unit, courses: [c.label] });
    }
  }
  return {
    template,
    guests,
    courses,
    ready: picked.length,
    activeMinutes,
    startBefore,
    cost: { cents, unpriced, overBudget },
    schedule,
    shopping: [...shop.values()],
    warnings,
  };
}
