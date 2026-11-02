import { worldCuisines, type DietStyle, type EquipmentCode, type RecipeCategory, type VarietyMode } from "@kitchen-pantry/shared-types";
import type { LibraryQuery } from "./search";

/**
 * Natural-language search (spec 08 §9), done with plain rules so it's free,
 * instant and predictable:
 *   "Make me an authentic Thai dinner for four under $50."
 *   "I want a restaurant-quality beef Wellington."
 *   "Give me five cheap dinners using chicken thighs."
 *   "Build a seafood tower for six people."
 *   "I want something completely different from what we ate last week."
 * Whatever isn't understood stays as search words. Each part that was
 * understood comes back as a plain-English chip the person can remove.
 */
export interface ParsedRequest {
  query: LibraryQuery;
  /** How many people (scales the recipes and the shopping). */
  servings: number | null;
  /** A total budget the person named, in cents. */
  budgetCents: number | null;
  /** "five dinners" → 5. */
  count: number | null;
  /** They asked for a whole meal ("a Thai dinner for four", "a seafood tower"). */
  wantsMenu: boolean;
  /** The menu template that fits best, if any. */
  menuTemplate: string | null;
  /** "Something completely different" → favour new cuisines and skip recent meals. */
  variety: VarietyMode | null;
  avoidRecent: boolean;
  /** Plain-English pieces we understood, in order, e.g. ["Thai", "Traditional", "For 4", "Under $50"]. */
  understood: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  a: 1, an: 1, couple: 2, few: 3, dozen: 12,
};
const num = (w: string): number | null => (/^\d+$/.test(w) ? Number(w) : (NUMBER_WORDS[w] ?? null));

/** Extra spellings people type for cuisines. */
const CUISINE_SYNONYMS: Record<string, string> = {
  szechuan: "sichuan", szechwan: "sichuan", "dim sum": "cantonese", cantonese: "cantonese", "hong kong": "cantonese",
  italy: "italian", france: "french", mexico: "mexican", japan: "japanese", korea: "korean", thailand: "thai", vietnam: "vietnamese",
  india: "indian", greece: "greek", spain: "spanish", "tapas": "spanish", peru: "peruvian", brazil: "brazilian", argentina: "argentine",
  morocco: "moroccan", ethiopia: "ethiopian", nigeria: "nigerian", jamaica: "jamaican", cuba: "cuban", germany: "german",
  england: "british", english: "british", uk: "british", lebanon: "lebanese", turkey_cuisine: "turkish", persia: "persian", iran: "persian",
  philippines: "filipino", indonesia: "indonesian", malaysia: "malaysian", "middle east": "middle_eastern", "middle-eastern": "middle_eastern",
  "bbq": "southern", barbecue: "southern", "soul food": "southern", cajun: "cajun_creole", creole: "cajun_creole", "tex mex": "tex_mex",
  "raw bar": "seafood", oaxacan: "mexican", "veracruz": "mexican",
};

const CATEGORY_WORDS: Array<[RegExp, RecipeCategory, string]> = [
  [/\b(breakfast|brunch)\b/, "breakfast", "Breakfast & brunch"],
  [/\blunch\b/, "lunch", "Lunch"],
  [/\b(appetizers?|starters?|snacks?|finger food|mezze|tapas)\b/, "appetizer", "Appetizers"],
  [/\bsoups?\b/, "soup", "Soup"],
  [/\bsalads?\b/, "salad", "Salad"],
  [/\bsides?( dishes?)?\b/, "side", "Sides"],
  [/\b(seafood tower|raw bar|oysters?|shrimp cocktail)\b/, "seafood_raw_bar", "Seafood & raw bar"],
  [/\b(grill(ed|ing)?|smok(ed|ing)|bbq|barbecue|cookout)\b/, "grilling", "Grilling & barbecue"],
  [/\bcomfort( food)?\b/, "comfort", "Comfort food"],
  [/\b(cheap|budget|inexpensive|frugal|affordable)\b/, "budget", "Budget"],
  [/\b(holiday|thanksgiving|christmas|easter|festive)\b/, "holiday", "Holiday"],
  [/\bdate[- ]night|romantic\b/, "date_night", "Date night"],
  [/\b(dinner party|entertaining|party|guests)\b/, "entertaining", "Entertaining"],
  [/\b(desserts?|sweets?|pastry|pastries|cake|cookies|pie)\b/, "dessert", "Dessert"],
  [/\b(bread|baking|bake)\b/, "baking", "Baking & bread"],
  [/\b(sauces?|stocks?|condiments?|dressings?)\b/, "sauce", "Sauces"],
  [/\btasting menu|multi[- ]course\b/, "tasting_menu", "Tasting menu"],
];

