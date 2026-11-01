import "server-only";
import { createSupabaseCartRepository, sendCartDraft, type Result, type SendCartResult, type SupabaseLike } from "@kitchen-pantry/database";
import {
  KrogerAuthError,
  KrogerCartAdapter,
  krogerAuthorizeUrl,
  krogerExchangeCode,
  krogerRefresh,
  MockCartAdapter,
  type KrogerOAuthConfig,
  type KrogerTokens,
  type RetailerCartAdapter,
} from "@kitchen-pantry/grocery-pricing";
import { serviceRoleConfigured, serviceSupabase } from "@/lib/supabase/service";
import { pkce, seal, sealingConfigured, unseal } from "./crypto";

/**
 * Smart Cart on the server: which retailers can take a cart, Kroger sign-in
 * (authorization code + PKCE; tokens sealed with RETAILER_TOKEN_KEY before
 * they're stored), and the one-time send. The client secret and tokens never
 * leave the server.
 *
 * Live Kroger carts stay OFF until SMART_CART_KROGER=on is set after the
 * Kroger app has the Cart API and the redirect URI registered (README).
 * Sends to a real retailer and token storage use the service role
 * (SUPABASE_SERVICE_ROLE_KEY): the database lets only the server start and
 * finish those sends, and clients can't read the token table.
 */
const clientId = process.env.KROGER_CLIENT_ID ?? "";
const clientSecret = process.env.KROGER_CLIENT_SECRET ?? "";
const redirectUri = process.env.KROGER_REDIRECT_URI ?? "";

export function krogerCartEnabled(): boolean {
  return process.env.SMART_CART_KROGER === "on" && Boolean(clientId && clientSecret && redirectUri) && sealingConfigured() && serviceRoleConfigured();
}

function oauth(): KrogerOAuthConfig | null {
  return krogerCartEnabled() ? { clientId, clientSecret, redirectUri } : null;
}

export interface RetailerOption {
  id: string;
  name: string;
  mode: "direct_cart" | "shopping_link" | "export";
  sample: boolean;
  available: boolean;
  /** Why it isn't available, in plain words. */
  note: string | null;
  fulfillment: Array<"pickup" | "delivery">;
  /** The shopper must connect their account before sending. */
  needsSignIn: boolean;
}

/** Retailers for the picker — honest about what each can do. */
export function retailerOptions(): RetailerOption[] {
  return [
    {
      id: "kroger",
      name: "Kroger family (Kroger, Ralphs, Fred Meyer, King Soopers, Pick 'n Save…)",
      mode: "direct_cart",
      sample: false,
      available: krogerCartEnabled(),
      note: krogerCartEnabled() ? "Items go to the store selected on your Kroger account." : "Not switched on yet — needs Kroger Cart API access on the server (see the README).",
      fulfillment: ["pickup", "delivery"],
      needsSignIn: true,
    },
    { id: "mock", name: "Sample Market (practice — no real store)", mode: "direct_cart", sample: true, available: true, note: "Made-up products and prices to try the flow. Nothing is sent anywhere.", fulfillment: ["pickup", "delivery"], needsSignIn: false },
    { id: "walmart", name: "Walmart", mode: "shopping_link", sample: false, available: false, note: "Walmart has no public cart API. A shopping link needs Walmart affiliate API access — not set up.", fulfillment: [], needsSignIn: false },
    { id: "instacart", name: "Instacart", mode: "shopping_link", sample: false, available: false, note: "Instacart's developer platform isn't accepting new applications right now.", fulfillment: [], needsSignIn: false },
  ];
}

// ---------------------------------------------------------------------------
// Kroger sign-in
// ---------------------------------------------------------------------------
interface ConnectState {
  uid: string;
  v: string;
  app: "web" | "mobile";
  exp: number;
}

export function startKrogerConnect(uid: string, app: "web" | "mobile"): Result<{ url: string }> {
  const c = oauth();
  if (!c) return { ok: false, message: "Kroger carts aren't switched on yet." };
  const { verifier, challenge } = pkce();
  const state = seal({ uid, v: verifier, app, exp: Date.now() + 10 * 60_000 } satisfies ConnectState, STATE_CONTEXT);
  return { ok: true, data: { url: krogerAuthorizeUrl(c, { state, codeChallenge: challenge }) } };
}

const STATE_CONTEXT = "oauth-state:kroger";
const tokenContext = (uid: string) => `token:${uid}:kroger`;

export function readConnectState(state: string): ConnectState | null {
  if (state.length > 2000) return null;
  const s = unseal<ConnectState>(state, STATE_CONTEXT);
  return s && typeof s.uid === "string" && typeof s.v === "string" && s.exp > Date.now() ? s : null;
}

interface Row {
  token_ciphertext: string;
}

/** Sealed tokens, bound to this person and retailer; written with the service role only. */
async function storeTokens(uid: string, t: KrogerTokens): Promise<Result<null>> {
  const svc = serviceSupabase();
  if (!svc) return { ok: false, message: "Kroger carts aren't switched on yet." };
  const { error } = await svc
    .from("retailer_connections")
    .upsert({ user_id: uid, retailer: "kroger", token_ciphertext: seal(t, tokenContext(uid)), scope: t.scope, access_expires_at: t.accessExpiresAt }, { onConflict: "user_id,retailer" });
  if (error) {
    console.error("[cart] store tokens failed", { code: (error as { code?: string }).code });
    return { ok: false, message: "Couldn't save your Kroger connection. Please try again." };
  }
  return { ok: true, data: null };
}

