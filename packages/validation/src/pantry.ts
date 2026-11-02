import { pantryCategories, removalReasons, storageLocations, type PantryItem } from "@kitchen-pantry/shared-types";
import { z } from "zod";

const isoDate = z.iso.date("Use a valid date").nullable();

export const pantryCategorySchema = z.enum(
  pantryCategories.map((c) => c.code) as [
    (typeof pantryCategories)[number]["code"],
    ...(typeof pantryCategories)[number]["code"][],
  ],
);

export const storageLocationSchema = z.enum(
  storageLocations.map((c) => c.code) as [
    (typeof storageLocations)[number]["code"],
    ...(typeof storageLocations)[number]["code"][],
  ],
);

export const removalReasonSchema = z.enum(
  removalReasons.map((r) => r.code) as [
    (typeof removalReasons)[number]["code"],
    ...(typeof removalReasons)[number]["code"][],
  ],
);

/** What the add/edit form submits. Server and preview store both validate with this. */
export const pantryItemInputSchema = z
  .object({
    ingredientId: z.uuid().nullable(),
    name: z.string().trim().min(1, "Give it a name").max(120, "Keep the name under 120 characters"),
    category: pantryCategorySchema,
    quantity: z.number().positive("Use an amount above zero").max(100_000).nullable(),
    unit: z.string().trim().min(1).max(20).nullable(),
    storageLocation: storageLocationSchema,
    purchasedOn: isoDate,
    useBy: isoDate,
    openedOn: isoDate,
    estimatedRemainingPct: z.number().int().min(0).max(100).nullable(),
    pricePaidCents: z.number().int().min(0).max(1_000_000).nullable(),
    isStaple: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.quantity !== null && value.unit === null) {
      ctx.addIssue({ code: "custom", path: ["unit"], message: "Pick a unit" });
    }
    if (value.openedOn && value.purchasedOn && value.openedOn < value.purchasedOn) {
      ctx.addIssue({ code: "custom", path: ["openedOn"], message: "Opened before it was bought?" });
    }
  });

export type PantryItemInput = z.output<typeof pantryItemInputSchema>;

export const pantryItemIdSchema = z.uuid();

/** Blank form values for "Add an item". */
export function emptyPantryItemInput(): PantryItemInput {
  return {
    ingredientId: null,
    name: "",
    category: "other",
    quantity: null,
    unit: null,
    storageLocation: "fridge",
    purchasedOn: null,
    useBy: null,
    openedOn: null,
    estimatedRemainingPct: null,
    pricePaidCents: null,
    isStaple: false,
  };
}

/** An existing kitchen item as form values (to edit or adjust it). */
export function pantryItemToInput(item: PantryItem): PantryItemInput {
  return {
    ingredientId: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    storageLocation: item.storageLocation,
    purchasedOn: item.purchasedOn,
    useBy: item.useBy,
    openedOn: item.openedOn,
    estimatedRemainingPct: item.estimatedRemainingPct,
    pricePaidCents: item.pricePaidCents,
    isStaple: item.isStaple,
  };
}
