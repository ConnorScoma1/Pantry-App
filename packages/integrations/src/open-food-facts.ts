import { parseSize } from "@kitchen-pantry/grocery-pricing";
import { guessCategory } from "@kitchen-pantry/inventory-engine";
import type { PantryCategory, Quantity, StorageLocation } from "@kitchen-pantry/shared-types";
import { z } from "zod";

/**
 * Barcode lookups (spec 01 §5: "barcode scanning can be added later").
 *
 * Source: Open Food Facts — a free, open product database (data under the
 * Open Database Licence; anyone may reuse it with attribution). Reads need
 * no key, only an identifying User-Agent, and are limited to 15 product
 * reads a minute per IP, so the server caches answers and rations calls.
 * Only the product name, brand, package size and categories are read —
 * never images. The data is volunteer-entered: the app shows it as a
 * starting point the household can edit before saving.
 */

/** Valid GTIN-8 / UPC-A (12) / EAN-13 / GTIN-14 with a correct check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Weights 3,1,3,1… from the right (excluding the check digit).
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i]! * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-E (8 digits: number system 0/1, six digits, check) → the 12-digit UPC-A it stands for. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0]!;
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7).split("");
  const check = code[7]!;
  let body: string;
  if (d6 === "0" || d6 === "1" || d6 === "2") body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const upcA = `${ns}${body}${check}`;
  return isValidGtin(upcA) ? upcA : null;
}

/**
 * Digits only, as a 13-digit EAN when possible (UPC-A gets a leading 0;
 * UPC-E is expanded first). `format` is what the camera says it read; an
 * 8-digit code that isn't a valid EAN-8 is tried as UPC-E. Null when it
 * isn't a valid product barcode.
 */
export function normalizeBarcode(raw: string, format?: string | null): string | null {
  const code = String(raw ?? "").replace(/\D/g, "");
  const upcE = code.length === 8 && (format === "upc_e" || !isValidGtin(code)) ? expandUpcE(code) : null;
  if (upcE) return `0${upcE}`;
  if (!isValidGtin(code)) return null;
  return code.length === 12 ? `0${code}` : code;
}

export interface ScannedProduct {
  barcode: string;
  name: string;
  brand: string | null;
  /** Package size when the source states one we can read ("500 g", "12 fl oz"). */
  quantity: Quantity | null;
  sizeLabel: string | null;
  category: PantryCategory;
  storageLocation: StorageLocation;
  source: "open_food_facts";
}

