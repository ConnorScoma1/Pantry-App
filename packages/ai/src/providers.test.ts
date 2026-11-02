import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AiRequestError, callModelJson, estimateCostMicros, geminiEndpoint, readAiConfig, readAiSetup, toGeminiSchema, type AiConfig, type FetchLike } from "./index";

const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" }, note: { type: ["string", "null"], maxLength: 10 } } };

function recorder(response: unknown, status = 200) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => response };
  };
  return { calls, fetchImpl };
}

test("AI settings: provider from AI_PROVIDER or the key that's set; models and prices", () => {
  assert.equal(readAiConfig({}), null);
  const old = readAiConfig({ ANTHROPIC_API_KEY: "sk-ant-x" })!;
  assert.equal(old.provider, "anthropic");
  assert.equal(old.model, "claude-sonnet-5-5");
  const g = readAiConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: " AQ.abc ", ANTHROPIC_API_KEY: "sk-ant-x" })!;
  assert.equal(g.provider, "gemini");
  assert.equal(g.apiKey, "AQ.abc");
  assert.equal(g.model, "gemini-3.1-flash-lite");
  assert.equal(g.price?.inputPerMillion, 0.25);
  assert.equal(g.price?.outputPerMillion, 1.5);
  assert.match(String((readAiSetup({ AI_PROVIDER: "gemini" }) as { problem: string }).problem), /GEMINI_API_KEY/);
  assert.match(String((readAiSetup({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }) as { problem: string }).problem), /AI_MODEL/, "no guessed OpenAI model");
  // A budget needs a known price; otherwise AI stays off.
  assert.match(String((readAiSetup({ AI_PROVIDER: "groq", GROQ_API_KEY: "k", AI_MODEL: "some-model", AI_MONTHLY_BUDGET_USD: "5" }) as { problem: string }).problem), /price/);
  const priced = readAiConfig({ AI_PROVIDER: "groq", GROQ_API_KEY: "k", AI_MODEL: "some-model", AI_MONTHLY_BUDGET_USD: "5", AI_PRICE_INPUT_PER_M: "0.1", AI_PRICE_OUTPUT_PER_M: "0.3", AI_MONTHLY_REQUESTS_PER_PERSON: "60" })!;
  assert.equal(priced.monthlyBudgetUsd, 5);
  assert.equal(priced.monthlyPersonLimit, 60);
  assert.equal(estimateCostMicros(g.price, { inputTokens: 4000, outputTokens: 600 }), 1900, "4,000 in + 600 out = $0.0019");
  assert.equal(estimateCostMicros(null, { inputTokens: 1, outputTokens: 1 }), null);
});

test("Gemini: Vertex express or AI Studio by key, key in a header, schema trimmed, thinking billed as output", async () => {
  assert.equal(geminiEndpoint({ apiKey: "AQ.x" }), "vertex");
  assert.equal(geminiEndpoint({ apiKey: "AIzaSy" }), "studio");
  assert.deepEqual(toGeminiSchema(schema), { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, note: { type: ["string", "null"] } } });

  const r = recorder({ candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"ok":true}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 60 }, modelVersion: "gemini-3.1-flash-lite" });
  const config: AiConfig = { provider: "gemini", apiKey: "AQ.secret", model: "gemini-3.1-flash-lite", maxOutputTokens: 1000, dailyPlanLimit: 5, thinkingLevel: "low" };
  const res = await callModelJson({ config, system: "sys", user: "hi", schema, fetchImpl: r.fetchImpl });
  assert.deepEqual(res.json, { ok: true });
  assert.deepEqual(res.usage, { inputTokens: 900, outputTokens: 100 });
  const call = r.calls[0]!;
  assert.equal(call.url, "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.1-flash-lite:generateContent");
  assert.ok(!call.url.includes("secret"), "the key never goes in the URL");
  assert.equal(call.headers["x-goog-api-key"], "AQ.secret");
  const gc = call.body.generationConfig as Record<string, unknown>;
  assert.equal(gc.responseMimeType, "application/json");
  assert.deepEqual(gc.thinkingConfig, { thinkingLevel: "low" });
  assert.deepEqual(call.body.systemInstruction, { parts: [{ text: "sys" }] });

  const studio = recorder({ candidates: [{ content: { parts: [{ text: '```json\n{"ok":false}\n```' }] }, finishReason: "STOP" }] });
  const s = await callModelJson({ config: { ...config, apiKey: "AIzaK", thinkingLevel: undefined }, system: "s", user: "u", schema, fetchImpl: studio.fetchImpl });
  assert.deepEqual(s.json, { ok: false }, "a code fence around JSON is tolerated");
  assert.ok(studio.calls[0]!.url.startsWith("https://generativelanguage.googleapis.com/v1beta/models/"));
  assert.ok(!("thinkingConfig" in (studio.calls[0]!.body.generationConfig as object)));

  const cut = recorder({ candidates: [{ content: { parts: [{ text: '{"ok":' }] }, finishReason: "MAX_TOKENS" }] });
  await assert.rejects(callModelJson({ config, system: "s", user: "u", schema, fetchImpl: cut.fetchImpl }), (e: AiRequestError) => e.kind === "truncated");
  const blocked = recorder({ promptFeedback: { blockReason: "SAFETY" } });
  await assert.rejects(callModelJson({ config, system: "s", user: "u", schema, fetchImpl: blocked.fetchImpl }), (e: AiRequestError) => e.kind === "refusal");
  const busy = recorder({ error: { message: "quota for key AQ.secret" } }, 429);
  await assert.rejects(callModelJson({ config, system: "s", user: "u", schema, fetchImpl: busy.fetchImpl }), (e: AiRequestError) => e.kind === "rate_limited" && !e.message.includes("secret"));
});

test("OpenAI and Groq: chat completions with a JSON schema", async () => {
  const r = recorder({ model: "m", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  const res = await callModelJson({ config: { provider: "groq", apiKey: "gsk", model: "m", maxOutputTokens: 500, dailyPlanLimit: 1 }, system: "s", user: "u", schema, fetchImpl: r.fetchImpl });
  assert.deepEqual(res.usage, { inputTokens: 10, outputTokens: 5 });
  assert.equal(r.calls[0]!.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(r.calls[0]!.headers.authorization, "Bearer gsk");
  assert.equal((r.calls[0]!.body.response_format as { type: string }).type, "json_schema");
  const o = recorder({ choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }] });
  await assert.rejects(callModelJson({ config: { provider: "openai", apiKey: "sk", model: "m", maxOutputTokens: 500, dailyPlanLimit: 1 }, system: "s", user: "u", schema, fetchImpl: o.fetchImpl }), (e: AiRequestError) => e.kind === "refusal");
});
