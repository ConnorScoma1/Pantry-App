import {
  allergens,
  authenticityLevels,
  cookingMethods,
  cuisineRegions,
  equipment,
  flavorProfiles,
  menuCourses,
  recipeCategories,
  recipeCourses,
  recipeVariants,
  worldCuisines,
} from "@kitchen-pantry/shared-types";
import { z } from "zod";

/**
 * Library search and saved menus, validated before they reach the database
 * (spec 08 §9–10). Lists are bounded so a request can't build a huge query.
 */
const code = <T extends { code: string }>(list: readonly T[]) => z.enum(list.map((x) => x.code) as [string, ...string[]]);
const list = <S extends z.ZodType>(s: S, max = 20) => z.array(s).max(max).optional();

export const libraryQuerySchema = z
  .object({
    text: z.string().trim().max(200).optional(),
    cuisines: list(code(worldCuisines), 40),
    regions: list(code(cuisineRegions), 7),
    categories: list(code(recipeCategories)),
    proteins: list(z.enum(["chicken", "beef", "pork", "turkey", "lamb", "fish", "shellfish", "eggs", "tofu", "beans"])),
    methods: list(code(cookingMethods)),
    flavors: list(code(flavorProfiles)),
    courses: list(code(recipeCourses)),
    minSkill: z.number().int().min(1).max(5).optional(),
    maxSkill: z.number().int().min(1).max(5).optional(),
    maxMinutes: z.number().int().min(5).max(2880).optional(),
    diet: list(z.enum(["vegetarian", "vegan", "pescatarian", "gluten_free", "dairy_free"]), 5),
    excludeAllergens: list(code(allergens), 10),
    equipment: list(code(equipment), 20),
    needsEquipment: list(code(equipment), 5),
    authenticity: list(code(authenticityLevels), 4),
    variants: list(code(recipeVariants), 4),
    occasions: list(z.string().regex(/^[a-z0-9-]{2,40}$/), 10),
    ingredients: list(z.string().trim().min(2).max(60), 5),
    statuses: list(z.enum(["tested", "reviewed", "pending_review", "idea"]), 4),
    excludeIds: list(z.uuid(), 200),
    sort: z.enum(["relevance", "quickest", "rotate"]).optional(),
    seed: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(400).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type LibraryQueryInput = z.infer<typeof libraryQuerySchema>;

export const savedMenuSchema = z.object({
  id: z.uuid().optional(),
  templateCode: z.string().regex(/^[a-z0-9:_-]{1,60}$/),
  title: z.string().trim().min(1).max(120),
  guests: z.number().int().min(1).max(50),
  budgetCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
  serveOn: z.iso.date().nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
  courses: z
    .array(z.object({ course: code(menuCourses), label: z.string().trim().min(1).max(80), recipeId: z.uuid().nullable() }))
    .min(1)
    .max(12),
});
export type SavedMenuInput = z.input<typeof savedMenuSchema>;
