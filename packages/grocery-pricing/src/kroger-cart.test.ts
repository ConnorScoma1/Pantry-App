import { strict as assert } from "node:assert";
import { test } from "node:test";
import { KrogerAuthError, KrogerCartAdapter, krogerAuthorizeUrl, krogerExchangeCode, krogerRefresh, krogerUpc } from "./index";

const NOW = new Date("2026-11-01T18:00:00Z");
const cfg = { clientId: "app-id", clientSecret: "s3cret", redirectUri: "https://pantry.example.com/api/retailers/kroger/callback", now: () => NOW };

function fake(status: number, body: unknown = null) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { f, calls };
}

test("kroger oauth: authorize link asks only for cart access, with PKCE", () => {
  const url = new URL(krogerAuthorizeUrl(cfg, { state: "st", codeChallenge: "ch", banner: "picknsave" }));
  assert.equal(url.origin + url.pathname, "https://api.kroger.com/v1/connect/oauth2/authorize");
  assert.equal(url.searchParams.get("scope"), "cart.basic:write");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), cfg.redirectUri);
  assert.equal(url.searchParams.get("banner"), "picknsave");
  assert.equal(new URL(krogerAuthorizeUrl(cfg, { state: "s", codeChallenge: "c", banner: "<x>" })).searchParams.get("banner"), null);
});

test("kroger oauth: code exchange and rotating refresh happen with the secret, server-side", async () => {
  const ok = fake(200, { access_token: "acc", refresh_token: "ref2", expires_in: 1800, scope: "cart.basic:write" });
  const t = await krogerExchangeCode({ ...cfg, fetch: ok.f }, { code: "c0de", codeVerifier: "v" });
  assert.deepEqual(t, { accessToken: "acc", refreshToken: "ref2", accessExpiresAt: "2026-11-01T18:30:00.000Z", scope: "cart.basic:write" });
  const body = new URLSearchParams(String(ok.calls[0]!.init.body));
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code_verifier"), "v");
  assert.match(String((ok.calls[0]!.init.headers as Record<string, string>).Authorization), /^Basic /);
  const same = fake(200, { access_token: "acc3", expires_in: 1800 });
  assert.equal((await krogerRefresh({ ...cfg, fetch: same.f }, "ref2")).refreshToken, "ref2", "keeps the old refresh token if none is returned");
  await assert.rejects(krogerRefresh({ ...cfg, fetch: fake(400, { error: "invalid_grant" }).f }, "old"), (e) => e instanceof KrogerAuthError && e.kind === "invalid_grant");
});

test("kroger cart: one PUT with UPCs, quantities and pickup/delivery; 204 = accepted", async () => {
  const ok = fake(204);
  const r = await new KrogerCartAdapter({ fetch: ok.f, now: () => NOW }).transfer({
    items: [{ productId: "0001111041700", upc: null, name: "Kroger Milk", quantity: 2 }, { productId: "x", upc: "0000000004011", name: "Bananas", quantity: 3 }],
    fulfillment: "delivery",
    accessToken: "acc",
  });
  assert.deepEqual(r, { ok: true, result: { kind: "cart_confirmed", added: 2, checkoutUrl: "https://www.kroger.com/cart", confirmedBy: "retailer_api", at: NOW.toISOString() } });
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0]!.url, "https://api.kroger.com/v1/cart/add");
  assert.equal(ok.calls[0]!.init.method, "PUT");
  assert.deepEqual(JSON.parse(String(ok.calls[0]!.init.body)), { items: [{ upc: "0001111041700", quantity: 2, modality: "DELIVERY" }, { upc: "0000000004011", quantity: 3, modality: "DELIVERY" }] });
});

test("kroger cart: every failure says whether anything could have been added", async () => {
  const items = [{ productId: "0001111041700", upc: null, name: "Milk", quantity: 1 }];
  const run = async (status: number) => new KrogerCartAdapter({ fetch: fake(status, { errors: { code: "X" } }).f }).transfer({ items, fulfillment: "pickup", accessToken: "acc" });
  const expect = async (status: number, error: string, retryable: boolean) => {
    const r = await run(status);
    assert.ok(!r.ok && r.error === error && r.retryable === retryable, `${status} → ${error}`);
  };
  await expect(401, "auth_expired", true);
  await expect(403, "auth_required", true);
  await expect(429, "rate_limited", true);
  await expect(400, "rejected", false);
  await expect(502, "unknown", false);
  const offline = await new KrogerCartAdapter({ fetch: (async () => { throw new Error("network"); }) as typeof fetch }).transfer({ items, fulfillment: "pickup", accessToken: "acc" });
  assert.ok(!offline.ok && offline.error === "unknown", "a timeout might have added items: unknown, never auto-retried");
  const noToken = await new KrogerCartAdapter().transfer({ items, fulfillment: "pickup", accessToken: null });
  assert.ok(!noToken.ok && noToken.error === "auth_required");
  const notKroger = await new KrogerCartAdapter({ fetch: fake(204).f }).transfer({ items: [{ productId: "sample-1", upc: null, name: "Sample Milk", quantity: 1 }], fulfillment: "pickup", accessToken: "acc" });
  assert.ok(!notKroger.ok && notKroger.error === "rejected");
  assert.equal(krogerUpc({ productId: "0001111041700", upc: null }), "0001111041700");
});
