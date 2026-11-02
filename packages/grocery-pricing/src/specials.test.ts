import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createMemoryCache,
  findStoreSpecials,
  PricingProviderError,
  specialsRequestSchema,
  specialsResultSchema,
  STAPLE_SPECIALS_TERMS,
  toPricedProduct,
  unitPriceCents,
  type PricedProduct,
  type PricingProvider,
} from "./index";

const NOW = new Date("2026-11-01T18:00:00Z");
const STORE = "01400376";

function kroger(id: string, description: string, size: string, regular: number, promo = 0, extra: Record<string, unknown> = {}, price: Record<string, unknown> = {}) {
  return toPricedProduct(
    { productId: id, description, brand: "Kroger", ...extra, items: [{ size, soldBy: "UNIT", price: { regular, promo, ...price }, inventory: { stockLevel: "HIGH" } }] },
    STORE,
    NOW,
  )!;
}

function provider(byTerm: Record<string, PricedProduct[] | Error>, overrides: Partial<PricingProvider> = {}) {
  const calls: string[] = [];
  const p: PricingProvider = {
    id: "kroger",
    displayName: "Kroger",
    isMock: false,
    storeSpecific: true,
    searchProducts: async () => [],
    getPrices: async () => [],
    searchPriced: async ({ text }) => {
      calls.push(text);
      const r = byTerm[text] ?? [];
      if (r instanceof Error) throw r;
      return r;
    },
    ...overrides,
  };
  return { p, calls };
}

test("specials: unit prices read like a shelf tag", () => {
  assert.deepEqual(unitPriceCents(399, { value: 16, unit: "oz" }), { cents: 25, per: "oz" });
  assert.deepEqual(unitPriceCents(899, { value: 3, unit: "lb" }), { cents: 300, per: "lb" });
  assert.deepEqual(unitPriceCents(329, { value: 0.5, unit: "gallon" }), { cents: 5, per: "fl oz" });
  assert.deepEqual(unitPriceCents(500, { value: 12, unit: "each" }), { cents: 42, per: "each" });
  assert.deepEqual(unitPriceCents(199, null, true), { cents: 199, per: "lb" });
  assert.equal(unitPriceCents(199, null), null, "unknown size → no unit price, never guessed");
});

test("specials: only real sales below regular, in stock, fresh; de-duplicated", async () => {
  const thighs = kroger("1", "Kroger Boneless Skinless Chicken Thighs", "3 lb", 8.99, 6.99);
  const full = kroger("2", "Simple Truth Chicken Breast", "1.5 lb", 7.49);
  const { p, calls } = provider({
    "chicken thighs": [thighs, full],
    chicken: [thighs, kroger("3", "Chicken Wings", "2 lb", 6, 6.5)],
  });
  const r = await findStoreSpecials({
    provider: p,
    storeId: STORE,
    terms: [{ term: "Chicken  Thighs", department: "meat_seafood" }, { term: "chicken thighs", department: "meat_seafood" }, { term: "chicken", department: "meat_seafood" }],
    now: () => NOW,
  });
  assert.deepEqual(calls.sort(), ["chicken", "chicken thighs"], "terms are normalised and asked once");
  assert.equal(r.specials.length, 1, "no sale, or 'sale' above regular, isn't a special; same product listed once");
  const s = r.specials[0]!;
  assert.equal(s.matchedTerm, "chicken thighs", "first (household) term wins");
  assert.equal(s.percentOff, 22);
  assert.deepEqual(s.unitPrice, { regularCents: 300, saleCents: 233, per: "lb" });
  assert.equal(s.requiresMembership, null, "the source doesn't say — so we don't");
  assert.equal(s.endsOn, null);
  assert.ok(specialsResultSchema.safeParse(r).success);
});

test("specials: end dates and product links only when Kroger gives them", async () => {
  const dated = kroger("4", "Honeycrisp Apples", "3 lb", 5.99, 4.99, { productPageURI: "/p/honeycrisp-apples/0000000004" }, { expirationDate: { value: "2026-11-03T00:00:00Z", timezone: "UTC" } });
  const expired = kroger("5", "Gala Apples", "3 lb", 4.99, 3.99, {}, { expirationDate: { value: "2026-10-30T00:00:00Z" } });
  const badLink = kroger("6", "Fuji Apples", "3 lb", 4.99, 3.49, { productPageURI: "javascript:alert(1)" });
  const { p } = provider({ apples: [dated, expired, badLink] });
  const r = await findStoreSpecials({ provider: p, storeId: STORE, terms: [{ term: "apples", department: "produce" }], now: () => NOW });
  assert.deepEqual(r.specials.map((s) => s.productId), ["4", "6"], "an expired promotion isn't shown");
  assert.equal(r.specials[0]!.endsOn, "2026-11-03");
  assert.equal(r.specials[0]!.sourceUrl, "https://www.kroger.com/p/honeycrisp-apples/0000000004");
  assert.equal(r.specials[1]!.sourceUrl, null);
});

test("specials: mock or stale prices never become specials; failures are reported", async () => {
  const sale = kroger("7", "Broccoli Crowns", "1 lb", 2.49, 1.49);
  const mock = provider({ broccoli: [sale] }, { isMock: true });
  assert.equal((await findStoreSpecials({ provider: mock.p, storeId: STORE, terms: [{ term: "broccoli", department: "produce" }], now: () => NOW })).specials.length, 0);
  const later = new Date(NOW.getTime() + 8 * 86_400_000);
  const stale = provider({ broccoli: [sale] });
  assert.equal((await findStoreSpecials({ provider: stale.p, storeId: STORE, terms: [{ term: "broccoli", department: "produce" }], now: () => later })).specials.length, 0);

  const quota = new PricingProviderError("Kroger's daily limit was reached.", "kroger", false, { kind: "rate_limited" });
  const failing = provider({ milk: quota, eggs: [sale] });
  const r = await findStoreSpecials({ provider: failing.p, storeId: STORE, terms: [{ term: "milk", department: "dairy" }, { term: "eggs", department: "dairy" }, { term: "bread", department: "bakery" }], now: () => NOW, concurrency: 1 });
  assert.equal(r.warning, "Kroger's daily limit was reached.");
  assert.equal(r.failed, 3, "stops asking after a quota error and says how many weren't checked");
  assert.equal(failing.calls.length, 1);
});

test("specials: results are cached per store", async () => {
  const cache = createMemoryCache(60_000);
  const { p, calls } = provider({ eggs: [kroger("8", "Large Eggs", "12 ct", 3.99, 2.99)] });
  const ask = () => findStoreSpecials({ provider: p, storeId: STORE, terms: [{ term: "eggs", department: "dairy" }], now: () => NOW, cache });
  assert.equal((await ask()).specials.length, 1);
  assert.equal((await ask()).specials.length, 1);
  assert.equal(calls.length, 1);
});

test("specials: request validation and staple terms", () => {
  assert.ok(STAPLE_SPECIALS_TERMS.length <= 40, "staples stay within the daily API budget");
  assert.ok(specialsRequestSchema.safeParse({ storeId: STORE, terms: STAPLE_SPECIALS_TERMS }).success);
  assert.ok(!specialsRequestSchema.safeParse({ storeId: "../x", terms: [] }).success);
  assert.ok(!specialsRequestSchema.safeParse({ storeId: STORE, terms: [{ term: "x", department: "produce" }] }).success);
});