const PROTEIN_WORDS: Array<[RegExp, string]> = [
  [/\bchicken\b/, "chicken"], [/\b(beef|steak|brisket|short ribs?|prime rib|wellington)\b/, "beef"], [/\b(pork|bacon|ham|carnitas)\b/, "pork"],
  [/\bturkey\b/, "turkey"], [/\blamb\b/, "lamb"], [/\b(fish|salmon|cod|tuna|halibut|trout|snapper)\b/, "fish"],
  [/\b(shrimp|prawns?|crab|lobster|scallops?|mussels?|clams?|oysters?|shellfish)\b/, "shellfish"], [/\btofu|tempeh\b/, "tofu"],
  [/\b(beans?|lentils?|chickpeas?)\b/, "beans"], [/\beggs?\b/, "eggs"],
];

const DIET_WORDS: Array<[RegExp, string, string]> = [
  [/\bvegan\b/, "vegan", "Vegan"],
  [/\bvegetarian|meatless|veggie\b/, "vegetarian", "Vegetarian"],
  [/\bpescatarian\b/, "pescatarian", "Pescatarian"],
  [/\bgluten[- ]free\b/, "gluten_free", "Gluten-free"],
  [/\b(dairy[- ]free|no dairy|lactose[- ]free)\b/, "dairy_free", "Dairy-free"],
];

const EQUIPMENT_WORDS: Array<[RegExp, EquipmentCode, string]> = [
  [/\bair[- ]fr(yer|ied)\b/, "air_fryer", "Air fryer"],
  [/\b(slow[- ]cooker|crock[- ]?pot)\b/, "slow_cooker", "Slow cooker"],
  [/\b(instant pot|pressure cooker)\b/, "pressure_cooker", "Pressure cooker"],
  [/\bsous[- ]vide\b/, "sous_vide", "Sous vide"],
  [/\bsmoker\b/, "smoker", "Smoker"],
];

/** Phrases that pick a menu template. */
const MENU_HINTS: Array<[RegExp, string]> = [
  [/\bseafood tower|raw bar|seafood (dinner|feast|platter)|lobster dinner\b/, "luxury-seafood"],
  [/\bsteakhouse|prime rib dinner\b/, "steakhouse"],
  [/\b(fine[- ]dining|tasting menu|multi[- ]course|dinner party)\b/, "fine-dining"],
  [/\bthai (dinner|feast|menu|night)\b/, "thai-dinner"],
  [/\b(taco night|mexican (dinner|feast|night))\b/, "taco-night"],
  [/\b(sunday roast|roast dinner)\b/, "sunday-roast"],
  [/\b(mezze|meze)\b/, "mezze"],
  [/\b(italian (dinner|night|feast)|trattoria)\b/, "trattoria"],
  [/\b(korean bbq|korean barbecue|korean (dinner|feast))\b/, "korean-bbq"],
  [/\b(indian (dinner|feast|night)|curry night)\b/, "indian-feast"],
  [/\b(family dinner|kid[- ]friendly dinner|chicken tenders)\b/, "family-budget"],
];

const STOP = new Set(
  "make me give want would like need build cook find show get i we us our my some something any a an the for of with using use under over below less than more and or to please recipe recipes dish dishes meal meals idea ideas dinner dinners people persons person serves serving servings who what that which is are be up quality something completely different from last week ate eat new night tonight tower towers feast spread platter menu party".split(" "),
);

