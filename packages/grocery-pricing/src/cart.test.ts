import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { GroceryItem, PantryItem } from "@kitchen-pantry/shared-types";
import {
  approveLine,
  cartAsText,
  cartBlockers,
  cartEstimate,
  cartLinesSchema,
  cartNeeds,
  chooseOption,
  matchCart,
  MockCartAdapter,
  SampleCatalogProvider,
  setCount,
  setInclude,
  toPricedProduct,
  transferItems,
  type PricedProduct,
  type PricingProvider,
} from "./index";

const NOW = new Date("2026-11-01T18:00:00Z");
const TODAY = "2026-11-01";
const STORE = "01400376";

let n = 0;
const item = (name: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, listId: "l", name, department: "other", amount: null, note: null, source: "manual", key: null,
  neededFor: [], quantity: null, checked: false, addedBy: null, checkedBy: null, checkedAt: null, position: n, createdAt: NOW.toISOString(), ...extra,
} as GroceryItem);
const pantry = (name: string, useBy: string | null = null): PantryItem => ({ id: `p-${name}`, name, useBy } as unknown as PantryItem);

function kroger(id: string, description: string, size: string, regular: number, extra: { promo?: number; stock?: string; soldBy?: string } = {}) {
  return toPricedProduct(
    { productId: id, upc: `0000${id}`, description, brand: "Kroger", items: [{ size, soldBy: extra.soldBy ?? "UNIT", price: { regular, promo: extra.promo ?? 0 }, inventory: { stockLevel: extra.stock ?? "HIGH" } }] },
    STORE,
    NOW,
  )!;
}
function provider(byTerm: Record<string, PricedProduct[]>): PricingProvider {
  return { id: "kroger", displayName: "Kroger", isMock: false, storeSpecific: true, searchProducts: async () => [], getPrices: async () => [], searchPriced: async ({ text }) => byTerm[text.toLowerCase()] ?? [] };
}

test("cart needs: duplicates merged, checked items left out, kitchen flagged not removed", () => {
  const needs = cartNeeds(
    [
      item("Milk", { amount: "1 gal", department: "dairy" }),
      item("milk", { source: "plan", quantity: { value: 480, unit: "ml" }, amount: "2 cups", neededFor: ["Pancakes"], department: "dairy" }),
      item("Eggs", { checked: true }),
      item("Olive oil", { department: "pantry" }),
      item("Chicken thighs", { source: "plan", quantity: { value: 680, unit: "g" }, neededFor: ["Tacos"] }),
    ],
    [pantry("Extra virgin olive oil"), pantry("Chicken thighs", "2026-10-20")],
    TODAY,
  );
  assert.deepEqual(needs.map((x) => x.name), ["Milk", "Olive oil", "Chicken thighs"]);
  assert.equal(needs[0]!.sourceIds.length, 2);
  assert.equal(needs[0]!.amountText, "1 gal + 2 cups");
  assert.deepEqual(needs[0]!.neededFor, ["Pancakes"]);
  assert.match(needs[1]!.inKitchen!, /extra virgin olive oil/);
  assert.equal(needs[2]!.inKitchen, null, "plan lines already had the kitchen taken off; expired kitchen items don't count");
});

