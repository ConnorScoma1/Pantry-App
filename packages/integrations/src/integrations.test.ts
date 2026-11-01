import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hasStoreLookup, supportedRetailers, type StoreLocatorProvider } from "./index";

test("no retailers are reported as supported until a provider is registered", () => {
  assert.deepEqual(supportedRetailers("US"), []);
  assert.equal(hasStoreLookup("US"), false);
});

test("registered providers expose only their own retailers and countries", () => {
  const fake: StoreLocatorProvider = {
    id: "test",
    retailerSlugs: ["kroger"],
    countries: ["US"],
    findStores: async () => [],
  };
  const registry = { storeLocators: [fake] };
  assert.deepEqual(supportedRetailers("US", registry), ["kroger"]);
  assert.deepEqual(supportedRetailers("CA", registry), []);
});