export function parseRecipeRequest(text: string, opts: { dietStyle?: DietStyle } = {}): ParsedRequest {
  const lower = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ")} `;
  const query: LibraryQuery = {};
  const understood: string[] = [];
  let rest = lower;
  const take = (re: RegExp) => {
    rest = rest.replace(new RegExp(re.source, "g"), " ");
  };

  // Cuisines (labels, codes and synonyms).
  const found = new Set<string>();
  for (const [syn, code] of Object.entries(CUISINE_SYNONYMS)) {
    const re = new RegExp(`\\b${syn.replace("_cuisine", "")}\\b`);
    if (syn !== "turkey_cuisine" && re.test(lower)) {
      found.add(code);
      if (syn !== "bbq" && syn !== "barbecue") take(re);
    }
  }
  for (const c of worldCuisines) {
    const label = c.label.toLowerCase().split(/[ /&]+/)[0]!;
    if (label.length > 3 && new RegExp(`\\b${label}\\b`).test(lower) && !(c.code === "seafood" && !/\bseafood\b/.test(lower))) {
      if (c.code === "turkish" && /\bturkey\b/.test(lower)) continue;
      found.add(c.code);
      take(new RegExp(`\\b${label}\\b`));
    }
  }
  if (found.has("seafood")) found.delete("seafood"); // "seafood" is a category, not where it's from
  if (found.size) {
    query.cuisines = [...found];
    understood.push(...query.cuisines.map((c) => worldCuisines.find((w) => w.code === c)?.label ?? c));
  }

  // Authenticity.
  if (/\b(authentic|traditional|classic|real|proper)\b/.test(lower)) {
    query.authenticity = ["traditional", "regional"];
    understood.push("Traditional");
    take(/\b(authentic|traditional|real|proper)\b/);
  }

  // People: "for four", "for 6 people", "serves 8", "6 guests".
  let servings: number | null = null;
  const forM = /\b(?:for|feeds?|serves?|serving)\s+(\d+|[a-z]+)(?:\s+(?:people|persons|guests|of us|adults))?\b/.exec(lower) ?? /\b(\d+|[a-z]+)\s+(?:people|persons|guests|adults)\b/.exec(lower);
  if (forM) {
    const n = forM[1] === "a" || forM[1] === "an" ? null : num(forM[1]!);
    if (n && n >= 1 && n <= 50) {
      servings = n;
      understood.push(`For ${n}`);
      take(new RegExp(forM[0]!.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }

  // Budget: "under $50", "less than 30 dollars", "$20 or less".
  let budgetCents: number | null = null;
  const money = /\b(?:under|below|less than|max(?:imum)?|within|up to|no more than)\s+\$?\s?(\d+(?:\.\d{1,2})?)\s*(?:dollars|bucks)?/.exec(lower) ?? /\$\s?(\d+(?:\.\d{1,2})?)\s*(?:or less|max|budget)?/.exec(lower);
  if (money) {
    budgetCents = Math.round(Number(money[1]) * 100);
    understood.push(`Under $${Number(money[1])}`);
    take(new RegExp(money[0]!.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  // Time: "quick", "under 30 minutes", "in 20 minutes".
  const mins = /\b(?:in|under|less than|within)\s+(\d+)\s*(?:min|mins|minutes)\b/.exec(lower);
  if (mins) {
    query.maxMinutes = Number(mins[1]);
    understood.push(`${mins[1]} min or less`);
    take(new RegExp(mins[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } else if (/\b(quick|fast|weeknight|speedy)\b/.test(lower)) {
    query.maxMinutes = 30;
    understood.push("30 min or less");
    take(/\b(quick|fast|weeknight|speedy)\b/);
  }

  // How many: "five cheap dinners", "3 ideas".
  let count: number | null = null;
  const many = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:\w+\s+){0,2}(?:dinners|meals|recipes|ideas|dishes|options|lunches|breakfasts)\b/.exec(lower);
  if (many && !(servings && forM && many.index === forM.index)) {
    count = num(many[1]!);
    if (count) {
      understood.push(`${count} ideas`);
      take(new RegExp(`\\b${many[1]}\\b`));
    }
  }

  // Quality / difficulty.
  if (/\b(restaurant[- ]quality|restaurant[- ]style|fine[- ]dining|fancy|impressive|show[- ]?stopper|elevated|gourmet|chef[- ]level)\b/.test(lower)) {
    query.minSkill = 3;
    understood.push("Restaurant-quality");
    take(/\b(restaurant[- ]quality|restaurant[- ]style|fine[- ]dining|fancy|impressive|show[- ]?stopper|elevated|gourmet|chef[- ]level)\b/);
  } else if (/\b(easy|simple|beginner|no[- ]fuss|foolproof)\b/.test(lower)) {
    query.maxSkill = 2;
    understood.push("Easy");
    take(/\b(easy|simple|beginner|no[- ]fuss|foolproof)\b/);
  }

  // Categories, proteins, diets, equipment.
  const categories = new Set<RecipeCategory>();
  for (const [re, cat, label] of CATEGORY_WORDS) {
    if (re.test(lower)) {
      categories.add(cat);
      understood.push(label);
      if (cat !== "grilling" && cat !== "seafood_raw_bar") take(re);
    }
  }
  if (categories.size) query.categories = [...categories];
  // "cheap" isn't a hard filter (we only know real prices from the store), it's a ranking hint.
  if (categories.has("budget")) query.categories = query.categories!.filter((c) => c !== "budget");
  if (query.categories?.length === 0) delete query.categories;

  for (const [re, diet, label] of DIET_WORDS) {
    if (re.test(lower)) {
      query.diet = [...(query.diet ?? []), diet];
      understood.push(label);
      take(re);
    }
  }
  if (opts.dietStyle && opts.dietStyle !== "omnivore" && !query.diet?.includes(opts.dietStyle)) query.diet = [...(query.diet ?? []), opts.dietStyle];

  const ingredientMatch = /\b(?:using|with|from|featuring|made with)\s+([a-z][a-z -]{2,40}?)(?=$|[,.!?]| for | under | in | that | and )/.exec(lower);
  if (ingredientMatch) {
    const ing = ingredientMatch[1]!.trim().replace(/\b(some|the|my|our|leftover)\b/g, "").trim();
    if (ing && !STOP.has(ing)) {
      query.ingredients = [ing];
      understood.push(`Uses ${ing}`);
      take(new RegExp(`\\b${ingredientMatch[0]!.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    }
  }
  const proteins = new Set<string>();
  for (const [re, p] of PROTEIN_WORDS) if (re.test(rest) && !query.ingredients?.some((i) => re.test(i))) proteins.add(p);

  for (const [re, eq, label] of EQUIPMENT_WORDS) {
    if (re.test(lower)) {
      understood.push(label);
      query.needsEquipment = [...(query.needsEquipment ?? []), eq];
      take(re);
    }
  }

  // Variety: "completely different", "something new", "never had".
  let variety: VarietyMode | null = null;
  let avoidRecent = false;
  if (/\b(completely different|something different|something new|never (had|tried|made)|surprise|new to us|mix it up|different from (last|what))\b/.test(lower)) {
    variety = "adventurous";
    avoidRecent = true;
    understood.push("Something new");
  } else if (/\b(favou?rites?|again|usual|tried and true)\b/.test(lower)) {
    variety = "familiar";
    understood.push("Favourites");
  }

  // Whole meal or menu?
  let menuTemplate: string | null = null;
  for (const [re, code] of MENU_HINTS) {
    if (re.test(lower)) {
      menuTemplate = code;
      break;
    }
  }
  const wantsMenu = menuTemplate !== null || /\b(menu|feast|spread|tower|dinner for|meal for|party)\b/.test(lower) || (servings !== null && budgetCents !== null);
  if (!menuTemplate && wantsMenu && query.cuisines?.length === 1) menuTemplate = `cuisine:${query.cuisines[0]}`;

  // Whatever's left are dish words ("beef wellington", "pad see ew").
  const leftover = rest
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && num(w) === null);
  // Proteins only become a filter when they aren't part of a dish name already in the words.
  const dishWords = leftover.join(" ");
  if (proteins.size && !(leftover.length > proteins.size)) {
    query.proteins = [...proteins];
    understood.push(...[...proteins].map((p) => p[0]!.toUpperCase() + p.slice(1)));
  }
  if (dishWords && leftover.length > (query.proteins?.length ?? 0)) query.text = `${dishWords} ${query.text ?? ""}`.trim();
  else if (query.text) query.text = query.text.trim();
  if (!query.text) delete query.text;

  return { query, servings, budgetCents, count, wantsMenu, menuTemplate, variety, avoidRecent, understood: [...new Set(understood)] };
}
