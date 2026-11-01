import type { IngredientOption, PantryCategory, StorageLocation } from "@kitchen-pantry/shared-types";

/**
 * Common staples for the "tick what you already have" checklist.
 * Mirrors the ingredients seeded in supabase/seed.sql — a unit test keeps
 * the two lists in sync. In Supabase mode the database ids are used; in
 * preview mode these entries are used directly.
 */
interface StapleDef {
  name: string;
  category: PantryCategory;
  defaultUnit: string;
  storageLocation: StorageLocation;
  aliases: string[];
  /** Shown in the staples checklist (vs. only searchable). */
  isCommonStaple: boolean;
}

export const STAPLES: readonly StapleDef[] = [
  { name: "kosher salt", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: ["salt"], isCommonStaple: true },
  { name: "black pepper", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: ["pepper", "ground black pepper"], isCommonStaple: true },
  { name: "garlic powder", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: [], isCommonStaple: true },
  { name: "onion powder", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: [], isCommonStaple: true },
  { name: "paprika", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: ["sweet paprika"], isCommonStaple: true },
  { name: "ground cumin", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: ["cumin"], isCommonStaple: true },
  { name: "dried oregano", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: ["oregano"], isCommonStaple: true },
  { name: "red pepper flakes", category: "spice", defaultUnit: "g", storageLocation: "pantry", aliases: ["crushed red pepper", "chili flakes"], isCommonStaple: true },
  { name: "olive oil", category: "oil", defaultUnit: "ml", storageLocation: "pantry", aliases: ["extra virgin olive oil", "evoo"], isCommonStaple: true },
  { name: "vegetable oil", category: "oil", defaultUnit: "ml", storageLocation: "pantry", aliases: ["canola oil", "neutral oil"], isCommonStaple: true },
  { name: "all-purpose flour", category: "baking", defaultUnit: "g", storageLocation: "pantry", aliases: ["flour", "plain flour"], isCommonStaple: true },
  { name: "granulated sugar", category: "baking", defaultUnit: "g", storageLocation: "pantry", aliases: ["sugar", "white sugar"], isCommonStaple: true },
  { name: "brown sugar", category: "baking", defaultUnit: "g", storageLocation: "pantry", aliases: ["light brown sugar"], isCommonStaple: true },
  { name: "baking soda", category: "baking", defaultUnit: "g", storageLocation: "pantry", aliases: ["bicarbonate of soda"], isCommonStaple: true },
  { name: "baking powder", category: "baking", defaultUnit: "g", storageLocation: "pantry", aliases: [], isCommonStaple: true },
  { name: "soy sauce", category: "sauce", defaultUnit: "ml", storageLocation: "pantry", aliases: ["shoyu"], isCommonStaple: true },
  { name: "dijon mustard", category: "condiment", defaultUnit: "g", storageLocation: "fridge", aliases: ["mustard"], isCommonStaple: true },
  { name: "ketchup", category: "condiment", defaultUnit: "g", storageLocation: "fridge", aliases: [], isCommonStaple: true },
  { name: "mayonnaise", category: "condiment", defaultUnit: "g", storageLocation: "fridge", aliases: ["mayo"], isCommonStaple: true },
  { name: "honey", category: "condiment", defaultUnit: "ml", storageLocation: "pantry", aliases: [], isCommonStaple: true },
  { name: "white rice", category: "rice", defaultUnit: "g", storageLocation: "pantry", aliases: ["long-grain rice", "jasmine rice"], isCommonStaple: true },
  { name: "spaghetti", category: "pasta", defaultUnit: "g", storageLocation: "pantry", aliases: ["pasta"], isCommonStaple: true },
  { name: "chicken broth", category: "canned", defaultUnit: "ml", storageLocation: "pantry", aliases: ["chicken stock"], isCommonStaple: true },
  { name: "canned diced tomatoes", category: "canned", defaultUnit: "g", storageLocation: "pantry", aliases: ["diced tomatoes"], isCommonStaple: true },
  { name: "butter", category: "dairy", defaultUnit: "g", storageLocation: "fridge", aliases: ["unsalted butter"], isCommonStaple: true },
  { name: "large eggs", category: "dairy", defaultUnit: "each", storageLocation: "fridge", aliases: ["eggs", "egg"], isCommonStaple: true },
  { name: "whole milk", category: "dairy", defaultUnit: "ml", storageLocation: "fridge", aliases: ["milk"], isCommonStaple: false },
  { name: "yellow onion", category: "produce", defaultUnit: "each", storageLocation: "counter", aliases: ["onion"], isCommonStaple: true },
  { name: "garlic", category: "produce", defaultUnit: "each", storageLocation: "counter", aliases: ["garlic cloves", "garlic bulb"], isCommonStaple: true },
  { name: "lemon", category: "produce", defaultUnit: "each", storageLocation: "fridge", aliases: ["lemons"], isCommonStaple: false },
];

/** Capitalise for display: "kosher salt" -> "Kosher salt". */
export function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function toOption(s: StapleDef): IngredientOption {
  return {
    id: null,
    name: displayName(s.name),
    category: s.category,
    defaultUnit: s.defaultUnit,
    storageLocation: s.storageLocation,
  };
}

/** Staples shown in the bulk checklist. */
export function stapleChecklist(): IngredientOption[] {
  return STAPLES.filter((s) => s.isCommonStaple).map(toOption);
}

/** Local catalogue search (preview mode, and instant results before the server answers). */
export function searchLocalIngredients(query: string, limit = 8): IngredientOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = STAPLES.map((s) => {
    const names = [s.name, ...s.aliases];
    const starts = names.some((n) => n.startsWith(q));
    const contains = names.some((n) => n.includes(q));
    return { s, score: starts ? 2 : contains ? 1 : 0 };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map((x) => toOption(x.s));
}
