import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EXPO_PUSH_URL, sendExpoPushes } from "./expo-push";

test("expo push: sends only to Expo addresses, in-app links only, and reports addresses that stopped working", async () => {
  const sent: Array<{ url: string; body: unknown; auth?: string }> = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as Array<{ to: string }>;
    sent.push({ url, body, auth: init.headers.Authorization });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: body.map((m) => (m.to.includes("gone") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "t" })) }),
    };
  };
  const out = await sendExpoPushes(
    [
      { to: "ExponentPushToken[phoneAAAAAAAA]", title: "Plan ready", body: "5 dinners", data: { url: "/plan?week=2026-11-09" } },
      { to: "ExponentPushToken[goneBBBBBBBB]", title: "Plan ready", body: "5 dinners" },
      { to: "https://evil.example/hook", title: "x", body: "y" },
      { to: "ExpoPushToken[phoneCCCCCCCC]", title: "Plan ready", body: "x", data: { url: "https://evil.example" } },
    ],
    { fetchImpl, accessToken: "secret" },
  );
  assert.deepEqual(out, { sent: 2, failed: 2, stale: ["ExponentPushToken[goneBBBBBBBB]"] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, EXPO_PUSH_URL);
  assert.equal(sent[0]!.auth, "Bearer secret");
  const body = sent[0]!.body as Array<{ to: string; data?: unknown }>;
  assert.equal(body.length, 3);
  assert.equal(body[2]!.data, undefined, "outside links are never sent");
});

test("expo push: an outage counts as failed, nothing throws", async () => {
  const out = await sendExpoPushes([{ to: "ExponentPushToken[phoneAAAAAAAA]", title: "t", body: "b" }], {
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(out, { sent: 0, failed: 1, stale: [] });
});
