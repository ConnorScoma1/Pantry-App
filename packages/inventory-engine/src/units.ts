import type { BaseUnit, Quantity } from "@kitchen-pantry/shared-types";

/**
 * Unit normalisation. Every measurable quantity is converted to one of three
 * base units: grams (mass), millilitres (volume) or "each" (countable).
 * Package-style units ("can", "bunch", "clove") are kept as their own unit
 * and never silently converted — a can of tomatoes is not N grams unless a
 * product record says so.
 */

interface UnitDef {
  base: BaseUnit;
  factor: number;
}

const UNIT_TABLE: Record<string, UnitDef> = {
  // mass
  mg: { base: "g", factor: 0.001 },
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  oz: { base: "g", factor: 28.349523125 },
  lb: { base: "g", factor: 453.59237 },
  // volume (US customary)
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  tsp: { base: "ml", factor: 4.92892159375 },
  tbsp: { base: "ml", factor: 14.78676478125 },
  fl_oz: { base: "ml", factor: 29.5735295625 },
  cup: { base: "ml", factor: 236.5882365 },
  pint: { base: "ml", factor: 473.176473 },
  quart: { base: "ml", factor: 946.352946 },
  gallon: { base: "ml", factor: 3785.411784 },
  // count
  each: { base: "each", factor: 1 },
  dozen: { base: "each", factor: 12 },
};

const ALIASES: Record<string, string> = {
  milligram: "mg",
  milligrams: "mg",
  gram: "g",
  grams: "g",
  gr: "g",
  kilogram: "kg",
  kilograms: "kg",
  kgs: "kg",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  teaspoon: "tsp",
  teaspoons: "tsp",
  t: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  tbl: "tbsp",
  "fl oz": "fl_oz",
  "fl. oz": "fl_oz",
  "fluid ounce": "fl_oz",
  "fluid ounces": "fl_oz",
  cups: "cup",
  c: "cup",
  pints: "pint",
  pt: "pint",
  quarts: "quart",
  qt: "quart",
  gallons: "gallon",
  gal: "gallon",
  count: "each",
  ct: "each",
  ea: "each",
  piece: "each",
  pieces: "each",
  whole: "each",
  "": "each",
};

/** Lower-case, trim and resolve aliases. Unknown units are returned cleaned. */
export function canonicalUnit(unit: string): string {
  if (unit.trim() === "T") return "tbsp"; // recipe convention: capital T = tablespoon
  const cleaned = unit.trim().toLowerCase().replace(/\.$/, "");
  return ALIASES[cleaned] ?? cleaned;
}

export interface NormalizedQuantity {
  value: number;
  unit: BaseUnit | string;
  /** True when `unit` is one of the convertible base units. */
  isBase: boolean;
}

/** Convert a quantity to its base unit, or keep a package-style unit as-is. */
export function normalize(quantity: Quantity): NormalizedQuantity {
  if (!Number.isFinite(quantity.value) || quantity.value < 0) {
    throw new RangeError(`Invalid quantity value: ${quantity.value}`);
  }
  const unit = canonicalUnit(quantity.unit);
  const def = UNIT_TABLE[unit];
  if (!def) return { value: quantity.value, unit, isBase: false };
  return { value: quantity.value * def.factor, unit: def.base, isBase: true };
}

export interface ConversionHints {
  /** Grams per millilitre, to bridge mass <-> volume (e.g. flour ≈ 0.53). */
  densityGPerMl?: number;
  /** Grams per single item, to bridge each <-> mass (e.g. 1 lemon ≈ 100 g). */
  gramsPerEach?: number;
}

/**
 * Convert between any two units. Returns null when the conversion is not
 * knowable from the data given — callers must handle that rather than guess.
 */
export function convert(
  quantity: Quantity,
  toUnit: string,
  hints: ConversionHints = {},
): number | null {
  const from = normalize(quantity);
  const target = canonicalUnit(toUnit);
  const targetDef = UNIT_TABLE[target];

  if (!from.isBase || !targetDef) {
    return from.unit === target ? from.value : null;
  }

  let baseValue = from.value;
  let base = from.unit as BaseUnit;

  if (base !== targetDef.base) {
    const grams = toGrams(baseValue, base, hints);
    if (grams === null) return null;
    const bridged = fromGrams(grams, targetDef.base, hints);
    if (bridged === null) return null;
    baseValue = bridged;
    base = targetDef.base;
  }

  return baseValue / targetDef.factor;
}

function toGrams(value: number, base: BaseUnit, hints: ConversionHints): number | null {
  if (base === "g") return value;
  if (base === "ml") return hints.densityGPerMl ? value * hints.densityGPerMl : null;
  return hints.gramsPerEach ? value * hints.gramsPerEach : null;
}

function fromGrams(grams: number, base: BaseUnit, hints: ConversionHints): number | null {
  if (base === "g") return grams;
  if (base === "ml") return hints.densityGPerMl ? grams / hints.densityGPerMl : null;
  return hints.gramsPerEach ? grams / hints.gramsPerEach : null;
}

/** Round for display without losing meaningful precision. */
export function roundQuantity(value: number): number {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}
