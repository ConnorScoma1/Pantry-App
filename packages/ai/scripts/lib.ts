/**
 * Shared helpers for the AI proof-of-concept and quality-test scripts.
 * Server-side tools: run with `npm run ai:poc` / `npm run ai:eval` from the
 * repo root. Keys are read from apps/web/.env.local (or the environment) and
 * never printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPE_SELECT, recipeRowToRecipe, type RecipeRow } from "@kitchen-pantry/database";
import { catalogRecipes, isCookable, rankRecipes, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import type { OnboardingProfile, Recipe } from "@kitchen-pantry/shared-types";
import { defaultOnboardingProfile } from "@kitchen-pantry/validation";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Load KEY=VALUE lines from apps/web/.env.local into process.env (existing values win). */
export function loadWebEnv(): string | null {
  const file = resolve(ROOT, "apps/web/.env.local");
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
  }
  return file;
}

export function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
}
export const flag = (name: string) => process.argv.includes(`--${name}`);

/**
 * Recipes "already stored in Supabase": read with the server's service role
 * key when it's set (public recipes only), otherwise the bundled catalogue
 * that supabase/seed_recipes.sql is generated from (the same recipes).
 */
export async function loadRecipes(): Promise<{ recipes: Recipe[]; source: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const q = `${url.replace(/\/$/, "")}/rest/v1/recipes?select=${encodeURIComponent(RECIPE_SELECT)}&visibility=eq.public&limit=1000`;
    const res = await fetch(q, { headers: { apikey: key, authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase returned ${res.status} reading recipes.`);
    const rows = (await res.json()) as RecipeRow[];
    return { recipes: rows.map(recipeRowToRecipe).filter(isCookable), source: `Supabase (${rows.length} public recipes)` };
  }
  return { recipes: catalogRecipes.filter(isCookable), source: "bundled catalogue (the recipes seed_recipes.sql loads into Supabase) — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read your database instead" };
}

/** A sample household, changed by `patch`. */
export function sampleProfile(patch: (p: OnboardingProfile) => void = () => {}): OnboardingProfile {
  const p = defaultOnboardingProfile();
  p.household.postalCode = "53132";
  p.household.adults = 2;
  p.household.cookingFor = 2;
  p.household.dinnersPerWeek = 7;
  p.goals.ranked = ["save_money", "reduce_waste"];
  p.skillLevel = 3;
  p.equipment = ["stove", "oven", "blender", "dutch_oven", "cast_iron", "food_processor"];
  patch(p);
  return p;
}

export function rank(recipes: Recipe[], profile: OnboardingProfile, today: string): RankedRecipe[] {
  return rankRecipes(recipes, { profile, pantry: [], today, favorites: new Set(), ratings: new Map(), myRatings: new Map(), seasonal: null, taste: null }).recipes;
}

/** The seven days of next week (Monday first). */
export function nextWeek(from = new Date()): string[] {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

export const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(micros < 10_000 ? 5 : 4)}`;
