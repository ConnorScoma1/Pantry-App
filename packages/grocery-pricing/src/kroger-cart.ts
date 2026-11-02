import { z } from "zod";
import type { FulfillmentMethod, RetailerCartAdapter, TransferItem, TransferOutcome } from "./cart";

/**
 * Kroger Public API — customer sign-in (OAuth 2.0 authorization code with
 * PKCE) and Cart "add". SERVER ONLY: the token exchange needs the client
 * secret.
 *
 * What the public Cart API can do: add items to the signed-in customer's
 * cart (PUT /v1/cart/add → 204). It can't read the cart back, remove items
 * or check out; items go to the store chosen on the customer's Kroger
 * account. So: a 2xx is reported as "Kroger accepted the items", a 5xx or
 * timeout as "unknown — check your cart" (never retried automatically), and
 * the shopper finishes at kroger.com (time slot and payment).
 *
 * Source notes and how to verify access before switching this on:
 * docs/ARCHITECTURE.md "How Smart Cart works".
 */

export const KROGER_CART_SCOPE = "cart.basic:write";
const DEFAULT_BASE = "https://api.kroger.com";
export const KROGER_CART_URL = "https://www.kroger.com/cart";

export interface KrogerTokens {
  accessToken: string;
  refreshToken: string | null;
  /** ISO time the access token stops working. */
  accessExpiresAt: string;
  scope: string | null;
}

const tokenResponse = z.object({
  access_token: z.string().min(1).max(4000),
  refresh_token: z.string().min(1).max(4000).optional(),
  expires_in: z.number().positive().max(86_400).optional(),
  scope: z.string().max(300).optional(),
});

export class KrogerAuthError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid_grant" | "rejected" | "unavailable",
  ) {
    super(message);
    this.name = "KrogerAuthError";
  }
}

export interface KrogerOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Where to send the shopper to sign in to Kroger and allow cart access. */
export function krogerAuthorizeUrl(c: Pick<KrogerOAuthConfig, "clientId" | "redirectUri" | "baseUrl">, input: { state: string; codeChallenge: string; banner?: string }): string {
  const url = new URL("/v1/connect/oauth2/authorize", c.baseUrl ?? DEFAULT_BASE);
  url.searchParams.set("scope", KROGER_CART_SCOPE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", c.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.banner && /^[a-z]{2,30}$/.test(input.banner)) url.searchParams.set("banner", input.banner);
  return url.toString();
}

async function tokenRequest(c: KrogerOAuthConfig, body: URLSearchParams): Promise<KrogerTokens> {
  const f = c.fetch ?? fetch;
  const now = c.now?.() ?? new Date();
  let res: Response;
  try {
    res = await f(new URL("/v1/connect/oauth2/token", c.baseUrl ?? DEFAULT_BASE), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${c.clientId}:${c.clientSecret}`)}`,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new KrogerAuthError("Kroger sign-in isn't responding. Try again in a minute.", "unavailable");
  }
  if (res.status === 400 || res.status === 401) {
    throw new KrogerAuthError("Kroger sign-in expired. Connect your Kroger account again.", "invalid_grant");
  }
  if (!res.ok) throw new KrogerAuthError("Kroger sign-in isn't responding. Try again in a minute.", "unavailable");
  const parsed = tokenResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new KrogerAuthError("Kroger sent an unreadable sign-in response.", "rejected");
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    accessExpiresAt: new Date(now.getTime() + (parsed.data.expires_in ?? 1800) * 1000).toISOString(),
    scope: parsed.data.scope ?? null,
  };
}

/** Code → tokens (after the shopper allowed access). */
export function krogerExchangeCode(c: KrogerOAuthConfig, input: { code: string; codeVerifier: string }): Promise<KrogerTokens> {
  return tokenRequest(
    c,
    new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: c.redirectUri, code_verifier: input.codeVerifier }),
  );
}

/** Refresh tokens rotate: always store the new one. */
export async function krogerRefresh(c: KrogerOAuthConfig, refreshToken: string): Promise<KrogerTokens> {
  const t = await tokenRequest(c, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  return { ...t, refreshToken: t.refreshToken ?? refreshToken };
}

/** Kroger product ids are 13-digit UPCs; anything else can't be added. */
export const krogerUpc = (item: Pick<TransferItem, "upc" | "productId">): string | null => {
  const id = item.upc && /^\d{13}$/.test(item.upc) ? item.upc : item.productId;
  return /^\d{13}$/.test(id) ? id : null;
};

/** Adds the household's approved items to the signed-in shopper's Kroger cart. */
export class KrogerCartAdapter implements RetailerCartAdapter {
  readonly id = "kroger";
  readonly displayName = "Kroger";
  readonly isMock = false;
  readonly mode = "direct_cart" as const;
  readonly fulfillment: readonly FulfillmentMethod[] = ["pickup", "delivery"];
  readonly requiresUserAuth = true;

  constructor(private readonly options: { baseUrl?: string; fetch?: typeof fetch; now?: () => Date; cartUrl?: string } = {}) {}

  async transfer(input: { items: readonly TransferItem[]; fulfillment: FulfillmentMethod; accessToken: string | null }): Promise<TransferOutcome> {
    if (!input.accessToken) return { ok: false, error: "auth_required", message: "Connect your Kroger account first.", retryable: true };
    const items = input.items.map((i) => ({ upc: krogerUpc(i), quantity: Math.max(1, Math.min(99, Math.round(i.quantity))), name: i.name }));
    const bad = items.filter((i) => !i.upc);
    if (items.length === 0) return { ok: false, error: "rejected", message: "Nothing to add.", retryable: false };
    if (bad.length > 0) return { ok: false, error: "rejected", message: `These aren't Kroger products: ${bad.map((b) => b.name).join(", ")}.`, retryable: false };

    const f = this.options.fetch ?? fetch;
    let res: Response;
    try {
      res = await f(new URL("/v1/cart/add", this.options.baseUrl ?? DEFAULT_BASE), {
        method: "PUT",
        headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ upc: i.upc, quantity: i.quantity, modality: input.fulfillment === "delivery" ? "DELIVERY" : "PICKUP" })),
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // The request may or may not have reached Kroger.
      return { ok: false, error: "unknown", message: "Kroger didn't answer, so we can't tell whether the items were added. Check your Kroger cart before trying again.", retryable: false };
    }
    if (res.status >= 200 && res.status < 300) {
      return {
        ok: true,
        result: { kind: "cart_confirmed", added: items.length, checkoutUrl: this.options.cartUrl ?? KROGER_CART_URL, confirmedBy: "retailer_api", at: (this.options.now?.() ?? new Date()).toISOString() },
      };
    }
    if (res.status === 401) return { ok: false, error: "auth_expired", message: "Your Kroger sign-in expired. Connect again — nothing was added.", retryable: true };
    if (res.status === 403) return { ok: false, error: "auth_required", message: "Kroger didn't allow cart access. Connect your Kroger account again — nothing was added.", retryable: true };
    if (res.status === 429) return { ok: false, error: "rate_limited", message: "Kroger is limiting requests right now. Try again later — nothing was added.", retryable: true };
    if (res.status >= 400 && res.status < 500) return { ok: false, error: "rejected", message: "Kroger didn't accept these items — nothing was added. Check the products and try again.", retryable: false };
    return { ok: false, error: "unknown", message: "Kroger had a problem, so we can't tell whether the items were added. Check your Kroger cart before trying again.", retryable: false };
  }
}
