import { z } from "zod";
import { pantryCategorySchema, storageLocationSchema, type PantryItemInput } from "./pantry";

/** A receipt read by the server (AI), as the browser or phone receives it. Checked again on the device. */
export const receiptDraftSchema = z.object({
  readable: z.boolean(),
  store: z.string().max(80).nullable(),
  date: z.iso.date().nullable(),
  lines: z
    .array(
      z.object({
        text: z.string().max(120),
        name: z.string().min(1).max(120),
        quantity: z.number().positive().nullable(),
        unit: z.string().max(20).nullable(),
        priceCents: z.number().int().min(0).max(100_000).nullable(),
        isFood: z.boolean(),
        category: z.string().max(40),
        storageLocation: z.string().max(40),
      }),
    )
    .max(80),
});
export type ReceiptDraftData = z.infer<typeof receiptDraftSchema>;

/** Where a new kitchen item came from (pantry_items.source / barcode). */
export const pantryOriginSchema = z
  .object({
    source: z.enum(["manual", "barcode", "receipt"]),
    barcode: z.string().regex(/^\d{8,14}$/).nullable().default(null),
  })
  .strict()
  .refine((o) => o.source === "barcode" || o.barcode === null, { message: "Only barcode items carry a barcode." });
export type PantryOrigin = z.input<typeof pantryOriginSchema>;

/** One reviewed receipt line → a kitchen item (bought on the receipt's date, at the price printed). */
export function receiptLineToInput(line: ReceiptDraftData["lines"][number], purchasedOn: string | null): PantryItemInput {
  const category = pantryCategorySchema.safeParse(line.category);
  const storage = storageLocationSchema.safeParse(line.storageLocation);
  return {
    ingredientId: null,
    name: line.name.trim().slice(0, 120),
    category: category.success ? category.data : "other",
    quantity: line.quantity,
    unit: line.quantity === null ? null : (line.unit ?? "each"),
    storageLocation: storage.success ? storage.data : "pantry",
    purchasedOn,
    useBy: null,
    openedOn: null,
    estimatedRemainingPct: null,
    pricePaidCents: line.priceCents,
    isStaple: false,
  };
}
