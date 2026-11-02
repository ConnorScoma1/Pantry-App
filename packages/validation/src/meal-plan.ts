import { planningModes } from "@kitchen-pantry/shared-types";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const dayMs = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const planningModeSchema = z.enum(planningModes.map((m) => m.code) as [string, ...string[]]);

export const plannedMealInputSchema = z
  .object({
    id: z.uuid().optional(),
    date: isoDate,
    mealType: z.enum(["dinner", "dessert"]).default("dinner"),
    recipeId: z.uuid().nullable().default(null),
    customTitle: z.string().trim().max(80).nullable().default(null),
    servings: z.number().int().min(1).max(24),
    locked: z.boolean().default(false),
    note: z.string().trim().max(300).nullable().default(null),
  })
  .refine((m) => Boolean(m.recipeId) !== Boolean(m.customTitle), {
    message: "A meal needs either a recipe or a name",
    path: ["customTitle"],
  });

/** A whole week as the client sends it. One dinner per day. */
export const mealPlanInputSchema = z
  .object({
    weekStart: isoDate.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, "Weeks start on Monday"),
    mode: planningModeSchema.default("balanced"),
    generatedBy: z.enum(["ai", "rules", "manual"]).default("manual"),
    summary: z.string().trim().max(600).nullable().default(null),
    confirmedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    meals: z.array(plannedMealInputSchema).max(14),
  })
  .superRefine((p, ctx) => {
    const start = utc(p.weekStart);
    const seen = new Set<string>();
    p.meals.forEach((m, i) => {
      const offset = (utc(m.date) - start) / dayMs;
      if (!(offset >= 0 && offset <= 6)) ctx.addIssue({ code: "custom", path: ["meals", i, "date"], message: "Date is outside this week" });
      const key = `${m.mealType}:${m.date}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["meals", i, "date"], message: m.mealType === "dessert" ? "Only one dessert per day" : "Only one dinner per day" });
      }
      seen.add(key);
    });
    const recipes = p.meals.map((m) => m.recipeId).filter(Boolean);
    if (new Set(recipes).size !== recipes.length) {
      ctx.addIssue({ code: "custom", path: ["meals"], message: "A recipe can only appear once a week" });
    }
  });

export type MealPlanInput = z.infer<typeof mealPlanInputSchema>;
export type PlannedMealInput = z.infer<typeof plannedMealInputSchema>;

/** What the AI planner endpoint accepts from a client. */
export const generatePlanRequestSchema = z.object({
  weekStart: isoDate,
  days: z.array(isoDate).max(7),
  mode: planningModeSchema,
  seed: z.number().int().min(0).max(2 ** 31).default(1),
  avoid: z.array(z.uuid()).max(30).default([]),
  fixed: z.array(z.object({ date: isoDate, recipeId: z.uuid().nullable() })).max(7).default([]),
  /** Cook the Specials: the store's sale prices (validated in full by the server with grocery-pricing's specialSchema). */
  specials: z.array(z.unknown()).max(300).default([]),
  specialsSource: z.object({ storeName: z.string().trim().min(1).max(160), checkedAt: z.string().max(40) }).nullable().default(null),
});
export type GeneratePlanRequest = z.infer<typeof generatePlanRequestSchema>;
