import { assessUrgency, convert } from "@kitchen-pantry/inventory-engine";
import type { IsoDate, PantryItem, Recipe } from "@kitchen-pantry/shared-types";
import { formatIngredientLine, pantryItemMatches } from "./recipes";

/**
 * "Update My Kitchen" after cooking (spec 01 §5, inventory intelligence):
 * offer to take what the recipe used out of the kitchen. Nothing changes
 * until the household confirms (spec: "never assume an ingredient has been
 * consumed without the user's confirmation").
 *
 *  - Amounts are subtracted only when the kitchen item's amount and the
 *    recipe's amount can be compared (same kind of unit: weight, volume or
 *    count). Those start ticked.
 *  - When they can't be compared (an untracked jar, cups vs a 5 oz bag) the
 *    household chooses: still have some, or used it all. Those start
 *    unticked — nothing is guessed.
 *  - Staples (salt, oil, spices) are left alone, and expired items aren't
 *    offered (they shouldn't have been cooked with).
 *  - Each recipe ingredient uses one kitchen item: the one to use soonest.
 */
export type KitchenUpdateKind = "reduce" | "use_up" | "ask";

export interface KitchenUpdate {
  item: PantryItem;
  /** The recipe lines that use it, as written for the servings cooked. */
  lines: string[];
  kind: KitchenUpdateKind;
  /** Amount left afterwards, in the item's own unit (reduce only). */
  remaining: number | null;
  /** Ticked to begin with. */
  selected: boolean;
}

const WATER = new Set(["water", "hot water", "ice", "cold water", "warm water"]);
const round = (n: number) => (n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);

export function kitchenUpdatesAfterCooking(recipe: Pick<Recipe, "ingredients">, factor: number, pantry: readonly PantryItem[], today: IsoDate): KitchenUpdate[] {
  const usable = pantry
    .filter((p) => !p.isStaple && assessUrgency(p.useBy, today).usable)
    // Soonest use-by first, so the older pack is the one used.
    .sort((a, b) => (a.useBy ?? "9999-12-31").localeCompare(b.useBy ?? "9999-12-31") || a.createdAt.localeCompare(b.createdAt));
  const byItem = new Map<string, { item: PantryItem; lines: string[]; used: number | null; comparable: boolean }>();

  for (const ing of recipe.ingredients) {
    if (WATER.has(ing.item.toLowerCase())) continue;
    const item = usable.find((p) => pantryItemMatches(ing.item, p));
    if (!item) continue;
    const entry = byItem.get(item.id) ?? { item, lines: [], used: 0, comparable: true };
    entry.lines.push(formatIngredientLine(ing, factor));
    let amount: number | null = null;
    if (item.quantity !== null && item.unit && ing.quantity !== null && ing.unit) {
      amount = convert({ value: ing.quantity * factor, unit: ing.unit }, item.unit);
    } else if (item.quantity !== null && item.unit && ing.quantity !== null && !ing.unit) {
      // "3 eggs" against "12 each".
      amount = convert({ value: ing.quantity * factor, unit: "each" }, item.unit);
    }
    if (amount === null || !Number.isFinite(amount) || amount < 0) entry.comparable = false;
    else entry.used = (entry.used ?? 0) + amount;
    byItem.set(item.id, entry);
  }

  return [...byItem.values()].map(({ item, lines, used, comparable }) => {
    if (!comparable || used === null || item.quantity === null) return { item, lines, kind: "ask" as const, remaining: null, selected: false };
    const left = round(Math.max(0, item.quantity - used));
    // Less than 2% left is "used up" (a recipe rarely leaves a crumb worth tracking).
    if (left <= item.quantity * 0.02) return { item, lines, kind: "use_up" as const, remaining: 0, selected: true };
    return { item, lines, kind: "reduce" as const, remaining: left, selected: true };
  });
}
