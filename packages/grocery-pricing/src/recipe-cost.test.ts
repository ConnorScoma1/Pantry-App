import { strict as assert } from "node:assert";
import { test } from "node:test";
import { costRecipes, recipeCostRequestSchema, toPricedProduct, type PricedProduct, type PricingProvider } from "./index";

const NOW = new Date("2026-11-01T18:00:00Z");
const STORE = "01400376";
const kroger = (id: string, description: string, size: string, regular: number, extra: { promo?: number; soldBy?: string } = {}) =>
  toPricedProduct({ productId: id, description, items: [{ size, soldBy: extra.soldBy ?? "UNIT", price: { regular, promo: extra.promo ?? 0 }, inventory: { stockLevel: "HIGH" } }] }, STORE, NOW)!;
const provider = (byTerm: Record<string, PricedProduct[]>, isMock = false): PricingProvider => ({
  id: "kroger", displayName: "Kroger", isMock, storeSpecific: true, searchProducts: async () => [], getPrices: async () => [], searchPriced: async ({ text }) => byTerm[text] ?? [],
});

test("recipe cost: the portion used, not the whole package; sale prices count", async () => {
  const { costs } = await costRecipes({
    provider: provider({
      "chicken thighs": [kroger("1", "Kroger Chicken Thighs", "3 lb", 8.99, { promo: 5.99 })],
      "baby spinach": [kroger("2", "Kroger Baby Spinach", "10 oz", 3.5)],
      bananas: [kroger("3", "Bananas", "1 lb", 0.6, { soldBy: "WEIGHT" })],
    }),
    storeId: STORE,
    now: () => NOW,
    recipes: [{
      id: "r1", servings: 4,
      ingredients: [
        { name: "chicken thighs", quantity: { value: 680.388, unit: "g" } }, // 1.5 lb of a 3 lb pack → $3.00 (sale)
        { name: "baby spinach", quantity: { value: 141.75, unit: "g" } }, // 5 oz of 10 oz → $1.75
        { name: "bananas", quantity: { value: 907.18, unit: "g" } }, // 2 lb × $0.60
      ],
    }],
  });
  assert.deepEqual(costs[0], { id: "r1", perServingCents: Math.round((299.5 + 175 + 120) / 4), totalCents: 595, pricedCount: 3, unpriced: [], complete: true, observedAt: NOW.toISOString() });
});

test("recipe cost: amounts that can't be compared aren't guessed; mock prices never count", async () => {
  const { costs } = await costRecipes({
    provider: provider({ "baby spinach": [kroger("2", "Kroger Baby Spinach", "10 oz", 3.5)] }),
    storeId: STORE,
    now: () => NOW,
    recipes: [{ id: "r", servings: 2, ingredients: [{ name: "baby spinach", quantity: { value: 3, unit: "cup" } }, { name: "saffron", quantity: { value: 1, unit: "g" } }, { name: "lemons", quantity: null }] }],
  });
  assert.deepEqual([costs[0]!.perServingCents, costs[0]!.complete, costs[0]!.unpriced], [null, false, ["baby spinach", "saffron", "lemons"]]);
  const mock = await costRecipes({ provider: provider({ "baby spinach": [kroger("2", "Kroger Baby Spinach", "10 oz", 3.5)] }, true), storeId: STORE, now: () => NOW, recipes: [{ id: "r", servings: 2, ingredients: [{ name: "baby spinach", quantity: { value: 141.75, unit: "g" } }] }] });
  assert.equal(mock.costs[0]!.perServingCents, null);
  assert.ok(!recipeCostRequestSchema.safeParse({ storeId: STORE, recipes: Array.from({ length: 9 }, (_, i) => ({ id: String(i), servings: 2, ingredients: [] })) }).success, "at most 8 recipes per check");
});
