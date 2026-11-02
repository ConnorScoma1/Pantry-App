import "server-only";
import { AiRequestError, checkReceiptImage, readAiConfig, readReceipt } from "@kitchen-pantry/ai";
import type { Result, SupabaseLike } from "@kitchen-pantry/database";
import { normalizeBarcode, OpenFoodFactsClient, ProductLookupError, type ScannedProduct } from "@kitchen-pantry/integrations";
import type { ReceiptDraftData } from "@kitchen-pantry/validation";
import { createPreviewAllowance, finishAiRequest, previewAiAllowed, reserveAiRequest } from "@/lib/ai-usage";

/**
 * Barcode lookups and receipt reading for My Kitchen (spec 01 §5).
 *
 * Barcodes: Open Food Facts allows 15 product reads a minute per server, so
 * answers are cached for a week (found and not-found), the whole server
 * makes at most 12 lookups a minute, and each person at most 30 an hour.
 *
 * Receipts: the photo goes to Claude once and is never stored. Each
 * household has a daily limit (AI_DAILY_RECEIPT_LIMIT), reserved before
 * the call like the other AI features.
 */

// Open Food Facts asks every app to identify itself with a contact: set OPEN_FOOD_FACTS_USER_AGENT
// to "KitchenPantry/0.1 (you@your-domain.example)". Without it, lookups are off (adding by barcode
// still works — the household types the name).
const userAgent = process.env.OPEN_FOOD_FACTS_USER_AGENT ?? "";
let client: OpenFoodFactsClient | null | undefined;
function off(): OpenFoodFactsClient | null {
  if (client !== undefined) return client;
  try {
    client = new OpenFoodFactsClient({ userAgent });
  } catch {
    if (userAgent) console.error("[barcode] OPEN_FOOD_FACTS_USER_AGENT needs a contact, e.g. 'KitchenPantry/0.1 (you@example.com)'");
    client = null;
  }
  return client;
}

/** After Open Food Facts says "slow down", nobody on this server asks again for a while. */
let pausedUntil = 0;

const WEEK = 7 * 24 * 3_600_000;
const cache = new Map<string, { at: number; product: ScannedProduct | null }>();
const serverCalls: number[] = [];
const personCalls = new Map<string, number[]>();

function allowLookup(who: string, now = Date.now()): "ok" | "person" | "server" {
  if (now < pausedUntil) return "server";
  if (personCalls.size > 10_000) for (const [k, v] of personCalls) if (!v.some((t) => now - t < 3_600_000)) personCalls.delete(k);
  const mine = (personCalls.get(who) ?? []).filter((t) => now - t < 3_600_000);
  if (mine.length >= 30) {
    personCalls.set(who, mine);
    return "person";
  }
  while (serverCalls.length && now - serverCalls[0]! > 60_000) serverCalls.shift();
  if (serverCalls.length >= 12) return "server";
  mine.push(now);
  personCalls.set(who, mine);
  serverCalls.push(now);
  return "ok";
}

export interface BarcodeLookup {
  product: ScannedProduct | null;
  /** False when lookups aren't set up on this server (the item can still be added by name). */
  available: boolean;
}

export async function lookupBarcode(raw: unknown, who: string, format?: unknown): Promise<Result<BarcodeLookup>> {
  const code = normalizeBarcode(String(raw ?? "").slice(0, 32), typeof format === "string" ? format : null);
  if (!code) return { ok: false, message: "That doesn't look like a product barcode. Check the numbers under the bars." };
  const c = off();
  if (!c) return { ok: true, data: { product: null, available: false } };
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < WEEK) return { ok: true, data: { product: hit.product, available: true } };
  const allowed = allowLookup(who);
  if (allowed === "person") return { ok: false, message: "That's a lot of scans this hour. Add items by name for now, or try again later." };
  if (allowed === "server") return { ok: false, message: "The product database is busy. Try again in a minute, or add it by name." };
  try {
    const product = await c.lookup(code);
    if (cache.size > 20_000) cache.delete(cache.keys().next().value!);
    cache.set(code, { at: Date.now(), product });
    return { ok: true, data: { product, available: true } };
  } catch (error) {
    if (error instanceof ProductLookupError) {
      if (error.kind === "rate_limited") pausedUntil = Date.now() + 60_000;
      return { ok: false, message: error.message };
    }
    console.error("[barcode] lookup failed");
    return { ok: false, message: "Couldn't look that barcode up. Add it by name instead." };
  }
}

const preview = createPreviewAllowance();
const FEATURE = "receipt_import";

/** Local calendar date on the server (UTC is close enough for "not in the future"). */
const todayIso = () => new Date().toISOString().slice(0, 10);

export async function readReceiptPhoto(raw: unknown, db: SupabaseLike | null): Promise<Result<ReceiptDraftData>> {
  const checked = checkReceiptImage(raw);
  if (!checked.ok) return { ok: false, message: checked.message };
  const config = readAiConfig();
  const limit = config?.dailyReceiptLimit ?? 5;
  if (!config || limit <= 0) return { ok: false, message: "Reading receipts needs the AI assistant, which isn't switched on for this server (no Anthropic API key)." };
  if (!db && !previewAiAllowed()) return { ok: false, message: "Reading receipts needs accounts on this server." };

  let slot: string | null = null;
  let giveBack: (() => void) | null = null;
  if (db) slot = await reserveAiRequest(db, FEATURE, limit);
  else giveBack = preview.reserve(limit);
  if (!slot && !giveBack) return { ok: false, message: "You've read today's receipts. Add items by hand, or try again tomorrow." };

  try {
    const r = await readReceipt({ config, image: checked.image, today: todayIso() });
    if (slot && db) await finishAiRequest(db, slot, "ok", r.model, r.usage);
    const { usage: _u, model: _m, ...draft } = r;
    return { ok: true, data: draft };
  } catch (error) {
    if (slot && db) await finishAiRequest(db, slot, "fallback", config.model, null);
    if (error instanceof AiRequestError && error.kind === "invalid") return { ok: false, message: "That photo couldn't be read as a grocery receipt. Try a sharper, flatter photo in good light." };
    if (error instanceof AiRequestError && (error.kind === "rate_limited" || error.kind === "overloaded")) return { ok: false, message: "The assistant is busy. Try again in a minute." };
    return { ok: false, message: "Couldn't read that receipt just now. Please try again." };
  }
}
