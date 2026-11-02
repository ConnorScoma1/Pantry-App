/**
 * Standard units for imported ingredients (spec 08 §6: standardized
 * quantities and units). Sources write "Tbsp", "tablespoons", "T." or "g";
 * the library stores one spelling per unit, and amounts outside a sane range
 * are rejected so a typo ("100 cups salt") never reaches a kitchen.
 */
export interface UnitInfo {
  code: string;
  kind: "volume" | "weight" | "count";
  /** Largest believable amount in one ingredient line for a recipe of up to 50 servings. */
  max: number;
  /** Grams or millilitres per unit (count units: null). */
  metric: number | null;
}

export const UNITS: Record<string, UnitInfo> = {
  tsp: { code: "tsp", kind: "volume", max: 48, metric: 4.93 },
  tbsp: { code: "tbsp", kind: "volume", max: 64, metric: 14.79 },
  cup: { code: "cup", kind: "volume", max: 40, metric: 236.6 },
  "fl oz": { code: "fl oz", kind: "volume", max: 256, metric: 29.57 },
  pint: { code: "pint", kind: "volume", max: 20, metric: 473.2 },
  quart: { code: "quart", kind: "volume", max: 12, metric: 946.4 },
  gallon: { code: "gallon", kind: "volume", max: 4, metric: 3785 },
  ml: { code: "ml", kind: "volume", max: 10_000, metric: 1 },
  l: { code: "l", kind: "volume", max: 12, metric: 1000 },
  oz: { code: "oz", kind: "weight", max: 400, metric: 28.35 },
  lb: { code: "lb", kind: "weight", max: 40, metric: 453.6 },
  g: { code: "g", kind: "weight", max: 12_000, metric: 1 },
  kg: { code: "kg", kind: "weight", max: 18, metric: 1000 },
  pinch: { code: "pinch", kind: "volume", max: 8, metric: 0.3 },
  dash: { code: "dash", kind: "volume", max: 16, metric: 0.6 },
  drop: { code: "drop", kind: "volume", max: 40, metric: 0.05 },
  clove: { code: "clove", kind: "count", max: 60, metric: null },
  can: { code: "can", kind: "count", max: 20, metric: null },
  sprig: { code: "sprig", kind: "count", max: 40, metric: null },
  bunch: { code: "bunch", kind: "count", max: 12, metric: null },
  slice: { code: "slice", kind: "count", max: 60, metric: null },
  stick: { code: "stick", kind: "count", max: 16, metric: null },
  sheet: { code: "sheet", kind: "count", max: 40, metric: null },
  head: { code: "head", kind: "count", max: 12, metric: null },
  piece: { code: "piece", kind: "count", max: 100, metric: null },
  package: { code: "package", kind: "count", max: 12, metric: null },
  jar: { code: "jar", kind: "count", max: 12, metric: null },
  stalk: { code: "stalk", kind: "count", max: 30, metric: null },
  leaf: { code: "leaf", kind: "count", max: 60, metric: null },
  fillet: { code: "fillet", kind: "count", max: 30, metric: null },
};

/** Things written without a unit ("3 eggs", "1 lemon"). */
export const MAX_COUNT_WITHOUT_UNIT = 120;

const ALIASES: Record<string, string> = {
  teaspoon: "tsp", teaspoons: "tsp", t: "tsp", tsps: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", tbl: "tbsp", tbsps: "tbsp", T: "tbsp",
  cups: "cup", c: "cup",
  "fluid ounce": "fl oz", "fluid ounces": "fl oz", floz: "fl oz", "fl. oz": "fl oz",
  pints: "pint", pt: "pint", quarts: "quart", qt: "quart", gallons: "gallon", gal: "gallon",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", mL: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l", L: "l",
  ounce: "oz", ounces: "oz",
  pound: "lb", pounds: "lb", lbs: "lb",
  gram: "g", grams: "g", gr: "g", kilogram: "kg", kilograms: "kg", kgs: "kg",
  pinches: "pinch", dashes: "dash", drops: "drop",
  cloves: "clove", cans: "can", tin: "can", tins: "can", sprigs: "sprig", bunches: "bunch",
  slices: "slice", sticks: "stick", sheets: "sheet", heads: "head", pieces: "piece", pcs: "piece",
  packages: "package", pkg: "package", packet: "package", packets: "package", jars: "jar",
  stalks: "stalk", ribs: "stalk", rib: "stalk", leaves: "leaf", fillets: "fillet",
};

/** The standard unit code, null for "no unit", or undefined when it isn't recognised. */
export function normalizeUnit(unit: string | null | undefined): string | null | undefined {
  if (unit === null || unit === undefined) return null;
  const raw = unit.trim().replace(/\.$/, "");
  if (raw === "") return null;
  if (UNITS[raw]) return raw;
  if (ALIASES[raw]) return ALIASES[raw];
  const lower = raw.toLowerCase();
  if (UNITS[lower]) return lower;
  return ALIASES[lower];
}

/** Parse "1 1/2", "1½", "0.75", "3/4" → number. Null for "to taste" or blank. */
export function parseQuantity(value: number | string | null | undefined): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const glyphs: Record<string, string> = { "½": " 1/2", "⅓": " 1/3", "⅔": " 2/3", "¼": " 1/4", "¾": " 3/4", "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8" };
  const text = value.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (g) => glyphs[g]!).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(text);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  return undefined;
}
