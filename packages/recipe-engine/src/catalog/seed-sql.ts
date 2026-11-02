import type { Recipe } from "@kitchen-pantry/shared-types";
import { formatIngredientLine } from "../recipes";
import { TEST_KITCHEN_SOURCE } from "./build";
import { catalogRecipes } from "./library";
import { facetsOf, libraryOf } from "../library/facets";
import type { LibraryRecipe } from "../library/import";

function lit(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}

function arr(values: string[]): string {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map(lit).join(", ")}]::text[]`;
}

function recipeSql(r: Recipe, sourceName: string = TEST_KITCHEN_SOURCE.name): string {
  const ingredients = r.ingredients
    .map(
      (i) =>
        `  (${lit(r.id)}, ${i.position}, ${lit(i.component)}, ${lit(formatIngredientLine(i))}, ${lit(i.item)}, ${lit(i.quantity)}, ${lit(i.unit)}, ${lit(i.preparation)}, ${lit(i.optional)})`,
    )
    .join(",\n");
  const steps = r.steps
    .map(
      (s) =>
        `  (${lit(r.id)}, ${s.position}, ${lit(s.component)}, ${lit(s.body)}, ${lit(s.timerSeconds)}, ${lit(s.temperatureC)}, ${lit(s.safeInternalTempC)})`,
    )
    .join(",\n");

  const img = r.image;
  const lib = libraryOf(r);
  const f = facetsOf(r);
  const x = r as Recipe & Partial<Pick<LibraryRecipe, "externalId" | "attribution" | "review" | "nutrition">>;
  const ext = x.externalId ?? r.slug;
  return `-- ${r.title}${lib.status === "idea" ? " (dish idea)" : ""}
insert into public.recipes (id, source_id, external_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, course, dessert_category, chill_minutes, required_equipment, tags, tips, image_url, image_alt, image_credit, image_credit_url, image_source_url, image_license, image_is_representative, visibility, is_mock,
  status, categories, methods, flavors, occasions, region, authenticity, dish_key, variant, storage_notes, safety_note, text_license, allergens, proteins, diet_tags, core_ingredients, fingerprint,
  attribution, reviewed_by, reviewed_at, calories_per_serving, protein_g, carbs_g, fat_g, nutrition_source)
values (${lit(r.id)}, (select id from public.recipe_sources where name = ${lit(sourceName)}), ${lit(ext)}, ${lit(r.slug)}, ${lit(r.title)}, ${lit(r.description)}, ${lit(r.cuisine)}, ${r.skillLevel}, ${r.prepMinutes}, ${r.cookMinutes}, ${r.totalMinutes}, ${r.servings}, ${lit(r.course)}, ${lit(r.dessertCategory)}, ${r.chillMinutes}, ${arr(r.requiredEquipment)}, ${arr(r.tags)}, ${arr(r.tips)}, ${lit(img?.url ?? null)}, ${lit(img?.alt ?? null)}, ${lit(img?.creditName ?? null)}, ${lit(img?.creditUrl ?? null)}, ${lit(img?.sourceUrl ?? null)}, ${lit(img?.license ?? null)}, ${lit(img?.representative ?? null)}, 'public', false,
  ${lit(lib.status)}, ${arr(lib.categories)}, ${arr(lib.methods)}, ${arr(lib.flavors)}, ${arr(lib.occasions)}, ${lit(lib.region)}, ${lit(lib.authenticity)}, ${lit(lib.dishKey)}, ${lit(lib.variant)}, ${lit(lib.storage)}, ${lit(lib.safetyNote)}, ${lit(lib.license)}, ${arr(f.allergens)}, ${arr(f.proteins)}, ${arr(f.dietTags)}, ${arr(f.core)}, ${lit(f.fingerprint)},
  ${lit(x.attribution ?? null)}, ${lit(x.review?.by ?? null)}, ${lit(x.review?.at ?? null)}, ${lit(x.nutrition?.calories ?? null)}, ${lit(x.nutrition?.proteinG ?? null)}, ${lit(x.nutrition?.carbsG ?? null)}, ${lit(x.nutrition?.fatG ?? null)}, ${lit(x.nutrition?.source ?? null)})
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, course = excluded.course,
  dessert_category = excluded.dessert_category, chill_minutes = excluded.chill_minutes, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips, image_url = excluded.image_url, image_alt = excluded.image_alt,
  image_credit = excluded.image_credit, image_credit_url = excluded.image_credit_url, image_source_url = excluded.image_source_url,
  image_license = excluded.image_license, image_is_representative = excluded.image_is_representative,
  external_id = excluded.external_id, status = excluded.status, categories = excluded.categories, methods = excluded.methods,
  flavors = excluded.flavors, occasions = excluded.occasions, region = excluded.region, authenticity = excluded.authenticity,
  dish_key = excluded.dish_key, variant = excluded.variant, storage_notes = excluded.storage_notes, safety_note = excluded.safety_note,
  text_license = excluded.text_license, allergens = excluded.allergens, proteins = excluded.proteins, diet_tags = excluded.diet_tags,
  core_ingredients = excluded.core_ingredients, fingerprint = excluded.fingerprint, attribution = excluded.attribution,
  reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, calories_per_serving = excluded.calories_per_serving,
  protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, nutrition_source = excluded.nutrition_source;
delete from public.recipe_ingredients where recipe_id = ${lit(r.id)};
${ingredients ? `insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
${ingredients};
` : ""}delete from public.recipe_instructions where recipe_id = ${lit(r.id)};
${steps ? `insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
${steps};
` : ""}`;
}

/**
 * A reviewable SQL file for an import (scripts/import-recipes.ts --sql):
 * creates the source unapproved, then upserts each recipe. Apply it with
 * psql after reading it; approve the source when the licence is confirmed.
 */
export function buildImportSql(recipes: Recipe[], source: { name: string; kind: string; url?: string | null; license: string }, header: string): string {
  return `-- GENERATED by scripts/import-recipes.ts — review before applying.
${header
  .split("\n")
  .map((l) => `-- ${l}`)
  .join("\n")}
begin;
insert into public.recipe_sources (name, kind, website, license_notes, attribution_required, is_approved)
values (${lit(source.name)}, ${lit(source.kind)}, ${lit(source.url ?? null)}, ${lit(source.license)}, true, false)
on conflict (name) do update set website = excluded.website, license_notes = excluded.license_notes;
-- The source stays hidden (is_approved = false) until you approve it:
--   update public.recipe_sources set is_approved = true where name = ${lit(source.name)};

${recipes.map((r) => recipeSql(r, source.name)).join("\n")}
commit;
`;
}

export function buildRecipeSeedSql(recipes: Recipe[] = catalogRecipes): string {
  return `-- GENERATED FILE — do not edit by hand.
-- Source: packages/recipe-engine/src/catalog/test-kitchen.ts and catalog/library/ (the library collection and dish ideas)
-- Every recipe is "pending_review" until a person reviews it; dish ideas have no ingredients or steps.
-- Regenerate with: npm run seed --workspace=@kitchen-pantry/recipe-engine
-- Original Kitchen Pantry Test Kitchen recipes. No ratings are seeded.
-- Photos are credited, free-licence photos of similar dishes (see catalog/photos.ts).

${recipes.map((r) => recipeSql(r)).join("\n")}`;
}
