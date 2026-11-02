import { AiRequestError, callClaudeJson, type AiFailureKind, type ClaudeImage, type ClaudeJsonResult, type FetchLike } from "./claude";
import { assertServerOnly, type AiConfig } from "./core";

/**
 * Provider-independent structured-output calls. Every AI feature (meal
 * plans, recipe drafts, cooking help, shopping advice, receipts) asks for
 * JSON matching a schema through `callModelJson`; which company answers is
 * a server setting (AI_PROVIDER), not something the features know about.
 *
 *   anthropic — Claude Messages API, structured outputs (claude.ts)
 *   gemini    — Gemini generateContent with a JSON response schema; Google
 *               AI Studio keys (AIza…) or Vertex AI express-mode keys (AQ.…)
 *   openai    — Chat Completions with response_format json_schema
 *   groq      — OpenAI-compatible Chat Completions at api.groq.com
 *
 * Keys are read from the server environment only and sent in request
 * headers (never in URLs, logs or error messages). Whatever comes back is
 * still validated by each feature's own zod schema before it's used.
 */
export type AiProvider = "anthropic" | "gemini" | "openai" | "groq";
export type AiImage = ClaudeImage;
export type ModelJsonResult = ClaudeJsonResult;

export const GEMINI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_VERTEX_URL = "https://aiplatform.googleapis.com/v1/publishers/google/models";
export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface ModelJsonOptions {
  config: AiConfig;
  system: string;
  user: string;
  images?: readonly AiImage[];
  schema: Record<string, unknown>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Pause before the single retry on "busy" (default 2 s; tests use 0). */
  retryDelayMs?: number;
}

/**
 * One retry, after a short pause, when the provider says it's busy or rate
 * limited (429/503/529) — common on free tiers. Timeouts aren't retried (the
 * person would wait too long); everything else falls back right away.
 */
export async function callModelJson(options: ModelJsonOptions): Promise<ModelJsonResult> {
  try {
    return await callOnce(options);
  } catch (err) {
    if (!(err instanceof AiRequestError) || (err.kind !== "rate_limited" && err.kind !== "overloaded")) throw err;
    await new Promise((r) => setTimeout(r, options.retryDelayMs ?? 2_000));
    return callOnce(options);
  }
}

async function callOnce(options: ModelJsonOptions): Promise<ModelJsonResult> {
  assertServerOnly();
  switch (options.config.provider ?? "anthropic") {
    case "anthropic":
      return callClaudeJson(options);
    case "gemini":
      return callGeminiJson(options);
    case "openai":
    case "groq":
      return callOpenAiCompatibleJson(options);
  }
}

/** Human name for messages ("the AI assistant" when unknown). */
export function providerLabel(config: Pick<AiConfig, "provider"> | null): string {
  switch (config?.provider) {
    case "anthropic":
      return "Claude";
    case "gemini":
      return "Gemini";
    default:
      return "the AI assistant";
  }
}

// ---------------------------------------------------------------------------
// Shared HTTP plumbing
// ---------------------------------------------------------------------------
async function post(url: string, headers: Record<string, string>, body: unknown, options: ModelJsonOptions, who: string): Promise<{ status: number; ok: boolean; json: unknown; requestId: string | null }> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new AiRequestError(aborted ? "timeout" : "network", aborted ? `${who} took too long to respond.` : `Couldn't reach ${who}.`);
  } finally {
    clearTimeout(timer);
  }
  const requestId = res.headers?.get("x-request-id") ?? res.headers?.get("x-goog-request-id") ?? null;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AiRequestError("http", `${who} returned an unreadable response.`, res.status, requestId);
  }
  if (!res.ok) {
    const kind: AiFailureKind = res.status === 429 ? "rate_limited" : res.status === 503 || res.status === 529 ? "overloaded" : "http";
    // Status only — upstream error bodies can echo request details.
    throw new AiRequestError(kind, `${who} request failed (${res.status}).`, res.status, requestId);
  }
  return { status: res.status, ok: res.ok, json, requestId };
}

