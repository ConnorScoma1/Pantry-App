import {
  allergens,
  budgetIncludes,
  budgetPeriods,
  budgetPriorities,
  cookingGoals,
  countries,
  cuisines,
  dietaryRestrictions,
  dietStyles,
  equipment,
  mealTypes,
  proteins,
  type OnboardingProfile,
} from "@kitchen-pantry/shared-types";
import { z } from "zod";

/** Build a z.enum from a catalog's `code` field. */
function codes<T extends readonly { code: string }[]>(catalog: T) {
  return z.enum(catalog.map((c) => c.code) as [T[number]["code"], ...T[number]["code"][]]);
}

export const countrySchema = codes(countries);
export const mealTypeSchema = codes(mealTypes);
export const allergenSchema = codes(allergens);
export const cuisineSchema = codes(cuisines);
export const proteinSchema = codes(proteins);
export const equipmentSchema = codes(equipment);
export const cookingGoalSchema = codes(cookingGoals);

const POSTAL_PATTERNS: Record<string, RegExp> = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/,
  AU: /^\d{4}$/,
};

export function isValidPostalCode(country: string, postalCode: string): boolean {
  const value = postalCode.trim();
  const pattern = POSTAL_PATTERNS[country];
  if (pattern) return pattern.test(value);
  return value.length >= 2 && value.length <= 12;
}

/** Short free-text tags (dislikes, "never recommend"). Trimmed, de-duplicated. */
const tagList = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const people = z.number().int().min(0).max(20);

export const householdStepSchema = z
  .object({
    country: countrySchema,
    postalCode: z.string().trim().min(1, "Enter your ZIP or postal code"),
    adults: people.min(1, "At least one adult"),
    children: people,
    cookingFor: z.number().int().min(1, "Cook for at least one person").max(30),
    dinnersPerWeek: z.number().int().min(0).max(7),
    mealsIncluded: z.array(mealTypeSchema).min(1, "Pick at least one meal"),
    servingsByMeal: z.partialRecord(mealTypeSchema, z.number().int().min(1).max(30)),
  })
  .superRefine((value, ctx) => {
    if (!isValidPostalCode(value.country, value.postalCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: value.country === "US" ? "Enter a 5-digit ZIP code" : "Enter a valid postal code",
      });
    }
    if (value.mealsIncluded.includes("dinner") && value.dinnersPerWeek === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dinnersPerWeek"],
        message: "Choose how many dinners, or untick dinner",
      });
    }
  });

export const budgetStepSchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(500, "Budgets start at $5")
    .max(500_000, "That's more than we can plan for")
    .nullable(),
  period: codes(budgetPeriods),
  includes: z.array(codes(budgetIncludes)),
  priority: codes(budgetPriorities),
});

export const goalsStepSchema = z.object({
  ranked: z
    .array(cookingGoalSchema)
    .min(1, "Pick at least one goal")
    .refine((goals) => new Set(goals).size === goals.length, "Each goal can appear once"),
});

export const dietStepSchema = z.object({
  allergies: z.array(allergenSchema),
  style: codes(dietStyles),
  restrictions: z.array(codes(dietaryRestrictions)),
  dislikes: tagList,
  neverRecommend: tagList,
  cuisines: z.array(cuisineSchema),
  proteins: z.array(proteinSchema),
  nutrition: z.object({
    caloriesPerDay: z.number().int().min(800).max(6000).nullable(),
    proteinGramsPerDay: z.number().int().min(10).max(400).nullable(),
  }),
});

export const skillStepSchema = z.object({
  skillLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const equipmentStepSchema = z.object({
  equipment: z.array(equipmentSchema).min(1, "Pick at least one way to cook"),
});

export const storeStepSchema = z.object({
  usualRetailer: z.string().trim().max(80).nullable(),
  storeLocationId: z.uuid().nullable(),
});

export const onboardingProfileSchema = z.object({
  household: householdStepSchema,
  budget: budgetStepSchema,
  goals: goalsStepSchema,
  diet: dietStepSchema,
  skillLevel: skillStepSchema.shape.skillLevel,
  equipment: equipmentStepSchema.shape.equipment,
  store: storeStepSchema,
});

export type OnboardingProfileInput = z.input<typeof onboardingProfileSchema>;

// Compile-time guarantee that the schema output matches the shared domain type.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
const _schemaMatchesDomain: Equals<z.output<typeof onboardingProfileSchema>, OnboardingProfile> = true;
void _schemaMatchesDomain;

/** Ordered onboarding steps — UIs on both platforms render in this order. */
export const onboardingSteps = [
  { id: "household", title: "Your household", schema: householdStepSchema },
  { id: "budget", title: "Grocery budget", schema: budgetStepSchema },
  { id: "goals", title: "Cooking goals", schema: goalsStepSchema },
  { id: "diet", title: "What you eat", schema: dietStepSchema },
  { id: "skill", title: "Cooking skill", schema: skillStepSchema },
  { id: "equipment", title: "Your kitchen", schema: equipmentStepSchema },
  { id: "store", title: "Where you shop", schema: storeStepSchema },
] as const;
export type OnboardingStepId = (typeof onboardingSteps)[number]["id"];

/** Sensible starting values for a fresh questionnaire. */
export function defaultOnboardingProfile(): OnboardingProfile {
  return {
    household: {
      country: "US",
      postalCode: "",
      adults: 2,
      children: 0,
      cookingFor: 2,
      dinnersPerWeek: 5,
      mealsIncluded: ["dinner"],
      servingsByMeal: {},
    },
    budget: {
      amountCents: 12_500,
      period: "week",
      includes: ["dinner"],
      priority: "balanced",
    },
    goals: { ranked: [] },
    diet: {
      allergies: [],
      style: "omnivore",
      restrictions: [],
      dislikes: [],
      neverRecommend: [],
      cuisines: [],
      proteins: [],
      nutrition: { caloriesPerDay: null, proteinGramsPerDay: null },
    },
    skillLevel: 2,
    equipment: ["stove", "oven", "microwave"],
    store: { usualRetailer: null, storeLocationId: null },
  };
}

/** Flatten zod issues into { "household.postalCode": "message" }. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
