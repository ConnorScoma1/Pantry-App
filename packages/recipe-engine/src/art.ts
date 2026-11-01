import type { Recipe } from "@kitchen-pantry/shared-types";

/**
 * Recipe tiles are typographic (a cuisine colour plus a simple icon) until
 * licensed food photography exists — we never show stock or AI "photos" of
 * a dish. Web and mobile both use this so a recipe looks the same everywhere.
 */
export type RecipeArtKind = "fish" | "poultry" | "meat" | "soup" | "pot" | "grain" | "veg";

const CUISINE_HUES: Record<string, number> = {
  american: 18,
  italian: 8,
  mexican: 32,
  chinese: 0,
  japanese: 350,
  korean: 340,
  thai: 140,
  vietnamese: 150,
  indian: 38,
  mediterranean: 195,
  middle_eastern: 28,
  french: 265,
  spanish: 12,
  southern: 24,
  caribbean: 170,
};

export function recipeArt(recipe: Pick<Recipe, "cuisine" | "title" | "ingredients">): { hue: number; kind: RecipeArtKind } {
  const hue = CUISINE_HUES[recipe.cuisine ?? ""] ?? 140;
  const text = recipe.ingredients.map((i) => i.item).join(" ").toLowerCase();
  const title = recipe.title.toLowerCase();
  let kind: RecipeArtKind = "veg";
  if (/salmon|scallop|shrimp|fish|cod/.test(text)) kind = "fish";
  else if (/chicken|turkey/.test(text)) kind = "poultry";
  else if (/beef|short rib|steak|pork/.test(text)) kind = "meat";
  else if (/risotto|rice|chili|broth/.test(text) && !/tortilla/.test(text)) kind = title.includes("chili") ? "soup" : "pot";
  else if (/penne|pasta|noodle|spaghetti|tortilla/.test(text)) kind = "grain";
  return { hue, kind };
}

/** Tile colours as CSS/React Native `hsl()` strings, for light or dark mode. */
export function recipeArtColors(hue: number, dark: boolean): { background: string; ring: string; foreground: string } {
  return dark
    ? { background: `hsl(${hue}, 22%, 18%)`, ring: `hsl(${hue}, 22%, 23%)`, foreground: `hsl(${hue}, 40%, 72%)` }
    : { background: `hsl(${hue}, 42%, 90%)`, ring: `hsl(${hue}, 45%, 84%)`, foreground: `hsl(${hue}, 35%, 32%)` };
}
