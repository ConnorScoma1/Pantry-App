import {
  pantryCategories,
  remainingLevels,
  type IsoDate,
  type PantryCategory,
  type PantryItem,
  type StorageLocation,
} from "@kitchen-pantry/shared-types";
import { assessUrgency, type UrgencyResult } from "./freshness";
import { canonicalUnit, normalize, roundQuantity } from "./units";

/** Normalised columns stored alongside the user's own quantity/unit. */
export function normalizeForStorage(
  quantity: number | null,
  unit: string | null,
): { normalizedQuantity: number | null; normalizedUnit: "g" | "ml" | "each" | null } {
  if (quantity === null || unit === null) return { normalizedQuantity: null, normalizedUnit: null };
  const n = normalize({ value: quantity, unit });
  if (!n.isBase) return { normalizedQuantity: null, normalizedUnit: null };
  return { normalizedQuantity: Math.round(n.value * 10_000) / 10_000, normalizedUnit: n.unit as "g" | "ml" | "each" };
}

const UNIT_LABELS: Record<string, [string, string]> = {
  each: ["", ""],
  g: ["g", "g"],
  kg: ["kg", "kg"],
  oz: ["oz", "oz"],
  lb: ["lb", "lb"],
  ml: ["ml", "ml"],
  l: ["L", "L"],
  tsp: ["tsp", "tsp"],
  tbsp: ["tbsp", "tbsp"],
  cup: ["cup", "cups"],
  fl_oz: ["fl oz", "fl oz"],
  pint: ["pint", "pints"],
  quart: ["quart", "quarts"],
  gallon: ["gallon", "gallons"],
  dozen: ["dozen", "dozen"],
};

/** "1.5 lb", "3", "2 cans". Returns null when no amount is tracked. */
export function formatQuantity(quantity: number | null, unit: string | null): string | null {
  if (quantity === null) return null;
  const value = roundQuantity(quantity);
  const canonical = unit ? canonicalUnit(unit) : "each";
  const label = UNIT_LABELS[canonical];
  if (label) {
    const text = value === 1 ? label[0] : label[1];
    return text ? `${value} ${text}` : `${value}`;
  }
  // Package-style units are shown as written: "2 cans", "1 bunch".
  return `${value} ${unit}`;
}

/** Closest label from the rough "how much is left" scale. */
export function remainingLabel(pct: number | null): string | null {
  if (pct === null) return null;
  if (pct <= 0) return "Empty";
  const closest = [...remainingLevels].sort((a, b) => Math.abs(a.pct - pct) - Math.abs(b.pct - pct))[0];
  return closest ? closest.label : null;
}

export interface KitchenItemView {
  item: PantryItem;
  urgency: UrgencyResult;
}

export interface KitchenSummary {
  total: number;
  byLocation: Record<StorageLocation, number>;
  /** Usable items to use today / soon / this week, most urgent first. */
  useSoon: KitchenItemView[];
  /** Items past their use-by date — never suggested for cooking. */
  pastDate: KitchenItemView[];
}

const URGENT = new Set(["today", "soon", "this_week"]);

export function summarizeKitchen(items: PantryItem[], today: IsoDate): KitchenSummary {
  const byLocation: Record<StorageLocation, number> = { fridge: 0, freezer: 0, pantry: 0, counter: 0 };
  const useSoon: KitchenItemView[] = [];
  const pastDate: KitchenItemView[] = [];

  for (const item of items) {
    byLocation[item.storageLocation] += 1;
    const urgency = assessUrgency(item.useBy, today);
    if (urgency.urgency === "past_date") pastDate.push({ item, urgency });
    else if (URGENT.has(urgency.urgency)) useSoon.push({ item, urgency });
  }

  const byDays = (a: KitchenItemView, b: KitchenItemView) =>
    (a.urgency.daysLeft ?? 0) - (b.urgency.daysLeft ?? 0) || a.item.name.localeCompare(b.item.name);
  useSoon.sort(byDays);
  pastDate.sort(byDays);

  return { total: items.length, byLocation, useSoon, pastDate };
}

export interface CategoryGroup {
  category: PantryCategory;
  label: string;
  items: KitchenItemView[];
}

/** Group items by category in catalogue order; items sorted by name. */
export function groupByCategory(items: PantryItem[], today: IsoDate): CategoryGroup[] {
  const groups = new Map<PantryCategory, KitchenItemView[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push({ item, urgency: assessUrgency(item.useBy, today) });
    groups.set(item.category, list);
  }
  return pantryCategories
    .filter((c) => groups.has(c.code))
    .map((c) => ({
      category: c.code,
      label: c.label,
      items: groups.get(c.code)!.sort((a, b) => a.item.name.localeCompare(b.item.name)),
    }));
}

/** Case-insensitive name filter. */
export function filterItems(
  items: PantryItem[],
  options: { query?: string; location?: StorageLocation | "all" },
): PantryItem[] {
  const q = options.query?.trim().toLowerCase() ?? "";
  return items.filter(
    (i) =>
      (options.location === undefined || options.location === "all" || i.storageLocation === options.location) &&
      (!q || i.name.toLowerCase().includes(q)),
  );
}
