import type {
  Cuisine,
  EquipmentCode,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  SkillLevel,
} from "@kitchen-pantry/shared-types";

/**
 * Small authoring helpers so catalogue recipes read like a recipe card.
 * Temperatures are written in °F (how US home cooks think) and stored in °C.
 */

import { TEST_KITCHEN_PHOTOS } from "./photos";

export const fToC = (f: number): number => Math.round((((f - 32) * 5) / 9) * 10) / 10;

export interface IngredientDef {
  qty: number | null;
  unit: string | null;
  item: string;
  prep?: string;
  optional?: boolean;
}

/** ing(1.5, "lb", "boneless chicken thighs", "cut into 1-inch pieces") */
export function ing(
  qty: number | null,
  unit: string | null,
  item: string,
  prep?: string,
  options: { optional?: boolean } = {},
): IngredientDef {
  return { qty, unit, item, prep, optional: options.optional };
}

export interface StepDef {
  body: string;
  minutes?: number;
  tempF?: number;
  safeF?: number;
}

export function step(body: string, options: Omit<StepDef, "body"> = {}): StepDef {
  return { body, ...options };
}

export interface RecipeDef {
  id: string;
  slug: string;
  title: string;
  description: string;
  cuisine: Cuisine;
  skillLevel: SkillLevel;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  equipment: EquipmentCode[];
  tags?: string[];
  tips?: string[];
  /** Either a flat list, or named components for multi-part dishes. */
  ingredients: IngredientDef[] | Array<{ component: string; items: IngredientDef[] }>;
  steps: StepDef[] | Array<{ component: string; steps: StepDef[] }>;
}

export const TEST_KITCHEN_SOURCE = {
  kind: "original" as const,
  name: "Kitchen Pantry Test Kitchen",
  url: null,
};

function isGrouped<T, G extends { component: string }>(list: T[] | G[]): list is G[] {
  return list.length > 0 && typeof list[0] === "object" && list[0] !== null && "component" in list[0];
}

export function defineRecipe(def: RecipeDef): Recipe {
  const ingredientGroups = isGrouped(def.ingredients)
    ? def.ingredients
    : [{ component: null as string | null, items: def.ingredients as IngredientDef[] }];
  const stepGroups = isGrouped(def.steps)
    ? def.steps
    : [{ component: null as string | null, steps: def.steps as StepDef[] }];

  let ip = 0;
  const ingredients: RecipeIngredient[] = ingredientGroups.flatMap((g) =>
    g.items.map((i) => ({
      position: ++ip,
      component: g.component,
      quantity: i.qty,
      unit: i.unit,
      item: i.item,
      preparation: i.prep ?? null,
      optional: Boolean(i.optional),
    })),
  );

  let sp = 0;
  const steps: RecipeStep[] = stepGroups.flatMap((g) =>
    g.steps.map((s) => ({
      position: ++sp,
      component: g.component,
      body: s.body,
      timerSeconds: s.minutes ? Math.round(s.minutes * 60) : null,
      temperatureC: s.tempF !== undefined ? fToC(s.tempF) : null,
      safeInternalTempC: s.safeF !== undefined ? fToC(s.safeF) : null,
    })),
  );

  return {
    id: def.id,
    slug: def.slug,
    title: def.title,
    description: def.description,
    cuisine: def.cuisine,
    skillLevel: def.skillLevel,
    prepMinutes: def.prepMinutes,
    cookMinutes: def.cookMinutes,
    totalMinutes: def.prepMinutes + def.cookMinutes,
    servings: def.servings,
    requiredEquipment: def.equipment,
    tags: def.tags ?? [],
    tips: def.tips ?? [],
    image: TEST_KITCHEN_PHOTOS[def.slug] ?? null,
    source: TEST_KITCHEN_SOURCE,
    ingredients,
    steps,
  };
}
