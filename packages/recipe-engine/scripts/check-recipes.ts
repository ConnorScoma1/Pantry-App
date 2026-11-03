/**
 * Check one file of new library recipes before adding it to the collection:
 *   npx tsx scripts/check-recipes.ts <path-to-file.ts> <exportName>
 * Runs each recipe through the import pipeline (validation, units, food
 * safety, allergens) and the duplicate check against the existing full
 * recipes, then prints what a reviewer should look at.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDuplicateIndex } from "../src/library/dedupe";
import { prepareRecipe, type LibraryRecipeInput } from "../src/library/import";
import { testKitchenRecipes } from "../src/catalog/test-kitchen";
import { libraryCollection, TEST_KITCHEN_LIBRARY_SOURCE } from "../src/catalog/library/index";

const [file, name] = process.argv.slice(2);
if (!file || !name) throw new Error("usage: check-recipes.ts <file> <exportName>");
const mod = await import(pathToFileURL(resolve(file)).href);
const inputs: LibraryRecipeInput[] = mod[name];
if (!Array.isArray(inputs)) throw new Error(`${name} is not exported as an array from ${file}`);

const index = createDuplicateIndex([...testKitchenRecipes, ...libraryCollection.filter((r) => r.steps.length > 0)]);
let bad = 0;
for (const input of inputs) {
  const r = prepareRecipe(input, TEST_KITCHEN_LIBRARY_SOURCE);
  if (!r.ok) {
    bad += 1;
    console.log(`✖ ${input.externalId}: ${r.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`);
    continue;
  }
  const dup = index.check(r.recipe).find((m) => m.kind !== "version");
  if (dup) {
    bad += 1;
    console.log(`✖ ${input.externalId}: duplicate (${dup.kind}) of "${dup.existing.title}"`);
    continue;
  }
  index.add(r.recipe);
  const rec: any = r.recipe;
  const warn = r.warnings.filter((w) => w.field !== "image").map((w) => `${w.field}: ${w.message}`);
  console.log(
    `✔ ${rec.title} | course ${rec.course} | allergens [${r.recipe.facets.allergens.join(", ")}] | diet [${r.recipe.facets.dietTags.join(", ")}] | proteins [${r.recipe.facets.proteins.join(", ")}] | ${rec.totalMinutes ?? ""}min` +
      (warn.length ? `\n    ⚠ ${warn.join("\n    ⚠ ")}` : ""),
  );
}
console.log(`\n${inputs.length - bad}/${inputs.length} recipes pass.`);
if (bad) process.exitCode = 1;
