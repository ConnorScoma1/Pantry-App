import { z } from "zod";
import { planningModeSchema } from "./meal-plan";

/** A real IANA time zone name, as the browser/phone reports it. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Weekly drafts settings as saved (the database checks the time zone again). */
export const weeklyPlanningInputSchema = z.object({
  enabled: z.boolean(),
  runDay: z.number().int().min(1).max(7),
  runHour: z.number().int().min(0).max(23),
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isTimeZone, "Choose a time zone from the list."),
  mode: planningModeSchema,
});
export type WeeklyPlanningInput = z.infer<typeof weeklyPlanningInputSchema>;

export const notificationPreferencesSchema = z.object({
  planReadyInApp: z.boolean(),
  planReadyPush: z.boolean(),
});

/** Expo push addresses only; anything else is refused. */
export const pushTokenSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/),
  platform: z.enum(["ios", "android"]),
});

/** A logged shop. Amount in cents; dates are local calendar days. */
export const spendingInputSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  amountCents: z.number({ error: "Enter the amount you spent." }).int().min(1, "Enter the amount you spent.").max(10_000_000, "That amount looks too large."),
  storeName: z.string().trim().max(120).nullable().default(null),
  note: z.string().trim().max(200).nullable().default(null),
  cartDraftId: z.uuid().nullable().default(null),
});
export type SpendingInput = z.input<typeof spendingInputSchema>;
