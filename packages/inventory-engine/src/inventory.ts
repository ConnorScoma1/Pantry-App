import type { Quantity } from "@kitchen-pantry/shared-types";
import { convert, normalize, type ConversionHints } from "./units";

export interface InventoryCoverage {
  /** Amount still to buy, in the required quantity's unit. */
  stillNeeded: Quantity;
  /** Amount covered by inventory, in the required quantity's unit. */
  covered: Quantity;
  /** Inventory entries that could not be compared (unknown unit bridge). */
  incomparable: Quantity[];
}

/**
 * Subtract usable inventory from a recipe requirement. Only inventory the
 * caller has already judged usable (not past its date) should be passed in.
 * Quantities that cannot be converted are reported, never assumed to cover.
 */
export function subtractInventory(
  required: Quantity,
  available: Quantity[],
  hints: ConversionHints = {},
): InventoryCoverage {
  const requiredValue = required.value;
  let coveredValue = 0;
  const incomparable: Quantity[] = [];

  for (const item of available) {
    const inRequiredUnit = convert(item, required.unit, hints);
    if (inRequiredUnit === null) {
      incomparable.push(item);
      continue;
    }
    coveredValue += inRequiredUnit;
  }

  const covered = Math.min(coveredValue, requiredValue);
  return {
    covered: { value: covered, unit: required.unit },
    stillNeeded: { value: Math.max(requiredValue - covered, 0), unit: required.unit },
    incomparable,
  };
}

/** Sum quantities that share a base unit (e.g. garlic from three recipes). */
export function sumQuantities(quantities: Quantity[]): Quantity[] {
  const totals = new Map<string, number>();
  for (const q of quantities) {
    const n = normalize(q);
    totals.set(n.unit, (totals.get(n.unit) ?? 0) + n.value);
  }
  return [...totals.entries()].map(([unit, value]) => ({ unit, value }));
}
