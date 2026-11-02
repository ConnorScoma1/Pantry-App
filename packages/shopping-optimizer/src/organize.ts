import { groceryDepartments, type GroceryDepartment } from "@kitchen-pantry/shared-types";
import type { TripPlan } from "./types";

/**
 * Organise the shopping list by store, then by department inside each store
 * (spec 03 §4). Items the trip couldn't price, and items added to the list
 * after the trip was chosen, go in "Not assigned" so nothing disappears.
 */

export interface OrganizableItem {
  id: string;
  name: string;
  department: GroceryDepartment;
  checked?: boolean;
}

export interface StoreSection<T extends OrganizableItem> {
  storeKey: string | null;
  departments: Array<{ department: GroceryDepartment; items: T[] }>;
  count: number;
}

const ORDER = new Map<string, number>(groceryDepartments.map((d, i) => [d.code, i]));

function byDepartment<T extends OrganizableItem>(items: readonly T[]): StoreSection<T>["departments"] {
  const groups = new Map<GroceryDepartment, T[]>();
  for (const it of items) {
    const g = groups.get(it.department) ?? [];
    g.push(it);
    groups.set(it.department, g);
  }
  return [...groups.entries()]
    .sort((a, b) => (ORDER.get(a[0]) ?? 99) - (ORDER.get(b[0]) ?? 99))
    .map(([department, list]) => ({ department, items: [...list].sort((a, b) => Number(Boolean(a.checked)) - Number(Boolean(b.checked)) || a.name.localeCompare(b.name)) }));
}

/** Assignment of list items to stores, as saved with a chosen trip. */
export type StoreAssignment = ReadonlyMap<string, string>;

export function assignmentOf(plan: Pick<TripPlan, "stops">): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of plan.stops) for (const id of s.itemIds) m.set(id, s.storeKey);
  return m;
}

export function organizeByStore<T extends OrganizableItem>(items: readonly T[], storeOrder: readonly string[], assignment: StoreAssignment): StoreSection<T>[] {
  const sections: StoreSection<T>[] = storeOrder.map((key) => {
    const mine = items.filter((i) => assignment.get(i.id) === key);
    return { storeKey: key, departments: byDepartment(mine), count: mine.length };
  });
  const rest = items.filter((i) => {
    const k = assignment.get(i.id);
    return !k || !storeOrder.includes(k);
  });
  if (rest.length) sections.push({ storeKey: null, departments: byDepartment(rest), count: rest.length });
  return sections;
}
