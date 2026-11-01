import { convert, type ConversionHints } from "@kitchen-pantry/inventory-engine";
import type { Quantity } from "@kitchen-pantry/shared-types";

export interface PackagePlan {
  /** Whole packages the shopper must buy. */
  packages: number;
  /** Total amount purchased, in the required unit. */
  purchased: Quantity;
  /** Amount left over after the recipe(s), in the required unit. */
  leftover: Quantity;
}

/**
 * How many packages must actually be bought to cover a requirement.
 * e.g. 12 oz broccoli sold in 1 lb packages -> 1 package, 4 oz left over.
 * Returns null if the package size can't be compared to the requirement.
 */
export function planPackages(
  required: Quantity,
  packageSize: Quantity,
  hints: ConversionHints = {},
): PackagePlan | null {
  if (required.value <= 0) {
    return {
      packages: 0,
      purchased: { value: 0, unit: required.unit },
      leftover: { value: 0, unit: required.unit },
    };
  }
  const perPackage = convert(packageSize, required.unit, hints);
  if (perPackage === null || perPackage <= 0) return null;

  // Tolerate float noise so 16 oz vs 1 lb doesn't round up to 2 packages.
  const packages = Math.ceil(required.value / perPackage - 1e-9);
  const purchased = packages * perPackage;
  return {
    packages,
    purchased: { value: purchased, unit: required.unit },
    leftover: { value: purchased - required.value, unit: required.unit },
  };
}

/** Price the packages actually bought, using a promo price when present. */
export function linePriceCents(
  packages: number,
  observation: { priceCents: number; promoPriceCents: number | null },
): number {
  const each = observation.promoPriceCents ?? observation.priceCents;
  return packages * each;
}

/** Format integer cents for display, e.g. 7603 -> "$76.03". */
export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
