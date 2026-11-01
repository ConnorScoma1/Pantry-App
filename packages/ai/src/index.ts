/**
 * @kitchen-pantry/ai — server-only Claude integration.
 *
 * Phase 1 ships the guard rails; the Claude calls themselves (meal planning,
 * substitutions, cooking assistant) arrive in Phase 3 using the official
 * Anthropic SDK. Rules enforced here:
 *   1. Never imported into client bundles (assertServerOnly).
 *   2. API keys come only from server environment variables.
 *   3. Every model response is validated against a zod schema before use —
 *      AI output is data, never commands or SQL.
 */
import { z } from "zod";

export function assertServerOnly(moduleName = "@kitchen-pantry/ai"): void {
  if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
    throw new Error(`${moduleName} must only be used on the server.`);
  }
}

export interface AiConfig {
  apiKey: string;
  model: string;
  /** Hard cap on output tokens per request — part of AI usage control. */
  maxOutputTokens: number;
}

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16_000).default(2_048),
});

/** Read AI config from the server environment. Returns null when unconfigured. */
export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  assertServerOnly();
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) return null;
  return {
    apiKey: parsed.data.ANTHROPIC_API_KEY,
    model: parsed.data.ANTHROPIC_MODEL,
    maxOutputTokens: parsed.data.AI_MAX_OUTPUT_TOKENS,
  };
}

export class AiOutputValidationError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(`AI output failed validation: ${issues.map((i) => i.message).join("; ")}`);
    this.name = "AiOutputValidationError";
  }
}

/**
 * Parse model output (a JSON string or an already-parsed tool input) and
 * validate it. Throws AiOutputValidationError rather than returning
 * partially-trusted data.
 */
export function parseStructuredOutput<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new AiOutputValidationError([
        { code: "custom", path: [], message: "Response was not valid JSON", input: raw },
      ]);
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new AiOutputValidationError(result.error.issues);
  return result.data;
}
