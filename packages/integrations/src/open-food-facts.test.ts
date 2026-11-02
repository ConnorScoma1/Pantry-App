import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidGtin, normalizeBarcode, OpenFoodFactsClient, ProductLookupError, toScannedProduct } from "./index";

test("barcodes: check digits are verified and UPC-A becomes EAN-13", () => {
  assert.ok(isValidGtin("3017624010701")); // EAN-13
  assert.ok(isValidGtin("036000291452")); // UPC-A
  assert.ok(isValidGtin("96385074")); // EAN-8
  assert.ok(!isValidGtin("3017624010702"));
  assert.ok(!isValidGtin("12345"));
  assert.equal(normalizeBarcode(" 0 36000 29145 2 "), "0036000291452");
  assert.equal(normalizeBarcode("abc"), null);
  // UPC-E 04252614 is UPC-A 042100005264 (a common example).
  assert.equal(normalizeBarcode("04252614", "upc_e"), "0042100005264");
  assert.equal(normalizeBarcode("04252614"), "0042100005264");
});

test("products: only name, brand, size and a category guess are taken; markup is stripped", () => {
  const p = toScannedProduct("3017624010701", { status: 1, product: { product_name: "Nutella <b>", brands: "Ferrero, Nutella", quantity: "400 g", categories_tags: ["en:spreads"] } })!;
  assert.equal(p.name, "Nutella");
  assert.equal(p.brand, "Ferrero");
  assert.deepEqual(p.quantity, { value: 400, unit: "g" });
  assert.equal(toScannedProduct("1", { status: 0 }), null);
  assert.equal(toScannedProduct("1", { status: 1, product: { brands: "X" } }), null);
  assert.throws(() => toScannedProduct("1", "not json"), ProductLookupError);
  // Oversized fields are trimmed, not a reason to call the product unknown.
  const big = toScannedProduct("1", { status: 1, product: { product_name: "Oats\u202E" + "x".repeat(900), quantity: "1 kg" + " ".repeat(200), categories_tags: Array(300).fill("en:cereals") } })!;
  assert.ok(big.name.startsWith("Oats") && big.name.length <= 120 && !big.name.includes("\u202E"));
  const milk = toScannedProduct("1", { status: 1, product: { product_name: "Whole milk", quantity: "1 gal" } })!;
  assert.equal(milk.category, "dairy");
  assert.equal(milk.storageLocation, "fridge");
});

test("client: identifies itself, asks only for a few fields, and maps errors", async () => {
  let url = "";
  let ua = "";
  const fetchSpy = (async (u: string, init: RequestInit) => {
    url = u;
    ua = (init.headers as Record<string, string>)["User-Agent"]!;
    return new Response(JSON.stringify({ status: 1, product: { product_name: "Spaghetti", brands: "Barilla", quantity: "16 oz" } }));
  }) as unknown as typeof fetch;
  const c = new OpenFoodFactsClient({ userAgent: "KitchenPantry/0.1 (test@example.com)", fetch: fetchSpy });
  const p = await c.lookup("036000291452");
  assert.equal(p?.name, "Spaghetti");
  assert.match(url, /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/0036000291452\?fields=/);
  assert.equal(ua, "KitchenPantry/0.1 (test@example.com)");
  await assert.rejects(c.lookup("123"), (e: ProductLookupError) => e.kind === "bad_request");
  const busy = new OpenFoodFactsClient({ userAgent: "KitchenPantry/0.1 (t@e.com)", fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch });
  await assert.rejects(busy.lookup("036000291452"), (e: ProductLookupError) => e.kind === "rate_limited");
  const missing = new OpenFoodFactsClient({ userAgent: "KitchenPantry/0.1 (t@e.com)", fetch: (async () => new Response("", { status: 404 })) as unknown as typeof fetch });
  assert.equal(await missing.lookup("036000291452"), null);
  assert.throws(() => new OpenFoodFactsClient({ userAgent: "curl" }));
  assert.throws(() => new OpenFoodFactsClient({ userAgent: "KitchenPantry/0.1 (self-hosted)" }));
  assert.doesNotThrow(() => new OpenFoodFactsClient({ userAgent: "KitchenPantry/0.1 (https://pantry.example)" }));
});
