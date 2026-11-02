import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AiRequestError, explainComparison, readAiConfig } from "@kitchen-pantry/ai";
import type { Result, SupabaseLike } from "@kitchen-pantry/database";
import type { KrogerStore } from "@kitchen-pantry/grocery-pricing";
import {
  buildAdviceFacts,
  compareRequestSchema,
  MapboxRoutingProvider,
  RoutingError,
  runComparison,
  SAMPLE_STORES,
  SampleRoutingProvider,
  SampleStoresPricingProvider,
  type AdviceFacts,
  type ComparisonResponse,
  type LatLng,
  type RoutingProvider,
  type ShoppingStore,
} from "@kitchen-pantry/shopping-optimizer";
import { createPreviewAllowance, finishAiRequest, previewAiAllowed, reserveAiRequest } from "@/lib/ai-usage";
import { allowPricingCall, livePricing, pricingStatus, verifyStore } from "@/lib/pricing/server";

/**
 * One Store vs. Best Deals on the server (spec 03). Prices come from Kroger
 * (server keys), drive times from Mapbox (server token) — both stay here.
 * The browser or phone sends item names and amounts, the stores to compare
 * and a starting point; it never sends a price or a distance.
 *
 * The AI advisor gets a signed copy of the facts this server calculated, so
 * a client can't hand it made-up numbers to "explain".
 */
const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN ?? "";
const adviceSecret = process.env.SHOPPING_ADVICE_SECRET || randomBytes(32).toString("hex");
const ADVICE_TTL_MS = 30 * 60_000;
const ADVICE_FEATURE = "shopping_advice";

export interface ShoppingStatus {
  livePrices: boolean;
  routing: "mapbox" | null;
  advisor: boolean;
}

export function shoppingStatus(): ShoppingStatus {
  const ai = readAiConfig();
  return {
    livePrices: pricingStatus().enabled,
    routing: mapboxToken ? "mapbox" : null,
    advisor: Boolean(ai && (ai.dailyAdviceLimit ?? 10) > 0),
  };
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bN\b/g, "n");

export function toShoppingStore(s: KrogerStore): ShoppingStore {
  return {
    key: `kroger:${s.locationId}`,
    provider: "kroger",
    storeId: s.locationId,
    retailer: s.chain ? titleCase(s.chain) : "Kroger",
    name: s.name,
    address: [s.address, s.city, s.region].filter(Boolean).join(", ") || null,
    location: s.latitude !== null && s.longitude !== null ? { lat: s.latitude, lng: s.longitude } : null,
    hours: s.hours ?? null,
    isSample: false,
  };
}

function routing(): RoutingProvider | null {
  if (!mapboxToken) return null;
  try {
    return new MapboxRoutingProvider({ accessToken: mapboxToken });
  } catch {
    return null;
  }
}

export type CompareResult = ComparisonResponse & { adviceToken: string | null; routingNote: string | null };

