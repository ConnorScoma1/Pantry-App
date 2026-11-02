import type { Season } from "@kitchen-pantry/shared-types";

/**
 * In-season produce by season, from the USDA SNAP-Ed "Seasonal Produce Guide"
 * (https://snaped.fns.usda.gov/resources/nutrition-education-materials/seasonal-produce-guide),
 * a U.S. government work (public domain). Lists copied on 2026-11-01.
 * USDA notes: "Seasonal produce in your area will vary by growing conditions and weather."
 *
 * Items listed in three or four seasons (apples, onions, lemons…) are on
 * shelves all year, so they don't count as "seasonal" when nudging recipes.
 */
export const USDA_SEASONAL_PRODUCE: Record<Season, readonly string[]> = {
  spring: [
    "Apples", "Apricots", "Asparagus", "Avocados", "Bananas", "Blackberries", "Broccoli", "Cabbage", "Carrots", "Celery",
    "Collard Greens", "Garlic", "Herbs", "Kale", "Kiwifruit", "Lemons", "Lettuce", "Limes", "Mushrooms", "Onions", "Peas",
    "Pineapples", "Plantains", "Radishes", "Rhubarb", "Spinach", "Strawberries", "Swiss Chard", "Turnips",
  ],
  summer: [
    "Apples", "Apricots", "Avocados", "Bananas", "Beets", "Bell Peppers", "Blackberries", "Blueberries", "Cantaloupe", "Carrots",
    "Celery", "Cherries", "Corn", "Cucumbers", "Eggplant", "Garlic", "Grapes", "Green Beans", "Herbs", "Honeydew Melon", "Lemons",
    "Lima Beans", "Limes", "Mangos", "Okra", "Onions", "Peaches", "Pears", "Peas", "Pineapples", "Plantains", "Plums", "Raspberries",
    "Strawberries", "Summer Squash", "Tomatillos", "Tomatoes", "Watermelon", "Zucchini",
  ],
  fall: [
    "Apples", "Bananas", "Beets", "Bell Peppers", "Broccoli", "Brussels Sprouts", "Cabbage", "Carrots", "Cauliflower", "Celery",
    "Collard Greens", "Cranberries", "Garlic", "Ginger", "Grapes", "Green Beans", "Herbs", "Kale", "Kiwifruit", "Lemons", "Lettuce",
    "Limes", "Mangos", "Mushrooms", "Okra", "Onions", "Parsnips", "Pears", "Peas", "Plantains", "Pomegranates", "Potatoes", "Pumpkin",
    "Radishes", "Raspberries", "Rutabagas", "Spinach", "Sweet Potatoes & Yams", "Swiss Chard", "Turnips", "Winter Squash",
  ],
  winter: [
    "Apples", "Avocados", "Bananas", "Beets", "Brussels Sprouts", "Cabbage", "Carrots", "Celery", "Collard Greens", "Grapefruit",
    "Grapes", "Herbs", "Kale", "Kiwifruit", "Leeks", "Lemons", "Limes", "Onions", "Oranges", "Parsnips", "Pears", "Plantains",
    "Pomegranates", "Potatoes", "Pumpkin", "Rutabagas", "Sweet Potatoes & Yams", "Swiss Chard", "Turnips", "Winter Squash",
  ],
};

/** How recipe ingredient names refer to each USDA item (lower-case, singular words). */
const ALIASES: Record<string, readonly string[]> = {
  "Sweet Potatoes & Yams": ["sweet potato", "yam"],
  "Winter Squash": ["butternut", "acorn squash", "delicata", "kabocha", "spaghetti squash", "winter squash"],
  "Summer Squash": ["yellow squash", "summer squash", "pattypan"],
  "Collard Greens": ["collard"],
  "Swiss Chard": ["chard"],
  "Honeydew Melon": ["honeydew"],
  "Bell Peppers": ["bell pepper", "red pepper", "green pepper", "yellow pepper"],
  "Green Beans": ["green bean", "string bean", "haricot vert"],
  "Lima Beans": ["lima bean"],
  Peas: ["pea", "snap pea", "snow pea"],
  Corn: ["corn kernel", "sweet corn", "corn on the cob", "ear of corn"],
  Herbs: [],
};

export function singularWord(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (/(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularWord)
    .join(" ");

export interface ProduceItem {
  name: string;
  terms: string[];
}

function termsFor(name: string): string[] {
  if (name in ALIASES) return [...ALIASES[name]!];
  return [normalize(name)];
}

/** Produce that is in season now and NOT on the list year-round. */
export function signatureProduce(season: Season): ProduceItem[] {
  const count = new Map<string, number>();
  for (const list of Object.values(USDA_SEASONAL_PRODUCE)) for (const item of list) count.set(item, (count.get(item) ?? 0) + 1);
  return USDA_SEASONAL_PRODUCE[season]
    .filter((name) => (count.get(name) ?? 0) <= 2)
    .map((name) => ({ name, terms: termsFor(name) }))
    .filter((p) => p.terms.length > 0);
}

/** Which of these produce items an ingredient line names (whole words). */
export function matchProduce(ingredient: string, produce: readonly ProduceItem[]): ProduceItem | null {
  const text = ` ${normalize(ingredient)} `;
  // The last word names the thing ("cherry tomatoes" are tomatoes), so matches there win.
  let best: { item: ProduceItem; rank: number } | null = null;
  for (const p of produce) {
    for (const t of p.terms) {
      if (!text.includes(` ${t} `)) continue;
      const rank = (text.endsWith(` ${t} `) ? 1000 : 0) + t.length;
      if (!best || rank > best.rank) best = { item: p, rank };
    }
  }
  return best?.item ?? null;
}