/** Read loosely: oversized or odd fields are trimmed or ignored one by one, never the whole product. */
const text = (max: number) => z.unknown().transform((v) => (typeof v === "string" ? v.slice(0, max) : undefined));
const productSchema = z.object({
  status: z.number(),
  product: z
    .object({
      product_name: text(600),
      product_name_en: text(600),
      generic_name: text(600),
      brands: text(600),
      quantity: text(120),
      categories_tags: z.unknown().transform((v) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string").slice(0, 200).map((t) => t.slice(0, 120)) : [])),
    })
    .optional(),
});

export type ProductLookupErrorKind = "not_found" | "rate_limited" | "unavailable" | "bad_request";
export class ProductLookupError extends Error {
  constructor(
    message: string,
    readonly kind: ProductLookupErrorKind,
  ) {
    super(message);
    this.name = "ProductLookupError";
  }
}

/** Plain text only: no markup, no control characters, tidy spacing. */
const clean = (s: string | undefined, max: number) =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    // Control and invisible formatting characters (incl. right-to-left overrides).
    .replace(/[\u0000-\u001f\u007f-\u009f<>]|\p{Cf}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Shopping-list friendly name: "Barilla Spaghetti" → keeps the product name, drops a repeated brand. */
function productName(p: NonNullable<z.infer<typeof productSchema>["product"]>): string {
  return clean(p.product_name_en || p.product_name || p.generic_name, 120);
}

const CATEGORY_TAGS: Array<[RegExp, PantryCategory, StorageLocation]> = [
  [/frozen/, "frozen", "freezer"],
  [/(milks|cheeses|yogurts|butters|creams|dairies|eggs)\b/, "dairy", "fridge"],
  [/(meats|poultries|fishes|seafood)/, "protein", "fridge"],
  [/(fresh-vegetables|fresh-fruits)/, "produce", "counter"],
  [/canned/, "canned", "pantry"],
  [/(pastas|noodles)/, "pasta", "pantry"],
  [/rices\b/, "rice", "pantry"],
  [/(spices|herbs)/, "spice", "pantry"],
  [/(oils|vinegars)/, "oil", "pantry"],
  [/sauces/, "sauce", "pantry"],
  [/condiments/, "condiment", "pantry"],
  [/(flours|sugars|baking)/, "baking", "pantry"],
  [/(cereals|breads|grains)/, "grain", "pantry"],
];

/**
 * The product, null when Open Food Facts says it doesn't know the barcode,
 * or throws when the answer can't be read at all (so it isn't remembered as "not found").
 */
export function toScannedProduct(barcode: string, raw: unknown): ScannedProduct | null {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) throw new ProductLookupError("Unexpected answer from the product database.", "unavailable");
  if (parsed.data.status !== 1 || !parsed.data.product) return null;
  const p = parsed.data.product;
  const name = productName(p);
  if (!name) return null;
  const brand = clean(p.brands?.split(",")[0], 80) || null;
  const sizeLabel = clean(p.quantity, 40) || null;
  const guess = guessCategory(name);
  const tags = (p.categories_tags ?? []).join(" ");
  const fromTags = CATEGORY_TAGS.find(([re]) => re.test(tags));
  return {
    barcode,
    name,
    brand,
    quantity: parseSize(sizeLabel),
    sizeLabel,
    category: guess?.category ?? fromTags?.[1] ?? "other",
    storageLocation: guess?.storageLocation ?? fromTags?.[2] ?? "pantry",
    source: "open_food_facts",
  };
}

export interface OpenFoodFactsConfig {
  /** "AppName/Version (contact email)", as Open Food Facts asks. */
  userAgent: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class OpenFoodFactsClient {
  private readonly base: string;
  private readonly http: typeof fetch;
  constructor(private readonly config: OpenFoodFactsConfig) {
    // They ask for the app name, version and a way to reach you (an email or a URL).
    if (!/^\S+\/\S+ \((?=[^)]*(@|https?:\/\/))[^)]+\)$/.test(config.userAgent)) throw new Error("Open Food Facts needs a User-Agent like 'KitchenPantry/0.1 (you@example.com)'.");
    this.base = (config.baseUrl ?? "https://world.openfoodfacts.org").replace(/\/$/, "");
    this.http = config.fetch ?? fetch;
  }

  /** The product for a barcode, or null when Open Food Facts doesn't know it. */
  async lookup(rawCode: string): Promise<ScannedProduct | null> {
    const code = normalizeBarcode(rawCode);
    if (!code) throw new ProductLookupError("That doesn't look like a product barcode.", "bad_request");
    const url = `${this.base}/api/v2/product/${code}?fields=product_name,product_name_en,generic_name,brands,quantity,categories_tags`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
    let res: Response;
    try {
      res = await this.http(url, { signal: controller.signal, headers: { "User-Agent": this.config.userAgent, Accept: "application/json" } });
    } catch {
      throw new ProductLookupError("The product database didn't respond.", "unavailable");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) return null;
    if (res.status === 429 || res.status === 503) throw new ProductLookupError("The product database is busy. Try again in a minute.", "rate_limited");
    if (!res.ok) throw new ProductLookupError("The product database isn't available right now.", "unavailable");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProductLookupError("Unexpected answer from the product database.", "unavailable");
    }
    return toScannedProduct(code, body);
  }
}

const UNIT_LABEL: Record<string, string> = { fl_oz: "fl oz", gallon: "gal", quart: "qt", pint: "pt", dozen: "dozen" };

/** Starting values for the "Add to your kitchen" form (the household can change anything). */
export function scannedToPrefill(p: ScannedProduct): { name: string; category: PantryCategory; storageLocation: StorageLocation; quantity: number | null; unit: string | null } {
  const q = p.quantity && p.quantity.value > 0 && p.quantity.value <= 100_000 ? p.quantity : null;
  return { name: p.name, category: p.category, storageLocation: p.storageLocation, quantity: q ? q.value : null, unit: q ? (UNIT_LABEL[q.unit] ?? q.unit) : null };
}