/** After Kroger sends the shopper back: check the state belongs to this person, exchange the code, store sealed tokens. */
export async function finishKrogerConnect(uid: string, code: string, state: string): Promise<Result<null>> {
  const c = oauth();
  if (!c) return { ok: false, message: "Kroger carts aren't switched on yet." };
  const s = readConnectState(state);
  if (!s || s.uid !== uid) return { ok: false, message: "That Kroger sign-in link expired or belongs to someone else. Try connecting again." };
  if (!/^[\w.~-]{4,2048}$/.test(code)) return { ok: false, message: "Kroger sent back an unexpected sign-in code." };
  try {
    return await storeTokens(uid, await krogerExchangeCode(c, { code, codeVerifier: s.v }));
  } catch (error) {
    return { ok: false, message: error instanceof KrogerAuthError ? error.message : "Couldn't finish connecting to Kroger." };
  }
}

/** Asked as the person (RLS-free function that only answers for auth.uid()). */
export async function krogerConnected(db: SupabaseLike): Promise<boolean> {
  const { data } = await db.rpc("retailer_connected", { retailer: "kroger" });
  return data === true;
}

export async function disconnectKroger(uid: string): Promise<Result<null>> {
  const svc = serviceSupabase();
  if (!svc) return { ok: true, data: null };
  const { error } = await svc.from("retailer_connections").delete().eq("user_id", uid).eq("retailer", "kroger");
  return error ? { ok: false, message: "Couldn't disconnect Kroger." } : { ok: true, data: null };
}

type TokenResult = { ok: true; token: string } | { ok: false; message: string; needsAuth: boolean };

/**
 * A usable access token, refreshed (and re-sealed) when it's about to expire.
 * Runs only inside a send the database allowed, so two refreshes for one
 * cart can't race. A connection is removed only if Kroger rejected the very
 * refresh token we still have stored; an outage just says "try later".
 */
async function krogerAccessToken(uid: string): Promise<TokenResult> {
  const c = oauth();
  const svc = serviceSupabase();
  const reconnect = { ok: false as const, message: "Connect your Kroger account again — nothing was added.", needsAuth: true };
  if (!c || !svc) return { ok: false, message: "Kroger carts aren't switched on yet.", needsAuth: false };
  const read = async () => {
    const { data } = await svc.from("retailer_connections").select("token_ciphertext").eq("user_id", uid).eq("retailer", "kroger").maybeSingle();
    return (data as Row | null)?.token_ciphertext ?? null;
  };
  const sealed = await read();
  const tokens = sealed ? unseal<KrogerTokens>(sealed, tokenContext(uid)) : null;
  if (!tokens) return reconnect;
  if (new Date(tokens.accessExpiresAt).getTime() - Date.now() > 120_000) return { ok: true, token: tokens.accessToken };
  if (!tokens.refreshToken) return reconnect;
  try {
    const fresh = await krogerRefresh(c, tokens.refreshToken);
    const saved = await storeTokens(uid, fresh);
    return saved.ok ? { ok: true, token: fresh.accessToken } : { ok: false, message: saved.message, needsAuth: false };
  } catch (error) {
    if (error instanceof KrogerAuthError && error.kind === "invalid_grant") {
      // Only forget the connection if nobody refreshed it meanwhile.
      if ((await read()) === sealed) await svc.from("retailer_connections").delete().eq("user_id", uid).eq("retailer", "kroger").eq("token_ciphertext", sealed);
      return reconnect;
    }
    return { ok: false, message: "Kroger sign-in isn't responding right now. Try again in a few minutes — nothing was added.", needsAuth: false };
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------
function adapterFor(retailer: string): RetailerCartAdapter | null {
  if (retailer === "mock") return new MockCartAdapter();
  if (retailer === "kroger" && krogerCartEnabled()) return new KrogerCartAdapter();
  return null;
}

export async function sendCart(db: SupabaseLike, uid: string, request: unknown): Promise<Result<SendCartResult>> {
  const r = request as { draftId?: unknown; key?: unknown } | null;
  const draftId = typeof r?.draftId === "string" ? r.draftId : "";
  const key = typeof r?.key === "string" ? r.key : "";
  if (!/^[0-9a-f-]{36}$/i.test(draftId) || !/^[0-9a-f-]{36}$/i.test(key)) return { ok: false, message: "Approve the cart first." };
  // Read as the person: RLS confirms it's their household's open cart.
  const current = await createSupabaseCartRepository(db).current();
  if (!current.ok) return current;
  if (!current.data || current.data.id !== draftId) return { ok: false, message: "That cart isn't open any more. Reload the page." };
  const adapter = adapterFor(current.data.retailer);
  if (!adapter) return { ok: false, message: "That retailer can't take carts yet. Use the shopping list export instead." };

  if (adapter.isMock) {
    // Practice runs: the person's own session is enough.
    return sendCartDraft({ repo: createSupabaseCartRepository(db), adapter, draftId, key, title: "Kitchen Pantry groceries" });
  }
  const svc = serviceSupabase();
  if (!svc) return { ok: false, message: "Kroger carts aren't switched on yet." };
  // Not connected: nothing is started, so the approval and key stay as they are.
  if (!(await krogerConnected(db))) return { ok: true, data: { draft: current.data, message: "Connect your Kroger account to send the cart.", needsAuth: true } };
  return sendCartDraft({
    repo: createSupabaseCartRepository(svc, { actingUser: uid }),
    adapter,
    draftId,
    key,
    getAccessToken: () => krogerAccessToken(uid),
    title: "Kitchen Pantry groceries",
  });
}
