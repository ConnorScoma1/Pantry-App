import { assertServerOnly, type AiConfig } from "./core";

/**
 * Minimal, dependency-free client for the Claude Messages API
 * (POST https://api.anthropic.com/v1/messages), used with structured
 * outputs: `output_config.format = { type: "json_schema", schema }` makes
 * Claude return JSON matching the schema in a text block. We still validate
 * the result with zod — the schema is a request, our validator is the gate.
 *
 * Notes from the API docs (checked 2026-11-01):
 *  - anthropic-version 2026-10-21; temperature/top_p/top_k were removed in it.
 *  - Forcing a tool via tool_choice returns 400 on Sonnet 5.5 / Opus 5.5,
 *    so structured outputs (not forced tools) is the supported route.
 *  - JSON Schema for structured outputs: additionalProperties must be false;
 *    no minLength/maxLength/minimum/maximum (we enforce those in zod).
 */
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2026-10-21";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  headers?: { get(name: string): string | null };
}>;

export type AiFailureKind = "http" | "rate_limited" | "overloaded" | "refusal" | "truncated" | "invalid" | "timeout" | "network";

export class AiRequestError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    message: string,
    readonly status?: number,
    readonly requestId?: string | null,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export interface ClaudeJsonResult {
  json: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  requestId: string | null;
}

interface MessagesResponse {
  model?: string;
  stop_reason?: string | null;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

/** An image sent with the prompt (base64, already checked by the caller). */
export interface ClaudeImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

export async function callClaudeJson(options: {
  config: AiConfig;
  system: string;
  user: string;
  /** Images shown to Claude before the text (e.g. a receipt photo). */
  images?: readonly ClaudeImage[];
  schema: Record<string, unknown>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<ClaudeJsonResult> {
  assertServerOnly();
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.config.model,
        max_tokens: options.config.maxOutputTokens,
        system: options.system,
        messages: [
          {
            role: "user",
            content: options.images?.length
              ? [
                  ...options.images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } })),
                  { type: "text", text: options.user },
                ]
              : options.user,
          },
        ],
        output_config: { format: { type: "json_schema", schema: options.schema } },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new AiRequestError(aborted ? "timeout" : "network", aborted ? "Claude took too long to respond." : "Couldn't reach Claude.");
  } finally {
    clearTimeout(timer);
  }

  const requestId = res.headers?.get("request-id") ?? null;
  let body: MessagesResponse;
  try {
    body = (await res.json()) as MessagesResponse;
  } catch {
    throw new AiRequestError("http", "Claude returned an unreadable response.", res.status, requestId);
  }

  if (!res.ok) {
    const kind: AiFailureKind = res.status === 429 ? "rate_limited" : res.status === 529 ? "overloaded" : "http";
    // Never echo the API key or full upstream error to users; log-friendly summary only.
    throw new AiRequestError(kind, `Claude request failed (${res.status}${body.error?.type ? ` ${body.error.type}` : ""}).`, res.status, requestId);
  }
  if (body.stop_reason === "refusal") throw new AiRequestError("refusal", "Claude declined this request.", res.status, requestId);
  if (body.stop_reason === "max_tokens") throw new AiRequestError("truncated", "Claude's answer was cut off.", res.status, requestId);

  const text = (body.content ?? []).find((b) => b.type === "text")?.text;
  if (!text) throw new AiRequestError("invalid", "Claude's answer had no content.", res.status, requestId);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiRequestError("invalid", "Claude's answer wasn't valid JSON.", res.status, requestId);
  }
  return {
    json,
    model: body.model ?? options.config.model,
    usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
    requestId,
  };
}
