import type { PricedLine } from "@kitchen-pantry/grocery-pricing";
import type { ItemCost, ShoppingSettings, ShoppingStore, StoreBasket } from "./types";

/**
 * Promotion eligibility (spec 03 §3: "do not assume promotions are
 * available to everyone"). A store's sale price is counted only when the
 * shopper has said they have that retailer's loyalty card. The retailers we
 * read prices from don't say whether a sale needs a card, so "unknown" is
 * treated as "needs one". Without a card the regular price is used and the
 * difference is reported, so they can see what a card might save.
 *
 * Digital coupons need a coupon source; none is connected, so they're never
 * counted (the comparison lists that as a limitation).
 */

/** Which loyalty programme a store belongs to. Kroger's card works across its banners. */
export function membershipKey(store: Pick<ShoppingStore, "provider" | "retailer">): string {
  if (store.provider === "kroger") return "kroger";
  return store.retailer.trim().toLowerCase();
}

export function membershipLabel(store: Pick<ShoppingStore, "provider" | "retailer">): string {
  if (store.provider === "kroger") return "Kroger family loyalty card";
  return `${store.retailer} card`;
}

export function hasMembership(store: Pick<ShoppingStore, "provider" | "retailer">, settings: Pick<ShoppingSettings, "loyaltyRetailers">): boolean {
  return settings.loyaltyRetailers.map((r) => r.trim().toLowerCase()).includes(membershipKey(store));
}

/**
 * Whether a store's sale prices need a card. Real retailers' price feeds
 * don't say, so the answer is "assume yes". Only the made-up sample store A
 * runs sales open to everyone (to show both cases in practice mode).
 */
export function saleNeedsMembership(store: Pick<ShoppingStore, "provider" | "storeId">): boolean {
  return !(store.provider === "sample" && store.storeId === "store-a");
}

const HOUR = 3_600_000;

/** Why a line can't be used in the comparison, or null when it can. */
export function unusableReason(line: PricedLine, store: ShoppingStore, now: Date, maxAgeHours: number): string | null {
  if (line.lineTotalCents === null || line.status === "unavailable") return line.note ?? "No price";
  if (line.outOfStock) return "Out of stock";
  if (!store.isSample) {
    if (line.status === "estimated") return "Only an estimated price";
    if (!line.observedAt) return "Price has no date";
    const age = now.getTime() - Date.parse(line.observedAt);
    if (!Number.isFinite(age) || age > maxAgeHours * HOUR) return "Price is too old";
  }
  return null;
}

/** The cost of one list item at one store, after deciding whether its sale price counts. */
export function itemCost(line: PricedLine, store: ShoppingStore, settings: ShoppingSettings): ItemCost {
  const total = line.lineTotalCents!;
  const sale = line.saleCents !== null && line.regularCents !== null && line.saleCents > 0 && line.saleCents < line.regularCents;
  const eligible = sale && (!saleNeedsMembership(store) || hasMembership(store, settings));
  let cents = total;
  let notCounted = 0;
  if (sale && !eligible) {
    // Same product and amount, at the regular shelf price.
    cents = Math.round((total * line.regularCents!) / line.saleCents!);
    notCounted = cents - total;
  }
  return {
    itemId: line.id,
    storeKey: store.key,
    cents,
    onSale: eligible,
    saleNeedsMembership: sale && !eligible,
    saleNotCountedCents: notCounted,
    status: line.status === "unavailable" ? "estimated" : line.status,
    assumedOnePackage: line.assumedOnePackage,
    productName: line.product?.name ?? null,
  };
}

export interface CostTable {
  stores: ShoppingStore[];
  /** storeKey → itemId → cost. */
  costs: Map<string, Map<string, ItemCost>>;
  /** storeKey → itemId → why it isn't usable there. */
  unusable: Map<string, Map<string, string>>;
}

export function buildCostTable(baskets: readonly StoreBasket[], itemIds: readonly string[], settings: ShoppingSettings, now: Date, maxAgeHours: number): CostTable {
  const wanted = new Set(itemIds);
  const costs = new Map<string, Map<string, ItemCost>>();
  const unusable = new Map<string, Map<string, string>>();
  const stores: ShoppingStore[] = [];
  for (const sb of baskets) {
    if (!sb.basket) continue;
    stores.push(sb.store);
    const row = new Map<string, ItemCost>();
    const why = new Map<string, string>();
    for (const line of sb.basket.lines) {
      if (!wanted.has(line.id)) continue;
      const reason = unusableReason(line, sb.store, now, maxAgeHours);
      if (reason) {
        why.set(line.id, reason);
        continue;
      }
      const c = itemCost(line, sb.store, settings);
      row.set(line.id, c);
    }
    for (const id of itemIds) if (!row.has(id) && !why.has(id)) why.set(id, "Not priced");
    costs.set(sb.store.key, row);
    unusable.set(sb.store.key, why);
  }
  return { stores, costs, unusable };
}
