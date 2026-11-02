import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  chooseProduct,
  createMemoryCache,
  KrogerClient,
  KrogerPricingProvider,
  matchScore,
  parseSize,
  priceBasket,
  PricingProviderError,
  basketPriceSchema,
  onSale,
  type PricedLine,
  pricingRequestSchema,
  searchTerm,
  toPricedProduct,
  type PricedProduct,
} from "./index";

const NOW = new Date("2026-11-01T18:00:00Z");

/** Kroger-shaped product, as the public API returns it. */
function product(id: string, description: string, size: string, regular: number | undefined, extra: Record<string, unknown> = {}) {
  return {
    productId: id,
    upc: `000${id}`,
    description,
    brand: "Kroger",
    items: [{ itemId: id, size, soldBy: "UNIT", price: regular === undefined ? undefined : { regular, promo: 0 }, inventory: { stockLevel: "HIGH" }, ...extra }],
  };
}

function fakeKroger(handler: (url: URL) => { status?: number; body: unknown }) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/v1/connect/oauth2/token") {
      assert.match(String((init?.headers as Record<string, string>).Authorization), /^Basic /);
      assert.match(String(init?.body), /grant_type=client_credentials/);
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 1800 }), { status: 200 });
    }
    const r = handler(url);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  const client = new KrogerClient({ clientId: "id", clientSecret: "secret", fetch: fetchImpl, now: () => NOW });
  return { client, calls };
}

test("kroger: sizes are read from the store's text, never guessed", () => {
  assert.deepEqual(parseSize("16 oz"), { value: 16, unit: "oz" });
  assert.deepEqual(parseSize("12 fl oz"), { value: 12, unit: "fl_oz" });
  assert.deepEqual(parseSize("1/2 gal"), { value: 0.5, unit: "gallon" });
  assert.deepEqual(parseSize("2 lb / 32 oz"), { value: 2, unit: "lb" });
  assert.deepEqual(parseSize("12 ct"), { value: 12, unit: "each" });
  assert.deepEqual(parseSize("14.5 oz"), { value: 14.5, unit: "oz" });
  assert.equal(parseSize("family size"), null);
  assert.equal(parseSize(""), null);
});

test("kroger: products map to store prices; sale only when below regular", () => {
  const sale = toPricedProduct({ ...product("1", "Baby Spinach", "5 oz", 3.49), items: [{ size: "5 oz", price: { regular: 3.49, promo: 2.5 }, inventory: { stockLevel: "LOW" } }] }, "01400376", NOW)!;
  assert.equal(sale.observation!.priceCents, 349);
  assert.equal(sale.observation!.promoPriceCents, 250);
  assert.equal(sale.observation!.availability, "limited");
  const noSale = toPricedProduct(product("2", "Lemon", "1 ct", 0.79), "01400376", NOW)!;
  assert.equal(noSale.observation!.promoPriceCents, null, "promo 0 means no sale");
  const noPrice = toPricedProduct(product("3", "Parsley", "1 bunch", undefined), "01400376", NOW)!;
  assert.equal(noPrice.observation, null, "no price reported → no price, not zero");
  const weight = toPricedProduct({ ...product("4", "Bananas", "1 lb", 0.59), items: [{ size: "1 lb", soldBy: "WEIGHT", price: { regular: 0.59 } }] }, "x1234567", NOW)!;
  assert.equal(weight.product.soldByWeight, true);
  assert.equal(toPricedProduct({ productId: "", description: "" }, "x", NOW), null, "invalid rows are dropped");
});

test("kroger: client gets a token, searches by term + store, and reuses the token", async () => {
  const { client, calls } = fakeKroger((url) => {
    assert.equal(url.searchParams.get("filter.locationId"), "01400376");
    return { body: { data: [product("1", "Kroger® Baby Spinach", "5 oz", 3.49)] } };
  });
  const provider = new KrogerPricingProvider(client);
  await provider.searchPriced({ text: "Baby Spinach!", storeId: "01400376" });
  await provider.searchPriced({ text: "lemons", storeId: "01400376" });
  assert.equal(calls.filter((c) => c.includes("oauth2")).length, 1, "token cached");
  assert.match(calls[1]!, /filter\.term=baby\+spinach/);
});

