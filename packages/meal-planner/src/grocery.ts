import { assessUrgency, canonicalUnit, guessCategory, normalize, STAPLES, subtractInventory } from "@kitchen-pantry/inventory-engine";
import { formatAmount, pantryItemMatches } from "@kitchen-pantry/recipe-engine";
import type { GroceryDepartment, IsoDate, PantryCategory, PantryItem, Quantity, Recipe } from "@kitchen-pantry/shared-types";
import { isShelfStable } from "./planner";

/**
 * Turn the week's meals into one shopping list.
 *
 *  - The same ingredient from several recipes becomes one line, with
 *    amounts scaled to each meal's servings and added up across compatible
 *    units (tbsp + cup → cups; oz + lb → lb). Units that can't be converted
 *    (cloves, cans) are kept as separate amounts, never guessed.
 *  - What's already in the kitchen is subtracted when amounts are tracked.
 *    When an item is in the kitchen without an amount, shelf-stable staples
 *    (salt, oil) count as covered and fresh items say "check how much you have".
 *  - Package sizes and prices come from retailer data (later milestones);
 *    nothing here invents either.
 */

export interface GroceryMealInput {
  recipe: Recipe;
  servings: number;
}

export type GroceryLineStatus = "buy" | "check" | "have";

export interface GroceryLine {
  /** Merge key: the ingredient name, lower-cased. */
  key: string;
  name: string;
  department: GroceryDepartment;
  /** Still to buy, in base units (g, ml, each) or package units (clove, can). */
  quantities: Quantity[];
  /** Human amount, e.g. "1½ lb" or "3 cloves + 1 tbsp". Null for "to taste". */
  amount: string | null;
  neededFor: string[];
  status: GroceryLineStatus;
  note: string | null;
}

export interface GroceryListDraft {
  toBuy: GroceryLine[];
  /** Covered by the kitchen — shown so people can double-check. */
  inKitchen: GroceryLine[];
}

const CATEGORY_TO_DEPARTMENT: Record<PantryCategory, GroceryDepartment> = {
  protein: "meat_seafood",
  produce: "produce",
  dairy: "dairy",
  grain: "bakery",
  pasta: "pantry",
  rice: "pantry",
  canned: "pantry",
  frozen: "frozen",
  spice: "spices",
  oil: "pantry",
  sauce: "pantry",
  condiment: "pantry",
  baking: "pantry",
  other: "other",
};

export function departmentFor(name: string): GroceryDepartment {
  const own = name.toLowerCase().trim();
  const staple = STAPLES.find((s) => s.name === own || s.aliases.includes(own));
  if (staple) return CATEGORY_TO_DEPARTMENT[staple.category];
  const guess = guessCategory(name);
  if (guess) return CATEGORY_TO_DEPARTMENT[guess.category];
  // Fresh herbs and greens the pantry catalogue doesn't list.
  if (/\b(fresh|dill|parsley|cilantro|basil|mint|chives?|scallions?|green onions?|herbs?|arugula|kale)\b/.test(own)) return "produce";
  return "other";
}

const PLURAL: Record<string, string> = { clove: "cloves", can: "cans", sprig: "sprigs", pinch: "pinches", bunch: "bunches", slice: "slices", head: "heads", stalk: "stalks" };

/** Friendly amount for one base-unit quantity (US kitchen units). */
export function formatQuantity(q: Quantity): string {
  const v = q.value;
  if (q.unit === "g") {
    const lb = v / 453.59237;
    if (lb >= 0.75) return `${formatAmount(lb)} lb`;
    return `${formatAmount(Math.max(v / 28.349523125, 0.25))} oz`;
  }
  if (q.unit === "ml") {
    const cups = v / 236.5882365;
    if (cups >= 0.25) return `${formatAmount(cups)} ${cups > 1 ? "cups" : "cup"}`;
    const tbsp = v / 14.78676478125;
    if (tbsp >= 1) return `${formatAmount(tbsp)} tbsp`;
    return `${formatAmount(v / 4.92892159375)} tsp`;
  }
  if (q.unit === "each") return formatAmount(v);
  const unit = v > 1 && PLURAL[q.unit] ? PLURAL[q.unit]! : q.unit;
  return `${formatAmount(v)} ${unit}`;
}