function parseJsonText(text: string | undefined, who: string, status: number, requestId: string | null): unknown {
  if (!text) throw new AiRequestError("invalid", `${who}'s answer had no content.`, status, requestId);
  // Some models wrap JSON in a code fence even in JSON mode.
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new AiRequestError("invalid", `${who}'s answer wasn't valid JSON.`, status, requestId);
  }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

/**
 * Google AI Studio (the Gemini API) by default: it accepts both "AIza…" and
 * "AQ.…" keys and needs no Cloud billing set-up. Vertex AI only when
 * GEMINI_ENDPOINT=vertex (it needs the Agent Platform API and billing on the
 * Cloud project — checked with `npm run ai:check`, 2026-11-02).
 */
export function geminiEndpoint(config: Pick<AiConfig, "apiKey" | "geminiEndpoint">): "studio" | "vertex" {
  return config.geminiEndpoint ?? "studio";
}

/** JSON Schema keywords Gemini doesn't accept in response schemas are dropped (we validate them with zod anyway). */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "additionalProperties" || k === "$schema" || k === "minLength" || k === "maxLength" || k === "pattern") continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, toGeminiSchema(s)])) : toGeminiSchema(v);
  }
  return out;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
}

async function callGeminiJson(options: ModelJsonOptions): Promise<ModelJsonResult> {
  const { config } = options;
  const endpoint = geminiEndpoint(config);
  const base = endpoint === "vertex" ? GEMINI_VERTEX_URL : GEMINI_STUDIO_URL;
  const url = `${base}/${encodeURIComponent(config.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: config.maxOutputTokens,
    responseMimeType: "application/json",
    responseJsonSchema: toGeminiSchema(options.schema),
  };
  if (config.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: config.thinkingLevel };
  const body = {
    systemInstruction: { parts: [{ text: options.system }] },
    contents: [
      {
        role: "user",
        parts: [...(options.images ?? []).map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })), { text: options.user }],
      },
    ],
    generationConfig,
  };
  const res = await post(url, { "x-goog-api-key": config.apiKey }, body, options, "Gemini");
  const g = res.json as GeminiResponse;
  if (g.promptFeedback?.blockReason) throw new AiRequestError("refusal", "Gemini declined this request.", res.status, res.requestId);
  const cand = g.candidates?.[0];
  const reason = cand?.finishReason ?? "STOP";
  if (reason === "MAX_TOKENS" || reason === "CONTINUATION") throw new AiRequestError("truncated", "Gemini's answer was cut off.", res.status, res.requestId);
  if (reason !== "STOP") throw new AiRequestError("refusal", `Gemini stopped (${reason}).`, res.status, res.requestId);
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  const u = g.usageMetadata ?? {};
  return {
    json: parseJsonText(text, "Gemini", res.status, res.requestId),
    model: g.modelVersion ?? config.model,
    // Thinking tokens are billed as output.
    usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) },
    requestId: res.requestId,
  };
}

// ---------------------------------------------------------------------------
// OpenAI and Groq (OpenAI-compatible Chat Completions)
// ---------------------------------------------------------------------------
interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callOpenAiCompatibleJson(options: ModelJsonOptions): Promise<ModelJsonResult> {
  const { config } = options;
  const groq = config.provider === "groq";
  const who = groq ? "Groq" : "OpenAI";
  const url = config.baseUrl ?? (groq ? GROQ_URL : OPENAI_URL);
  const content = options.images?.length
    ? [...options.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })), { type: "text", text: options.user }]
    : options.user;
  const body = {
    model: config.model,
    max_completion_tokens: config.maxOutputTokens,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: { name: "answer", schema: options.schema, strict: !groq } },
  };
  const res = await post(url, { authorization: `Bearer ${config.apiKey}` }, body, options, who);
  const r = res.json as ChatResponse;
  const choice = r.choices?.[0];
  if (choice?.message?.refusal) throw new AiRequestError("refusal", `${who} declined this request.`, res.status, res.requestId);
  if (choice?.finish_reason === "length") throw new AiRequestError("truncated", `${who}'s answer was cut off.`, res.status, res.requestId);
  return {
    json: parseJsonText(choice?.message?.content ?? undefined, who, res.status, res.requestId),
    model: r.model ?? config.model,
    usage: { inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 },
    requestId: res.requestId,
  };
}