/** Compare the list across stores. One comparison counts once against the hourly price limit. */
export async function compareShopping(raw: unknown, who: string): Promise<Result<CompareResult>> {
  const parsed = compareRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nothing to compare." };
  const req = parsed.data;
  const names = new Map(req.items.map((i) => [i.id, i.name]));

  if (req.mode === "sample") {
    const r = await runComparison({
      pricing: new SampleStoresPricingProvider(),
      stores: SAMPLE_STORES,
      needs: req.items,
      settings: req.settings,
      routing: new SampleRoutingProvider(),
      start: { lat: 0, lng: 0 },
      baselineStoreKey: req.baselineStoreKey,
      departAt: req.departAt ? new Date(req.departAt) : null,
    });
    return { ok: true, data: { ...r, adviceToken: signFacts(who, buildAdviceFacts(r, names, req.settings)), routingNote: null } };
  }

  const live = livePricing();
  if (!live) return { ok: false, message: "Store prices aren't connected yet, so only the practice comparison is available. Add Kroger API keys on the server (see the README)." };
  const ids = [...new Set(req.storeIds)];
  if (ids.length === 0) return { ok: false, message: "Choose at least two stores to compare." };
  if (!allowPricingCall(`compare:${who}`)) return { ok: false, message: "Stores were compared a lot this hour. Try again a little later." };

  // Look every store up with Kroger — never trust a client's store details or coordinates.
  const stores: ShoppingStore[] = [];
  for (const id of ids) {
    const v = await verifyStore(id);
    if (v.ok) stores.push(toShoppingStore(v.data));
  }
  if (stores.length === 0) return { ok: false, message: "Those stores couldn't be found. Choose them again from the list." };

  const router = routing();
  let start: LatLng | null = null;
  let routingNote: string | null = null;
  if (router && req.start) {
    if (req.start.kind === "point") start = { lat: req.start.lat, lng: req.start.lng };
    else {
      try {
        start = await router.geocode(req.start.text);
        if (!start) routingNote = "That starting address couldn't be found, so drive times aren't included.";
      } catch (error) {
        routingNote = error instanceof RoutingError ? error.message : "Drive times couldn't be loaded.";
      }
    }
  } else if (!router) routingNote = "Drive times need a routing service on the server (MAPBOX_ACCESS_TOKEN), so fuel and travel time aren't included.";

  const r = await runComparison({
    pricing: live.provider,
    cache: live.cache,
    stores,
    needs: req.items,
    settings: req.settings,
    routing: start ? router : null,
    start,
    baselineStoreKey: req.baselineStoreKey,
    departAt: req.departAt ? new Date(req.departAt) : null,
  });
  if (r.stores.length === 0 && r.limitations.length && stores.length) {
    // Every store failed: say why instead of an empty comparison.
    const why = r.limitations.find((l) => !l.startsWith("Add") && !l.startsWith("Drive"));
    if (why) return { ok: false, message: why };
  }
  return { ok: true, data: { ...r, adviceToken: signFacts(who, buildAdviceFacts(r, names, req.settings)), routingNote: routingNote ?? r.travelError } };
}

// ---------------------------------------------------------------------------
// Signed facts for the advisor
// ---------------------------------------------------------------------------
function sign(body: string): string {
  return createHmac("sha256", adviceSecret).update(body).digest("base64url");
}

function signFacts(who: string, facts: AdviceFacts): string | null {
  const body = Buffer.from(JSON.stringify({ u: who, t: Date.now(), f: facts })).toString("base64url");
  if (body.length > 60_000) return null;
  return `${body}.${sign(body)}`;
}

export function readFacts(token: unknown, who: string, now = Date.now()): AdviceFacts | null {
  if (typeof token !== "string" || token.length > 70_000) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u: string; t: number; f: AdviceFacts };
    if (data.u !== who || typeof data.t !== "number" || now - data.t > ADVICE_TTL_MS || now < data.t - 60_000) return null;
    return data.f;
  } catch {
    return null;
  }
}

export interface ShoppingAdviceResult {
  source: "ai" | "app";
  summary: string;
  tips: string[];
  notice: string | null;
}

const preview = createPreviewAllowance();

/** Explain a comparison this server made. Without AI (or past the limit) the app's own sentence is returned. */
export async function adviseShopping(token: unknown, who: string, db: SupabaseLike | null): Promise<Result<ShoppingAdviceResult>> {
  const facts = readFacts(token, who);
  if (!facts) return { ok: false, message: "That comparison has expired. Compare the stores again." };
  const fallback = (notice: string | null): Result<ShoppingAdviceResult> => ({ ok: true, data: { source: "app", summary: facts.recommendation, tips: [], notice } });
  const config = readAiConfig();
  const limit = config?.dailyAdviceLimit ?? 10;
  if (!config || limit <= 0) return fallback("The AI advisor isn't switched on (no Anthropic API key on the server).");
  if (!db && !previewAiAllowed()) return fallback("The AI advisor needs accounts on this server.");

  let slot: string | null = null;
  let giveBack: (() => void) | null = null;
  if (db) slot = await reserveAiRequest(db, ADVICE_FEATURE, limit);
  else giveBack = preview.reserve(limit);
  if (!slot && !giveBack) return fallback("You've used today's AI explanations.");
  try {
    const a = await explainComparison({ config, facts });
    if (slot && db) await finishAiRequest(db, slot, "ok", a.model, a.usage);
    return { ok: true, data: { source: "ai", summary: a.summary, tips: a.tips, notice: null } };
  } catch (error) {
    if (slot && db) await finishAiRequest(db, slot, "fallback", config.model, null);
    return fallback(
      error instanceof AiRequestError && error.kind === "invalid"
        ? "The AI explanation used a number that isn't in your comparison, so it isn't shown."
        : "The AI advisor couldn't answer just now.",
    );
  }
}