test("cart matching: clean match, amount check, out-of-stock substitution, nothing found", async () => {
  const needs = cartNeeds(
    [
      item("Chicken thighs", { source: "plan", quantity: { value: 1360.7, unit: "g" } }),
      item("Baby spinach", { source: "plan", quantity: { value: 3, unit: "cup" } }),
      item("Heavy cream", { source: "plan", quantity: { value: 473, unit: "ml" } }),
      item("Saffron"),
    ],
    [],
    TODAY,
  );
  const { lines, warning } = await matchCart({
    provider: provider({
      "chicken thighs": [kroger("1", "Kroger Chicken Thighs", "1.5 lb", 6.99), kroger("2", "Simple Truth Organic Chicken Thighs", "1.5 lb", 9.99, { promo: 8.49 })],
      "baby spinach": [kroger("3", "Kroger Baby Spinach", "5 oz", 2.99)],
      "heavy cream": [kroger("4", "Kroger Heavy Whipping Cream", "16 fl oz", 3.49, { stock: "TEMPORARILY_OUT_OF_STOCK" }), kroger("5", "Kroger Heavy Cream", "32 fl oz", 5.99)],
    }),
    storeId: STORE,
    needs,
    now: () => NOW,
  });
  assert.equal(warning, null);
  const [thighs, spinach, cream, saffron] = lines as [typeof lines[number], typeof lines[number], typeof lines[number], typeof lines[number]];
  assert.equal(thighs.state, "matched");
  assert.equal(thighs.selected, "1");
  assert.equal(thighs.count, 2, "3 lb needed → two 1.5 lb packs");
  assert.equal(thighs.options.length, 2, "alternatives kept for substitutions");
  assert.equal(spinach.state, "needs_review", "cups vs ounces can't be compared — the household checks it");
  assert.match(spinach.reason!, /3 cup/);
  assert.equal(cream.state, "substitute");
  assert.equal(cream.selected, "5");
  assert.equal(cream.approved, false);
  assert.equal(saffron.state, "unavailable");
  assert.equal(saffron.include, false);
  assert.ok(cartLinesSchema.safeParse(lines).success);

  // Not ready until the review and the substitution are approved.
  assert.deepEqual(cartBlockers(lines).map((l) => l.name), ["Baby spinach", "Heavy cream"]);
  const reviewed = lines.map((l) => (l.name === "Baby spinach" ? setCount(l, 2) : l.name === "Heavy cream" ? approveLine(l) : l));
  assert.equal(cartBlockers(reviewed).length, 0);

  const est = cartEstimate(reviewed);
  assert.equal(est.estimatedCents, 699 * 2 + 299 * 2 + 599);
  assert.equal(est.includedCount, 3);
  assert.equal(est.skippedCount, 1);
  assert.equal(est.sample, false);
  assert.deepEqual(transferItems(reviewed).map((t) => [t.upc, t.quantity]), [["00001", 2], ["00003", 2], ["00005", 1]]);

  // Choosing another product yourself counts as approving it; skipping removes it.
  const organic = chooseOption(thighs, "2");
  assert.equal(organic.selected, "2");
  assert.equal(cartEstimate([organic]).estimatedCents, 849 * 2);
  assert.equal(cartEstimate([organic]).saleSavingsCents, 150 * 2);
  assert.equal(transferItems([setInclude(organic, false)]).length, 0);
  assert.equal(setCount(thighs, 0).count, 2, "zero or silly counts are ignored");
  assert.equal(chooseOption(cream, "4").state, "unavailable", "picking the out-of-stock one can't be sent");
});

test("cart: the mock retailer says it's a practice run, never a real cart", async () => {
  const sample = new SampleCatalogProvider(() => NOW);
  const { lines } = await matchCart({ provider: sample, storeId: "sample", needs: cartNeeds([item("Broccoli"), item("Eggs")], [], TODAY), now: () => NOW });
  assert.ok(lines.every((l) => l.options.every((o) => o.priceStatus === "estimated" && o.name.startsWith("Sample"))));
  assert.ok(cartEstimate(lines.map(approveLine)).sample);
  const ok = await new MockCartAdapter({ now: () => NOW }).transfer({ items: transferItems(lines.map(approveLine)) });
  assert.ok(ok.ok && ok.result.kind === "cart_confirmed" && ok.result.confirmedBy === "mock" && ok.result.checkoutUrl === null);
  const expired = await new MockCartAdapter({ fail: "auth_expired" }).transfer({ items: [] });
  assert.ok(!expired.ok && expired.error === "auth_expired" && expired.retryable);
});

test("cart: export as text is the no-integration fallback", () => {
  const text = cartAsText({
    title: "Groceries for Nov 2–8",
    storeName: "Kroger Oak Creek",
    lines: [
      { id: "a", name: "Chicken thighs", department: "meat_seafood", amountText: "3 lb", quantity: null, sourceIds: ["a"], neededFor: [], inKitchen: null, options: [{ productId: "1", upc: null, name: "Kroger Chicken Thighs", brand: "Kroger", sizeLabel: "1.5 lb", soldByWeight: false, regularCents: 699, saleCents: null, availability: "in_stock", priceStatus: "verified", observedAt: NOW.toISOString(), suggestedCount: 2 }], selected: "1", count: 2, include: true, state: "matched", reason: null, approved: true },
      { id: "b", name: "Saffron", department: "spices", amountText: null, quantity: null, sourceIds: ["b"], neededFor: [], inKitchen: null, options: [], selected: null, count: 1, include: false, state: "unavailable", reason: null, approved: true },
    ],
  });
  assert.equal(text, "Groceries for Nov 2–8\nStore: Kroger Oak Creek\n\n- 2 × Kroger Chicken Thighs (1.5 lb) — for 3 lb chicken thighs");
});

test("cart: typed items without an amount go in as one package, with a note — not a blocker", async () => {
  const { lines } = await matchCart({
    provider: provider({ eggs: [kroger("9", "Kroger Large Eggs", "12 ct", 3.49)] }),
    storeId: STORE,
    needs: cartNeeds([item("Eggs", { amount: "2 dozen" })], [], TODAY),
    now: () => NOW,
  });
  assert.equal(lines[0]!.state, "matched");
  assert.equal(lines[0]!.approved, true);
  assert.equal(lines[0]!.count, 1);
  assert.equal(lines[0]!.reason, 'You wrote "2 dozen" — check the quantity');
});
