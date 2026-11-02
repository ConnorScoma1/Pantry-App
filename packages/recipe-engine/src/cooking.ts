import type { AllergenCode, Recipe, RecipeIngredient, RecipeStep } from "@kitchen-pantry/shared-types";
import { matchesAnyTerm, screenAllergens } from "./allergens";
import { formatIngredientLine, formatTemperature } from "./recipes";

/**
 * Cooking mode and Chef mode (spec 01 §11–12). Pure helpers shared by web
 * and mobile: which ingredients each step uses (with scaled amounts),
 * substitutions that respect the household's allergies, and — for
 * multi-component dishes — mise en place and a service timeline.
 */

const STOP = new Set(["fresh", "large", "small", "medium", "boneless", "skinless", "chopped", "minced", "ground", "whole", "dried", "unsalted", "salted", "extra", "virgin", "kosher", "of", "and", "or", "the", "a", "low", "sodium", "baby", "plain", "cold", "hot", "cooked", "florets"]);

function keyWords(item: string): string[] {
  return item
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

const mentions = (body: string, word: string) => new RegExp(`\\b${word.replace(/s$/, "")}(e?s)?\\b`, "i").test(body);

/** Words too general to identify an ingredient on their own ("the sauce"). */
const GENERIC = new Set(["sauce", "mixture", "paste", "powder", "juice", "cream", "seeds", "leaves"]);

/**
 * Ingredients a step uses, so their amounts can sit right in the step
 * ("Add the 1½ lb chicken thighs …"). An ingredient matches when all its
 * main words appear, or when one distinctive word does (a word shared by
 * two ingredients counts only for the one where it's the noun — "rice"
 * is the cooked rice, not the rice vinegar). Prefers the step's component.
 */
export function stepIngredients(step: RecipeStep, ingredients: readonly RecipeIngredient[]): RecipeIngredient[] {
  const hit = (list: readonly RecipeIngredient[]) => {
    const words = list.map((i) => keyWords(i.item));
    const count = new Map<string, number>();
    const nounOf = new Map<string, number>();
    for (const ws of words) {
      for (const w of new Set(ws)) count.set(w, (count.get(w) ?? 0) + 1);
      const noun = ws[ws.length - 1];
      if (noun) nounOf.set(noun, (nounOf.get(noun) ?? 0) + 1);
    }
    return list.filter((_, idx) => {
      const ws = words[idx]!;
      if (ws.length === 0) return false;
      if (ws.every((w) => mentions(step.body, w))) return true;
      const noun = ws[ws.length - 1]!;
      return ws.some(
        (w) => !GENERIC.has(w) && mentions(step.body, w) && (count.get(w) === 1 || (w === noun && nounOf.get(w) === 1)),
      );
    });
  };
  const pool = step.component ? ingredients.filter((i) => i.component === step.component || i.component === null) : ingredients;
  const found = hit(pool);
  return found.length > 0 || !step.component ? found : hit(ingredients);
}

export interface CookingStep extends RecipeStep {
  /** 1-based position across the whole recipe. */
  number: number;
  /** "1½ lb boneless chicken thighs" — scaled. */
  uses: string[];
  /** The first step of a new component ("Tarragon jus"). */
  startsComponent: boolean;
}

/** Steps in order with the scaled amounts each one uses. */
export function cookingSteps(recipe: Pick<Recipe, "steps" | "ingredients">, factor = 1): CookingStep[] {
  const steps = [...recipe.steps].sort((a, b) => a.position - b.position);
  return steps.map((s, i) => ({
    ...s,
    number: i + 1,
    uses: stepIngredients(s, recipe.ingredients).map((ing) => formatIngredientLine(ing, factor)),
    startsComponent: s.component !== null && (i === 0 || steps[i - 1]!.component !== s.component),
  }));
}

/** Planned servings ÷ recipe servings, within sensible kitchen limits. */
export function servingsFactor(recipe: Pick<Recipe, "servings">, servings: number | null | undefined): number {
  if (!servings || servings <= 0 || recipe.servings <= 0) return 1;
  return Math.min(8, Math.max(0.25, servings / recipe.servings));
}

// ---------------------------------------------------------------------------
// Substitutions (curated, never invented; screened against allergies)
// ---------------------------------------------------------------------------
interface SubRule {
  /** Words that identify the ingredient. */
  match: RegExp;
  options: string[];
}

const SUBSTITUTIONS: SubRule[] = [
  { match: /\bshallots?\b/i, options: ["a little red or yellow onion plus a small pinch of garlic", "the white parts of green onions"] },
  { match: /\bbuttermilk\b/i, options: ["1 cup milk with 1 tbsp lemon juice or white vinegar, rested 5 minutes", "plain yogurt thinned with a little milk"] },
  { match: /\bsour cream\b/i, options: ["plain Greek yogurt", "crème fraîche"] },
  { match: /\bgreek yogurt\b/i, options: ["sour cream", "plain yogurt, strained for 30 minutes"] },
  { match: /\bheavy cream\b|\bwhipping cream\b/i, options: ["half-and-half with a little extra butter (won't whip)", "full-fat coconut milk (changes the flavour)"] },
  { match: /\bfresh (thyme|rosemary|oregano|tarragon|sage)\b/i, options: ["dried herb — use about a third as much", "another woody herb you like"] },
  { match: /\bfresh (parsley|cilantro|basil|dill|chives)\b|^(parsley|cilantro|basil|dill|chives)$/i, options: ["another soft herb, or leave it out as a garnish", "a squeeze of lemon and green onion for freshness"] },
  { match: /\bwhite wine\b/i, options: ["chicken or vegetable stock with a splash of white wine vinegar", "dry vermouth"] },
  { match: /\bred wine\b/i, options: ["beef or mushroom stock with a splash of red wine vinegar", "unsweetened cranberry or pomegranate juice, cut with stock"] },
  { match: /\blemon juice\b/i, options: ["lime juice", "white wine vinegar (use a little less)"] },
  { match: /\blime juice\b/i, options: ["lemon juice", "rice vinegar (use a little less)"] },
  { match: /\bsoy sauce\b/i, options: ["tamari (often wheat-free — check the label)", "coconut aminos (sweeter, less salty)"] },
  { match: /\bfish sauce\b/i, options: ["soy sauce with a squeeze of lime", "a little anchovy paste"] },
  { match: /\bhoney\b/i, options: ["maple syrup", "brown sugar dissolved in a little water"] },
  { match: /\bbrown sugar\b/i, options: ["white sugar with a little molasses", "coconut sugar"] },
  { match: /\bpanko\b|\bbreadcrumbs?\b/i, options: ["crushed crackers", "rolled oats, pulsed fine"] },
  { match: /\bparmesan\b/i, options: ["pecorino romano (saltier)", "grana padano"] },
  { match: /(?<!(peanut|almond|nut|cashew|apple|cocoa|shea|seed) )\bbutter\b(?!milk)/i, options: ["olive oil for cooking (not for baking)", "ghee"] },
  { match: /^(large |medium |whole )?eggs?$/i, options: ["for binding: 1 tbsp ground flaxseed + 3 tbsp water per egg, rested 5 minutes"] },
  { match: /\ball-purpose flour\b|^flour$/i, options: ["for thickening: half as much cornstarch, mixed with cold water first"] },
  { match: /\bcornstarch\b/i, options: ["twice as much all-purpose flour, cooked a little longer", "arrowroot"] },
  { match: /\bchicken (stock|broth)\b/i, options: ["vegetable stock", "water with a little extra salt and a bay leaf"] },
  { match: /\bbeef (stock|broth)\b/i, options: ["mushroom or vegetable stock", "chicken stock"] },
  { match: /\bricotta\b/i, options: ["cottage cheese, blended smooth", "mascarpone (richer)"] },
  { match: /\bdijon\b/i, options: ["whole-grain mustard", "yellow mustard with a pinch of extra salt"] },
  { match: /\bgarlic\b(?! (powder|salt|chili|paste))/i, options: ["garlic powder — about ⅛ tsp per clove"] },
  { match: /\bfresh ginger\b|^ginger$/i, options: ["ground ginger — about ¼ tsp per tbsp fresh"] },
  { match: /\bjasmine rice\b|\bbasmati rice\b/i, options: ["any long-grain white rice"] },
  { match: /\bzucchini\b/i, options: ["yellow squash", "eggplant (cook a little longer)"] },
  { match: /\bspinach\b/i, options: ["kale, stems removed (cook longer)", "Swiss chard"] },
];

export interface SubstitutionContext {
  allergies: readonly AllergenCode[];
  /** Never recommend / dislikes — substitutes mentioning these are dropped. */
  avoid?: readonly string[];
}

/** Curated swaps for an ingredient, minus anything the household can't have. */
export function substitutionsFor(item: string, ctx: SubstitutionContext): string[] {
  const rule = SUBSTITUTIONS.find((r) => r.match.test(item.trim()));
  if (!rule) return [];
  return rule.options.filter((o) => screenAllergens([o], ctx.allergies).conflicts.length === 0 && matchesAnyTerm([o], ctx.avoid ?? []).length === 0);
}

// ---------------------------------------------------------------------------
// Chef mode: mise en place and a service timeline
// ---------------------------------------------------------------------------
export function isChefRecipe(recipe: Pick<Recipe, "skillLevel" | "steps">): boolean {
  const components = new Set(recipe.steps.map((s) => s.component).filter(Boolean));
  return recipe.skillLevel >= 4 || components.size >= 3;
}

export interface MiseEnPlace {
  component: string | null;
  /** "2 shallots, finely diced" — scaled; only items that need prep or measuring. */
  tasks: string[];
}

/** Everything to measure, cut and set out before the heat goes on, by component. */
export function miseEnPlace(recipe: Pick<Recipe, "ingredients">, factor = 1): MiseEnPlace[] {
  const groups = new Map<string | null, string[]>();
  for (const i of [...recipe.ingredients].sort((a, b) => a.position - b.position)) {
    if (i.quantity === null && !i.preparation) continue; // "salt to taste" needs no set-up
    const list = groups.get(i.component) ?? [];
    list.push(formatIngredientLine(i, factor) + (i.optional ? " (optional)" : ""));
    groups.set(i.component, list);
  }
  return [...groups].map(([component, tasks]) => ({ component, tasks }));
}

/** Minutes a step takes: its timer, or a working estimate for hands-on steps. */
export function stepMinutes(step: Pick<RecipeStep, "timerSeconds" | "body">): number {
  if (step.timerSeconds && step.timerSeconds > 0) return Math.max(1, Math.round(step.timerSeconds / 60));
  const words = step.body.split(/\s+/).length;
  return words > 45 ? 8 : words > 25 ? 5 : 3;
}

export interface TimelineEntry {
  /** Minutes before service this starts (e.g. 75 = "1 hr 15 min before"). */
  startsBefore: number;
  minutes: number;
  component: string | null;
  step: number;
  summary: string;
}

/**
 * A simple running order, working back from service: each step in recipe
 * order, with its timer or an estimate. Real kitchens overlap components —
 * the apps say so — but this tells the cook when to start.
 */
export function serviceTimeline(recipe: Pick<Recipe, "steps">): { totalMinutes: number; entries: TimelineEntry[] } {
  const steps = [...recipe.steps].sort((a, b) => a.position - b.position);
  const minutes = steps.map(stepMinutes);
  const total = minutes.reduce((a, b) => a + b, 0);
  let elapsed = 0;
  const entries = steps.map((s, i) => {
    const entry: TimelineEntry = {
      startsBefore: total - elapsed,
      minutes: minutes[i]!,
      component: s.component,
      step: i + 1,
      summary: firstSentence(s.body),
    };
    elapsed += minutes[i]!;
    return entry;
  });
  return { totalMinutes: total, entries };
}

function firstSentence(body: string): string {
  const s = body.split(/(?<=[.!?])\s/)[0] ?? body;
  return s.length > 110 ? `${s.slice(0, 107).trimEnd()}…` : s;
}

/** "6:15 PM" for a step that starts `startsBefore` minutes before `serveAt`. */
export function clockTime(serveAt: Date, startsBefore: number): string {
  return new Date(serveAt.getTime() - startsBefore * 60_000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Curated, no-AI help for a step: its safe temperature and swaps for what it uses. */
export function cookingTips(recipe: Pick<Recipe, "steps" | "ingredients">, step: number, allergies: readonly AllergenCode[], avoid: readonly string[] = []): string[] {
  const s = cookingSteps(recipe)[Math.min(Math.max(0, step), recipe.steps.length - 1)];
  if (!s) return [];
  const out: string[] = [];
  if (s.safeInternalTempC !== null) out.push(`Safe to eat at ${formatTemperature(s.safeInternalTempC)} in the thickest part — check with a thermometer.`);
  for (const i of stepIngredients(s, recipe.ingredients)) {
    const subs = substitutionsFor(i.item, { allergies, avoid });
    if (subs.length > 0) out.push(`No ${i.item}? Try ${subs.join(", or ")}.`);
  }
  return out;
}
