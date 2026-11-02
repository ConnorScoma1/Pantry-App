import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CartDraft, CartLine, CartProduct } from "@kitchen-pantry/grocery-pricing";
import type { PantryOutcome, SpendingEntry } from "@kitchen-pantry/shared-types";
import { cartSavings, pantrySummary, recentWeeks, spendingByWeek, spendingTrend, unloggedOrders, weekPeriod } from "./index";

const day = (iso: string) => iso.slice(0, 10); // fixtures are UTC noon
const WEEK = weekPeriod("2026-11-02");

const product = (over: Partial<CartProduct> = {}): CartProduct => ({
  productId: "p1", upc: null, name: "Kroger Chicken Thighs", brand: "Kroger", sizeLabel: "1 lb", soldByWeight: false,
  regularCents: 899, saleCents: 599, availability: "in_stock", priceStatus: "verified", observedAt: "2026-11-03T12:00:00Z", suggestedCount: 1, ...over,
});
const line = (p: CartProduct, count = 2, include = true): CartLine =>
  ({ id: p.productId, name: p.name, department: "meat_seafood", amountText: null, quantity: null, sourceIds: [], neededFor: [], inKitchen: null,
     options: [p], selected: p.productId, count, include, state: "matched", reason: null, approved: true }) as CartLine;
const cart = (over: Partial<CartDraft>): CartDraft =>
  ({ id: "c1", retailer: "kroger", storeId: "1", storeName: "Kroger", fulfillment: "pickup", lines: [], status: "sent", version: 1, createdBy: null,
     approvedBy: null, approvedAt: null, transferKey: null, result: null, lastError: null, purchase: "ordered", createdAt: "2026-11-03T12:00:00Z", updatedAt: "", ...over }) as CartDraft;

test("savings: only store-reported sale prices on ordered carts count as verified", () => {
  const s = cartSavings(
    [
      cart({ lines: [line(product(), 2), line(product({ productId: "p2", soldByWeight: true, regularCents: 499, saleCents: 399 }), 1.5), line(product({ productId: "p3", saleCents: null })), line(product({ productId: "p4" }), 1, false)] }),
      cart({ id: "c2", purchase: "not_ordered", lines: [line(product({ productId: "p5", regularCents: 300, saleCents: 250 }), 1)] }),
      cart({ id: "c3", lines: [line(product({ productId: "p6", priceStatus: "cached" }), 1)] }),
      cart({ id: "c4", retailer: "mock", lines: [line(product(), 5)] }),
      cart({ id: "c5", status: "draft", lines: [line(product(), 5)] }),
      cart({ id: "c6", createdAt: "2026-10-20T12:00:00Z", lines: [line(product(), 5)] }),
    ],
    WEEK,
    day,
  );
  assert.equal(s.verifiedCents, 600, "2 × ($8.99 − $5.99)");
  assert.equal(s.verifiedItems, 1);
  assert.equal(s.estimatedCents, 150 + 50 + 300, "by weight, not ordered, and older (cached) prices are estimates");
  assert.equal(s.estimatedItems, 3);
  assert.deepEqual([s.sentCarts, s.orderedCarts, s.practiceCarts], [3, 2, 1]);
});

const outcome = (itemName: string, reason: PantryOutcome["reason"], at: string, useBy: string | null, price: number | null): PantryOutcome => ({ itemName, reason, at, useBy, pricePaidCents: price });

test("savings: food used is value, not cash; rescued means used close to its use-by date; waste is shown too", () => {
  const p = pantrySummary(
    [
      outcome("Baby spinach", "consumed", "2026-11-03T12:00:00Z", "2026-11-05", 499),
      outcome("Milk", "consumed", "2026-11-04T12:00:00Z", "2026-11-04", null),
      outcome("Rice", "consumed", "2026-11-04T12:00:00Z", "2027-05-01", 299),
      outcome("Bread", "consumed", "2026-11-04T12:00:00Z", "2026-11-02", 350),
      outcome("Greek yogurt", "expired", "2026-11-05T12:00:00Z", "2026-11-04", 300),
      outcome("Cilantro", "discarded", "2026-11-05T12:00:00Z", null, null),
      outcome("Old", "consumed", "2026-10-01T12:00:00Z", null, 1000),
    ],
    WEEK,
    day,
  );
  assert.equal(p.usedCount, 4);
  assert.equal(p.usedValueCents, 499 + 299 + 350);
  assert.equal(p.usedUnpriced, 1);
  assert.equal(p.rescuedCount, 2, "spinach (2 days left) and milk (on the day); not rice, not bread used after its date");
  assert.equal(p.rescuedValueCents, 499);
  assert.deepEqual(p.rescuedNames, ["baby spinach", "milk"]);
  assert.deepEqual([p.wastedCount, p.wastedValueCents, p.wastedUnpriced], [2, 300, 1]);
});

test("savings: spending trends use logged shops only, against the weekly budget", () => {
  const weeks = recentWeeks("2026-11-04", 4);
  assert.deepEqual(weeks, ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  const entry = (id: string, spentOn: string, amountCents: number): SpendingEntry => ({ id, spentOn, amountCents, storeName: null, note: null, cartDraftId: null, createdAt: "" });
  const byWeek = spendingByWeek([entry("a", "2026-10-13", 9000), entry("b", "2026-10-20", 10000), entry("c", "2026-10-26", 13000), entry("d", "2026-11-01", 1000), entry("e", "2026-11-03", 11000)], weeks, 12000);
  assert.deepEqual(byWeek.map((w) => [w.spentCents, w.shops, w.overBudget]), [[9000, 1, false], [10000, 1, false], [14000, 2, true], [11000, 1, false]]);
  assert.deepEqual(spendingTrend(byWeek), { averageCents: 11000, loggedWeeks: 4, direction: "up" });
  assert.deepEqual(spendingTrend(spendingByWeek([], weeks, 12000)), { averageCents: null, loggedWeeks: 0, direction: null });
  assert.equal(spendingByWeek([], weeks, null)[0]!.overBudget, null);
});

test("savings: ordered carts can be logged once", () => {
  const carts = [cart({ id: "x" }), cart({ id: "y", purchase: "not_ordered" }), cart({ id: "z", retailer: "mock" })];
  const left = unloggedOrders(carts, [{ id: "e", spentOn: "2026-11-03", amountCents: 1, storeName: null, note: null, cartDraftId: "w", createdAt: "" }]);
  assert.deepEqual(left.map((c) => c.id), ["x"]);
  assert.deepEqual(unloggedOrders(carts, [{ id: "e", spentOn: "2026-11-03", amountCents: 1, storeName: null, note: null, cartDraftId: "x", createdAt: "" }]), []);
});
