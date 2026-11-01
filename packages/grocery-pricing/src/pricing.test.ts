import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classifyPrice, formatCents, linePriceCents, MockPricingProvider, planPackages } from "./index";

test("12 oz broccoli sold in 1 lb packages needs one package", () => {
  const plan = planPackages({ value: 12, unit: "oz" }, { value: 1, unit: "lb" });
  assert.ok(plan);
  assert.equal(plan.packages, 1);
  assert.ok(Math.abs(plan.leftover.value - 4) < 1e-9);
});

test("exact multiples don't round up because of float noise", () => {
  const plan = planPackages({ value: 2, unit: "lb" }, { value: 16, unit: "oz" });
  assert.equal(plan?.packages, 2);
});

test("incomparable package sizes return null instead of guessing", () => {
  assert.equal(planPackages({ value: 2, unit: "cup" }, { value: 1, unit: "lb" }), null);
  assert.equal(planPackages({ value: 1, unit: "bunch" }, { value: 1, unit: "each" }), null);
});

test("promo price is used when present", () => {
  assert.equal(linePriceCents(2, { priceCents: 300, promoPriceCents: 250 }), 500);
  assert.equal(linePriceCents(2, { priceCents: 300, promoPriceCents: null }), 600);
});

test("formatCents formats currency", () => {
  assert.equal(formatCents(7603), "$76.03");
});

test("mock prices are always labelled estimated, never verified", async () => {
  const provider = new MockPricingProvider();
  const [obs] = await provider.getPrices("store-1", ["sample-broccoli-1lb"]);
  assert.ok(obs);
  assert.equal(classifyPrice(obs, provider), "estimated");
});

test("store-specific prices age from verified to cached to estimated", () => {
  const live = { isMock: false, storeSpecific: true };
  const now = new Date("2026-11-08T12:00:00Z");
  const hoursAgo = (h: number) => ({ observedAt: new Date(now.getTime() - h * 3_600_000) });
  assert.equal(classifyPrice(hoursAgo(1), live, now), "verified");
  assert.equal(classifyPrice(hoursAgo(48), live, now), "cached");
  assert.equal(classifyPrice(hoursAgo(24 * 30), live, now), "estimated");
  assert.equal(classifyPrice(null, live, now), "unavailable");
});

test("mock search matches by keyword", async () => {
  const results = await new MockPricingProvider().searchProducts({ text: "broccoli", storeId: "s" });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.provider, "mock");
});
