import { groceryDepartments } from "@kitchen-pantry/shared-types";
import { z } from "zod";

export const groceryDepartmentSchema = z.enum(groceryDepartments.map((d) => d.code) as [string, ...string[]]);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null));

/** Something a person types onto the shared list. */
export const groceryItemInputSchema = z.object({
  name: z.string().trim().min(1, "What do you need?").max(120, "Use 120 characters or fewer"),
  department: groceryDepartmentSchema.default("other"),
  amount: optionalText(60, "Use 60 characters or fewer"),
  note: optionalText(200, "Use 200 characters or fewer"),
});
export type GroceryItemInput = z.input<typeof groceryItemInputSchema>;

export const groceryItemPatchSchema = groceryItemInputSchema.partial();

/** One line generated from the meal plan (see buildGroceryList). */
export const planGroceryLineSchema = z.object({
  key: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  department: groceryDepartmentSchema,
  amount: z.string().max(60).nullable(),
  note: z.string().max(200).nullable(),
  neededFor: z.array(z.string().max(160)).max(14),
  quantity: z.object({ value: z.number().positive().max(100_000), unit: z.string().min(1).max(20) }).nullable().default(null),
});
export const planGroceryLinesSchema = z.array(planGroceryLineSchema).max(200);
export type PlanGroceryLine = z.infer<typeof planGroceryLineSchema>;

export const pricingStoreSchema = z.object({
  provider: z.literal("kroger"),
  storeId: z.string().regex(/^[0-9A-Za-z]{4,20}$/, "That store id isn't valid."),
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(240).nullable(),
  setAt: z.string().nullable().default(null),
});