test("kroger: store lookup by ZIP validates input and maps addresses", async () => {
  const { client, calls } = fakeKroger(() => ({
    body: { data: [{ locationId: "53100123", chain: "PICK N SAVE", name: "Pick 'n Save Franklin", address: { addressLine1: "1 Main St", city: "Franklin", state: "WI", zipCode: "53132" } }, { bad: true }] },
  }));
  await assert.rejects(client.findStores({ postalCode: "abc" }), /5-digit/);
  const stores = await client.findStores({ postalCode: "53132", radiusMiles: 10 });
  assert.equal(stores.length, 1);
  assert.equal(stores[0]!.chain, "PICK N SAVE");
  assert.match(calls.at(-1)!, /filter\.zipCode\.near=53132/);
});

test("kroger: credential and limit errors are typed, never shown as prices", async () => {
  const bad = new KrogerClient({
    clientId: "id",
    clientSecret: "nope",
    fetch: (async () => new Response("{}", { status: 401 })) as typeof fetch,
  });
  await assert.rejects(bad.searchProducts("milk", "01400376"), (e: unknown) => e instanceof PricingProviderError && e.kind === "auth");
  const { client } = fakeKroger(() => ({ status: 429, body: {} }));
  await assert.rejects(client.searchProducts("milk", "01400376"), (e: unknown) => e instanceof PricingProviderError && e.kind === "rate_limited");
  assert.throws(() => new KrogerClient({ clientId: "", clientSecret: "" }), /isn't configured/);
});

test("kroger: search terms are trimmed to the API's eight-word limit", () => {
  assert.equal(searchTerm("one two three four five six seven eight nine ten"), "one two three four five six seven eight");
});

// ---------------------------------------------------------------------------
// Matching and basket pricing
// ---------------------------------------------------------------------------
const priced = (raw: unknown) => toPricedProduct(raw, "01400376", NOW)!;

test("matching: key words must all appear; other product forms don't count", () => {
  assert.ok(matchScore("baby spinach", "Kroger® Baby Spinach") > matchScore("baby spinach", "Organic Spinach"));
  assert.ok(matchScore("baby spinach", "Organic Spinach") >= 0.99, "descriptor 'baby' is optional");
  assert.ok(matchScore("lemon", "Lemon Juice") < 0.99, "juice isn't a lemon");
  assert.ok(matchScore("chicken broth", "Chicken Breast") < 0.99);
  assert.ok(matchScore("diced tomatoes", "Kroger Diced Tomatoes") >= 0.99);
  assert.ok(matchScore("potatoes", "Russet Potato") >= 0.99, "plurals match");
});

test("matching: cheapest way to buy the amount needed, preferring in-stock", () => {
  const need = { id: "a", name: "baby spinach", quantity: { value: 280, unit: "g" } }; // ~10 oz
  const small = priced(product("s", "Baby Spinach", "5 oz", 2.99)); // 2 × 2.99 = 5.98
  const big = priced(product("b", "Baby Spinach", "11 oz", 4.99)); // 1 × 4.99
  const out = priced({ ...product("o", "Baby Spinach", "16 oz", 3.0), items: [{ size: "16 oz", price: { regular: 3.0 }, inventory: { stockLevel: "TEMPORARILY_OUT_OF_STOCK" } }] });
  const choice = chooseProduct(need, [small, big, out])!;
  assert.equal(choice.priced.product.externalProductId, "b");
  assert.equal(choice.packages, 1);
  assert.equal(choice.totalCents, 499);
});

test("basket: honest totals with missing, assumed, sale and weight lines", async () => {
  const catalog: Record<string, PricedProduct[]> = {
    "baby spinach": [priced({ ...product("1", "Baby Spinach", "5 oz", 3.49), items: [{ size: "5 oz", price: { regular: 3.49, promo: 2.99 }, inventory: { stockLevel: "HIGH" } }] })],
    "heavy cream": [priced(product("2", "Heavy Whipping Cream", "1 pint", 3.79))],
    bananas: [priced({ ...product("3", "Bananas", "1 lb", 0.6), items: [{ soldBy: "WEIGHT", size: "1 lb", price: { regular: 0.6 } }] })],
    "fresh dill": [priced(product("4", "Dill Pickles", "24 oz", 3.0))],
    "paper towels": [priced(product("5", "Paper Towels", "6 ct", 8.99))],
    saffron: [],
  };
  const provider = {
    id: "kroger",
    displayName: "Kroger",
    isMock: false,
    storeSpecific: true,
    searchProducts: async () => [],
    getPrices: async () => [],
    searchPriced: async (q: { text: string }) => catalog[q.text] ?? [],
  };
  let searches = 0;
  const counted = { ...provider, searchPriced: async (q: { text: string; storeId: string }) => (searches++, provider.searchPriced(q)) };
  const cache = createMemoryCache(60_000);
  const needs = [
    { id: "1", name: "baby spinach", quantity: { value: 200, unit: "g" } }, // 7 oz → 2 bags on sale
    { id: "2", name: "heavy cream", quantity: { value: 1, unit: "cup" } }, // 1 pint
    { id: "3", name: "bananas", quantity: { value: 907, unit: "g" } }, // 2 lb by weight
    { id: "4", name: "fresh dill", quantity: { value: 15, unit: "ml" } }, // pickles don't match
    { id: "5", name: "paper towels", quantity: null }, // typed item, 1 package
    { id: "6", name: "saffron", quantity: { value: 1, unit: "g" } },
  ];
  const basket = await priceBasket({ provider: counted, storeId: "01400376", needs, cache, now: () => NOW });
  const by = Object.fromEntries(basket.lines.map((l) => [l.id, l]));
  assert.equal(by["1"]!.packages, 2);
  assert.equal(by["1"]!.lineTotalCents, 598);
  assert.equal(by["1"]!.status, "verified");
  assert.equal(by["2"]!.lineTotalCents, 379);
  assert.equal(by["3"]!.packages, null);
  assert.equal(by["3"]!.lineTotalCents, 120);
  assert.equal(by["4"]!.status, "unavailable");
  assert.equal(by["4"]!.note, "No match at this store");
  assert.equal(by["5"]!.assumedOnePackage, true);
  assert.equal(by["6"]!.lineTotalCents, null);
  assert.equal(basket.totalCents, 598 + 379 + 120 + 899);
  assert.equal(basket.pricedCount, 4);
  assert.equal(basket.missingCount, 2);
  assert.equal(basket.assumedCount, 1);
  assert.equal(basket.saleSavingsCents, 100);
  assert.ok(basketPriceSchema.safeParse(basket).success);
  await priceBasket({ provider: counted, storeId: "01400376", needs, cache, now: () => NOW });
  assert.equal(searches, 6, "second pricing came from the cache");
});

test("basket: a credentials failure stops asking and returns no invented prices", async () => {
  let calls = 0;
  const provider = {
    id: "kroger",
    displayName: "Kroger",
    isMock: false,
    storeSpecific: true,
    searchProducts: async () => [],
    getPrices: async () => [],
    searchPriced: async () => {
      calls++;
      throw new PricingProviderError("Kroger rejected the API credentials.", "kroger", false, { kind: "auth" });
    },
  };
  const needs = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `item ${i}`, quantity: null }));
  const basket = await priceBasket({ provider, storeId: "01400376", needs, concurrency: 1 });
  assert.equal(calls, 1);
  assert.equal(basket.totalCents, 0);
  assert.equal(basket.pricedCount, 0);
  assert.match(basket.warning!, /credentials/);
  assert.ok(basket.lines.every((l) => l.status === "unavailable"));
});

test("pricing requests carry names and amounts only", () => {
  assert.ok(pricingRequestSchema.safeParse({ storeId: "01400376", items: [{ id: "a", name: "milk", quantity: null }] }).success);
  assert.ok(!pricingRequestSchema.safeParse({ storeId: "../../x", items: [{ id: "a", name: "milk", quantity: null }] }).success);
  assert.ok(!pricingRequestSchema.safeParse({ storeId: "01400376", items: [] }).success);
});

test("onSale: only real promo prices below regular, in stock", () => {
  const line = (id: string, regular: number | null, sale: number | null, extra: Partial<PricedLine> = {}): PricedLine => ({
    id, status: "verified", product: null, packages: 1, regularCents: regular, saleCents: sale, lineTotalCents: sale ?? regular,
    assumedOnePackage: false, outOfStock: false, note: null, observedAt: null, ...extra,
  });
  const lines = [line("a", 299, 199), line("b", 299, null), line("c", 299, 199, { outOfStock: true }), line("d", null, null, { status: "unavailable" })];
  assert.deepEqual(onSale(lines).map((l) => l.id), ["a"]);
});