function formatQuantities(qs: Quantity[]): string | null {
  const shown = qs.filter((q) => q.value > 1e-6);
  return shown.length ? shown.map(formatQuantity).join(" + ") : null;
}

interface Acc {
  name: string;
  quantities: Map<string, number>; // base unit -> total
  untracked: boolean; // some recipe gave no amount ("to taste")
  neededFor: Set<string>;
  optionalOnly: boolean;
}

export function buildGroceryList(input: { meals: readonly GroceryMealInput[]; pantry: readonly PantryItem[]; today: IsoDate }): GroceryListDraft {
  const acc = new Map<string, Acc>();
  for (const { recipe, servings } of input.meals) {
    const factor = servings / recipe.servings;
    for (const ing of recipe.ingredients) {
      const key = ing.item.toLowerCase().trim();
      if (["water", "hot water", "ice"].includes(key)) continue;
      const entry = acc.get(key) ?? { name: ing.item, quantities: new Map(), untracked: false, neededFor: new Set(), optionalOnly: true };
      entry.neededFor.add(recipe.title);
      if (!ing.optional) entry.optionalOnly = false;
      if (ing.quantity === null) entry.untracked = true;
      else {
        const n = normalize({ value: ing.quantity * factor, unit: ing.unit ? canonicalUnit(ing.unit) : "each" });
        entry.quantities.set(n.unit, (entry.quantities.get(n.unit) ?? 0) + n.value);
      }
      acc.set(key, entry);
    }
  }

  const usable = input.pantry.filter((p) => assessUrgency(p.useBy, input.today).usable);
  const toBuy: GroceryLine[] = [];
  const inKitchen: GroceryLine[] = [];

  for (const [key, entry] of acc) {
    if (entry.optionalOnly) continue; // optional garnishes aren't put on the list automatically
    const needed: Quantity[] = [...entry.quantities.entries()].map(([unit, value]) => ({ unit, value }));
    const matches = usable.filter((p) => pantryItemMatches(entry.name, p));
    const base = {
      key,
      name: entry.name,
      department: departmentFor(entry.name),
      neededFor: [...entry.neededFor].sort(),
    };

    if (matches.length === 0) {
      toBuy.push({ ...base, quantities: needed, amount: formatQuantities(needed), status: "buy", note: null });
      continue;
    }

    const tracked = matches.filter((p) => p.quantity !== null && p.unit);
    if (tracked.length === 0) {
      // In the kitchen without an amount.
      if (isShelfStable(entry.name) || matches.some((m) => m.isStaple)) {
        inKitchen.push({ ...base, quantities: needed, amount: formatQuantities(needed), status: "have", note: null });
      } else {
        toBuy.push({ ...base, quantities: needed, amount: formatQuantities(needed), status: "check", note: "You have some — check you have enough" });
      }
      continue;
    }

    const available: Quantity[] = tracked.map((p) => ({ value: p.quantity!, unit: p.unit! }));
    const still: Quantity[] = [];
    let incomparable = false;
    for (const need of needed) {
      const cov = subtractInventory(need, available);
      if (cov.incomparable.length === available.length && cov.covered.value === 0) incomparable = true;
      if (cov.stillNeeded.value > 1e-6) still.push(cov.stillNeeded);
    }
    if (incomparable) {
      toBuy.push({ ...base, quantities: needed, amount: formatQuantities(needed), status: "check", note: "You have some — check you have enough" });
    } else if (still.length === 0 && !entry.untracked) {
      inKitchen.push({ ...base, quantities: needed, amount: formatQuantities(needed), status: "have", note: null });
    } else {
      toBuy.push({ ...base, quantities: still, amount: formatQuantities(still), status: "buy", note: "Part of it is already in your kitchen" });
    }
  }

  const order = (a: GroceryLine, b: GroceryLine) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
  return { toBuy: toBuy.sort(order), inKitchen: inKitchen.sort(order) };
}
