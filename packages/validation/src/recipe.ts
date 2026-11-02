import { dessertCategories, equipment, recipeCourses, worldCuisines } from "@kitchen-pantry/shared-types";
import { z } from "zod";

/**
 * A complete recipe. Every recipe — catalogue, user-submitted or (later)
 * AI-generated — must pass this before it is stored or shown.
 */
const cuisineSchema = z.enum(worldCuisines.map((c) => c.code) as [string, ...string[]]);
const equipmentSchema = z.enum(equipment.map((e) => e.code) as [string, ...string[]]);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens");

export const recipeIngredientSchema = z.object({
  position: z.number().int().positive(),
  component: z.string().min(1).max(60).nullable(),
  quantity: z.number().positive().max(10_000).nullable(),
  unit: z.string().min(1).max(20).nullable(),
  item: z.string().trim().min(2).max(120),
  preparation: z.string().max(160).nullable(),
  optional: z.boolean(),
});

export const recipeStepSchema = z.object({
  position: z.number().int().positive(),
  component: z.string().min(1).max(60).nullable(),
  body: z.string().trim().min(10).max(1200),
  timerSeconds: z.number().int().positive().max(48 * 3600).nullable(),
  temperatureC: z.number().min(-30).max(320).nullable(),
  safeInternalTempC: z.number().min(40).max(100).nullable(),
});

/** Hosts whose licences we've checked. Anything else is rejected. */
export const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com", "images.pexels.com", "upload.wikimedia.org"] as const;

const allowedImageUrl = z.url().refine(
  (u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" && (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(url.hostname);
    } catch {
      return false;
    }
  },
  { message: "Images must be https and come from an approved, licensed source" },
);

export const recipeImageSchema = z.object({
  url: allowedImageUrl,
  alt: z.string().trim().min(5).max(200),
  license: z.enum(["unsplash", "pexels", "cc0", "cc-by", "cc-by-sa", "owned"]),
  creditName: z.string().trim().min(1).max(120),
  creditUrl: z.url().nullable(),
  sourceUrl: z.url(),
  representative: z.boolean(),
});

export const recipeSchema = z
  .object({
    id: z.uuid(),
    slug,
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(600),
    cuisine: cuisineSchema.nullable(),
    skillLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    prepMinutes: z.number().int().min(0).max(1440),
    cookMinutes: z.number().int().min(0).max(2880),
    totalMinutes: z.number().int().min(1).max(4320),
    servings: z.number().int().min(1).max(50),
    course: z.enum(recipeCourses.map((c) => c.code) as [string, ...string[]]),
    dessertCategory: z.enum(dessertCategories.map((c) => c.code) as [string, ...string[]]).nullable(),
    chillMinutes: z.number().int().min(0).max(2880),
    requiredEquipment: z.array(equipmentSchema).min(1),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(20),
    tips: z.array(z.string().min(5).max(400)).max(12),
    image: recipeImageSchema.nullable(),
    source: z.object({
      kind: z.enum(["licensed_api", "partner", "user_submitted", "original", "editorial", "ai_generated"]),
      name: z.string().min(2).max(120),
      url: z.url().nullable(),
    }),
    ingredients: z.array(recipeIngredientSchema).min(1).max(60),
    steps: z.array(recipeStepSchema).min(1).max(40),
  })
  .superRefine((r, ctx) => {
    if (r.totalMinutes !== r.prepMinutes + r.cookMinutes + r.chillMinutes) {
      ctx.addIssue({ code: "custom", path: ["totalMinutes"], message: "Total time must equal prep + cook + chill" });
    }
    if ((r.course === "dessert") !== (r.dessertCategory !== null)) {
      ctx.addIssue({ code: "custom", path: ["dessertCategory"], message: "Desserts (and only desserts) need a dessert category" });
    }
    const unique = (xs: number[]) => new Set(xs).size === xs.length;
    if (!unique(r.ingredients.map((i) => i.position))) {
      ctx.addIssue({ code: "custom", path: ["ingredients"], message: "Ingredient positions must be unique" });
    }
    if (!unique(r.steps.map((s) => s.position))) {
      ctx.addIssue({ code: "custom", path: ["steps"], message: "Step positions must be unique" });
    }
  });

/** What a household submits after cooking a recipe. */
export const recipeRatingInputSchema = z.object({
  recipeId: z.uuid(),
  overall: z.number().int().min(1, "Pick 1 to 5 stars").max(5),
  flavor: z.number().int().min(1).max(5).nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
  wouldCookAgain: z.boolean().nullable(),
  actualMinutes: z.number().int().min(1).max(1440).nullable(),
  familyApproval: z.number().int().min(1).max(5).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});
export type RecipeRatingInput = z.output<typeof recipeRatingInputSchema>;

export const recommendationEventInputSchema = z.object({
  recipeId: z.uuid(),
  event: z.enum(["shown", "opened", "cooked", "dismissed", "undismissed"]),
  surface: z.enum(["home", "recipes", "detail", "plan", "surprise"]),
});
export type RecommendationEventInput = z.infer<typeof recommendationEventInputSchema>;
