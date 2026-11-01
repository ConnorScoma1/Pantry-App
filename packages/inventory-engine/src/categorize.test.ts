import { strict as assert } from "node:assert";
import { test } from "node:test";
import { guessCategory } from "./index";

const cat = (name: string) => guessCategory(name)?.category ?? null;

test("common items land in sensible categories", () => {
  assert.equal(cat("Baby spinach"), "produce");
  assert.equal(cat("Heavy cream"), "dairy");
  assert.equal(cat("Chicken thighs"), "protein");
  assert.equal(cat("Jasmine rice"), "rice");
  assert.equal(cat("Penne"), "pasta");
  assert.equal(cat("Frozen peas"), "frozen");
});

test("specific phrases beat generic words", () => {
  assert.equal(cat("Black pepper"), "spice");
  assert.equal(cat("Red bell pepper"), "produce");
  assert.equal(cat("Peanut butter"), "condiment");
  assert.equal(cat("Garlic powder"), "spice");
  assert.equal(cat("Garlic"), "produce");
  assert.equal(cat("Chicken broth"), "canned");
  assert.equal(cat("Eggplant"), null);
});

test("storage follows the category guess", () => {
  assert.equal(guessCategory("Ground beef")?.storageLocation, "fridge");
  assert.equal(guessCategory("Yellow onions")?.storageLocation, "counter");
  assert.equal(guessCategory("Frozen peas")?.storageLocation, "freezer");
  assert.equal(guessCategory("ab"), null);
});
