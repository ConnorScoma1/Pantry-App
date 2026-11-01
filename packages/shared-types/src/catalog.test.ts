import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as catalog from "./catalog";

test("catalog codes are unique within each catalog", () => {
  for (const [name, value] of Object.entries(catalog)) {
    if (!Array.isArray(value)) continue;
    const codes = value.map((item: Record<string, unknown>) => item.code ?? item.slug ?? item.level ?? item);
    assert.equal(new Set(codes).size, codes.length, `duplicate code in ${name}`);
  }
});

test("skill levels run 1 through 5 in order", () => {
  assert.deepEqual(
    catalog.skillLevels.map((s) => s.level),
    [1, 2, 3, 4, 5],
  );
});

test("labelFor falls back to the code for unknown values", () => {
  assert.equal(catalog.labelFor(catalog.cuisines, "thai"), "Thai");
  assert.equal(catalog.labelFor(catalog.cuisines, "martian"), "martian");
});
