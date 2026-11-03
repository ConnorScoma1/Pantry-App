import type { Recipe } from "@kitchen-pantry/shared-types";
import { createDuplicateIndex } from "../../library/dedupe";
import { prepareRecipe, type ImportIssue, type LibraryRecipe, type LibraryRecipeInput, type LibrarySourceInput } from "../../library/import";
import { testKitchenRecipes } from "../test-kitchen";
import { TEST_KITCHEN_SOURCE } from "../build";
import { dishIdeas } from "./ideas";
import { worldCourses } from "./world-courses";
import { worldMains } from "./world-mains";
import { beginnerMains, plantMains } from "./beginner-mains";
import { americasRecipes } from "./americas";
import { europeRecipes } from "./europe";
import { africaMiddleEastRecipes } from "./africa-middle-east";
import { asiaRecipes } from "./asia";
import { moreDishes1 } from "./more-dishes-1";
import { moreDishes2 } from "./more-dishes-2";
import { moreDishes3 } from "./more-dishes-3";
import { moreDishes4 } from "./more-dishes-4";
import { moreDishes5 } from "./more-dishes-5";
import { moreDishes6 } from "./more-dishes-6";
import { moreDishes7 } from "./more-dishes-7";
import { comfortClassics } from "./comfort-classics";
import { takeoutFavorites } from "./takeout-favorites";
import { soupsSaladsSides } from "./soups-salads-sides";
import { breakfastBaking } from "./breakfast-baking";

/**
 * The library's first collection: original Test Kitchen recipes written in
 * the import format and run through the same pipeline as any other source
 * (validation, units, food safety, allergens, duplicates). `npm run seed`
 * writes them into supabase/seed_recipes.sql; preview mode uses them as-is.
 */
export const TEST_KITCHEN_LIBRARY_SOURCE: LibrarySourceInput = { name: TEST_KITCHEN_SOURCE.name, kind: "original", license: "owned" };

export const LIBRARY_COLLECTION_INPUTS: readonly LibraryRecipeInput[] = [
  ...worldMains,
  ...beginnerMains,
  ...plantMains,
  ...worldCourses,
  ...americasRecipes,
  ...europeRecipes,
  ...africaMiddleEastRecipes,
  ...asiaRecipes,
  ...moreDishes1,
  ...moreDishes2,
  ...moreDishes3,
  ...moreDishes4,
  ...moreDishes5,
  ...moreDishes6,
  ...moreDishes7,
  ...comfortClassics,
  ...takeoutFavorites,
  ...soupsSaladsSides,
  ...breakfastBaking,
  ...dishIdeas,
];

export interface CollectionReport {
  accepted: number;
  rejected: Array<{ externalId: string; errors: ImportIssue[] }>;
  duplicates: Array<{ externalId: string; existing: string; kind: string }>;
  warnings: Array<{ externalId: string; warnings: ImportIssue[] }>;
}

function build(): { recipes: LibraryRecipe[]; report: CollectionReport } {
  const index = createDuplicateIndex(testKitchenRecipes);
  const recipes: LibraryRecipe[] = [];
  const report: CollectionReport = { accepted: 0, rejected: [], duplicates: [], warnings: [] };
  for (const input of LIBRARY_COLLECTION_INPUTS) {
    const r = prepareRecipe(input, TEST_KITCHEN_LIBRARY_SOURCE);
    if (!r.ok) {
      report.rejected.push({ externalId: input.externalId, errors: r.errors });
      continue;
    }
    const dup = index.check(r.recipe).find((m) => m.kind !== "version");
    if (dup) {
      report.duplicates.push({ externalId: input.externalId, existing: dup.existing.title, kind: dup.kind });
      continue;
    }
    if (r.warnings.length) report.warnings.push({ externalId: input.externalId, warnings: r.warnings });
    index.add(r.recipe);
    recipes.push(r.recipe);
  }
  report.accepted = recipes.length;
  return { recipes, report };
}

const built = build();
export const libraryCollection: LibraryRecipe[] = built.recipes;
export const libraryCollectionReport: CollectionReport = built.report;

/** Everything the app ships with: Test Kitchen recipes, the library collection and dish ideas. */
export const catalogRecipes: Recipe[] = [...testKitchenRecipes, ...libraryCollection];
