import type { Recipe } from "@kitchen-pantry/shared-types";
import { formatIngredientLine } from "../recipes";
import { testKitchenRecipes } from "./test-kitchen";
import { TEST_KITCHEN_SOURCE } from "./build";

function lit(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}

function arr(values: string[]): string {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map(lit).join(", ")}]::text[]`;
}

function recipeSql(r: Recipe): string {
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

  return `-- ${r.title}
insert into public.recipes (id, source_id, slug, title, description, cuisine, skill_level, prep_minutes, cook_minutes, total_minutes, servings, required_equipment, tags, tips, visibility, is_mock)
values (${lit(r.id)}, (select id from public.recipe_sources where name = ${lit(TEST_KITCHEN_SOURCE.name)}), ${lit(r.slug)}, ${lit(r.title)}, ${lit(r.description)}, ${lit(r.cuisine)}, ${r.skillLevel}, ${r.prepMinutes}, ${r.cookMinutes}, ${r.totalMinutes}, ${r.servings}, ${arr(r.requiredEquipment)}, ${arr(r.tags)}, ${arr(r.tips)}, 'public', false)
on conflict (id) do update set
  slug = excluded.slug, title = excluded.title, description = excluded.description, cuisine = excluded.cuisine,
  skill_level = excluded.skill_level, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
  total_minutes = excluded.total_minutes, servings = excluded.servings, required_equipment = excluded.required_equipment,
  tags = excluded.tags, tips = excluded.tips;
delete from public.recipe_ingredients where recipe_id = ${lit(r.id)};
insert into public.recipe_ingredients (recipe_id, position, component, raw_text, item, original_quantity, original_unit, preparation, is_optional) values
${ingredients};
delete from public.recipe_instructions where recipe_id = ${lit(r.id)};
insert into public.recipe_instructions (recipe_id, position, component, body, timer_seconds, temperature_c, safe_internal_temp_c) values
${steps};
`;
}

export function buildRecipeSeedSql(recipes: Recipe[] = testKitchenRecipes): string {
  return `-- GENERATED FILE — do not edit by hand.
-- Source: packages/recipe-engine/src/catalog/test-kitchen.ts
-- Regenerate with: npm run seed --workspace=@kitchen-pantry/recipe-engine
-- Original Kitchen Pantry Test Kitchen recipes. No ratings are seeded.

${recipes.map(recipeSql).join("\n")}`;
}
