import { strict as assert } from "node:assert";
import { test } from "node:test";
import { emptyPantryItemInput, issuesToFieldErrors, pantryItemInputSchema } from "./index";

const valid = () => ({ ...emptyPantryItemInput(), name: "Baby spinach", category: "produce" as const });

test("a minimal item validates", () => {
  assert.ok(pantryItemInputSchema.safeParse(valid()).success);
});

test("names are trimmed and required", () => {
  assert.equal(pantryItemInputSchema.parse({ ...valid(), name: "  Eggs  " }).name, "Eggs");
  assert.ok(!pantryItemInputSchema.safeParse({ ...valid(), name: "   " }).success);
});

test("a quantity needs a unit, and must be positive", () => {
  const noUnit = pantryItemInputSchema.safeParse({ ...valid(), quantity: 2 });
  assert.ok(!noUnit.success);
  assert.ok(issuesToFieldErrors(noUnit.error).unit);
  assert.ok(!pantryItemInputSchema.safeParse({ ...valid(), quantity: 0, unit: "lb" }).success);
  assert.ok(pantryItemInputSchema.safeParse({ ...valid(), quantity: 1.5, unit: "lb" }).success);
});

test("dates must be real ISO dates", () => {
  assert.ok(pantryItemInputSchema.safeParse({ ...valid(), useBy: "2026-11-09" }).success);
  assert.ok(!pantryItemInputSchema.safeParse({ ...valid(), useBy: "11/09/2026" }).success);
  assert.ok(!pantryItemInputSchema.safeParse({ ...valid(), useBy: "2026-02-30" }).success);
});

test("opened before purchased is rejected", () => {
  const r = pantryItemInputSchema.safeParse({ ...valid(), purchasedOn: "2026-11-05", openedOn: "2026-11-01" });
  assert.ok(!r.success);
});

test("remaining amount is 0-100", () => {
  assert.ok(!pantryItemInputSchema.safeParse({ ...valid(), estimatedRemainingPct: 150 }).success);
  assert.ok(pantryItemInputSchema.safeParse({ ...valid(), estimatedRemainingPct: 50 }).success);
});
