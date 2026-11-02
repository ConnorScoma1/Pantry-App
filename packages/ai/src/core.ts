/**
 * @kitchen-pantry/ai — server-only AI integration (any provider: see providers.ts).
 *
 * Rules enforced here:
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

export type AiProviderName = "anthropic" | "gemini" | "openai" | "groq";

export interface AiConfig {
  /** Which company answers (default anthropic, for older settings files). */
  provider?: AiProviderName;
  apiKey: string;
  model: string;
  /** Gemini only: force Google AI Studio or Vertex AI express mode (otherwise worked out from the key). */
  geminiEndpoint?: "studio" | "vertex";
  /** Gemini 3 only: thinking level to request ("minimal", "low", …); unset = the model's default. */
  thinkingLevel?: string;
  /** OpenAI-compatible only: a different Chat Completions URL. */
  baseUrl?: string;
  /** Price per million tokens, US dollars; null when we don't know it (then there's no cost estimate). */
  price?: ModelPrice | null;
  /** Spending cap for the whole app per calendar month (US dollars); null = no cap. */
  monthlyBudgetUsd?: number | null;
  /** AI requests per person per calendar month, all features together; null = no monthly limit. */
  monthlyPersonLimit?: number | null;
  /** Hard cap on output tokens per request — part of AI usage control. */
  maxOutputTokens: number;
  /** AI meal plans per household per 24 hours; after that the standard planner is used. */
  dailyPlanLimit: number;
  /** Cooking-assistant questions per household per 24 hours (default 30); then curated help only. */
  dailyHelpLimit?: number;
  /** AI recipe drafts (new versions, full recipes for dish ideas) per household per 24 hours (default 5). */
  dailyDraftLimit?: number;
  /** AI shopping-advisor explanations per household per 24 hours (default 10). */
  dailyAdviceLimit?: number;
  /** Receipt photos read per household per 24 hours (default 5). */
  dailyReceiptLimit?: number;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Where the price came from and when it was checked. */
  source: string;
}

/**
 * Prices we've checked on the provider's own pricing page. Anything not
 * listed has no cost estimate unless AI_PRICE_INPUT_PER_M and
 * AI_PRICE_OUTPUT_PER_M are set — we don't guess.
 */
export const KNOWN_PRICES: Record<string, ModelPrice> = {
  "gemini-3.1-flash-lite": { inputPerMillion: 0.25, outputPerMillion: 1.5, source: "ai.google.dev/gemini-api/docs/pricing, standard paid tier, text, checked 2026-11-02" },
};

const DEFAULT_MODEL: Partial<Record<AiProviderName, string>> = {
  anthropic: "claude-sonnet-5-5",
  gemini: "gemini-3.1-flash-lite",
};
const KEY_VAR: Record<AiProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
};

const optionalNumber = (min: number, max: number) =>
  z.preprocess((v) => (v === undefined || v === "" ? undefined : v), z.coerce.number().min(min).max(max).optional());

const envSchema = z.object({
  AI_PROVIDER: z.enum(["anthropic", "gemini", "openai", "groq"]).optional().catch(undefined),
  AI_MODEL: z.string().trim().min(1).max(100).optional().catch(undefined),
  ANTHROPIC_MODEL: z.string().trim().min(1).max(100).optional().catch(undefined),
  GEMINI_ENDPOINT: z.enum(["studio", "vertex"]).optional().catch(undefined),
  GEMINI_THINKING_LEVEL: z.enum(["minimal", "low", "medium", "high"]).optional().catch(undefined),
  AI_BASE_URL: z.url({ protocol: /^https$/ }).optional().catch(undefined),
  AI_PRICE_INPUT_PER_M: optionalNumber(0, 1000),
  AI_PRICE_OUTPUT_PER_M: optionalNumber(0, 1000),
  AI_MONTHLY_BUDGET_USD: optionalNumber(0, 1_000_000),
  AI_MONTHLY_REQUESTS_PER_PERSON: optionalNumber(0, 100_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16_000).default(2_048),
  AI_DAILY_PLAN_LIMIT: z.coerce.number().int().min(0).max(1_000).default(10),
  AI_DAILY_HELP_LIMIT: z.coerce.number().int().min(0).max(1_000).default(30),
  AI_DAILY_DRAFT_LIMIT: z.coerce.number().int().min(0).max(200).default(5),
  AI_DAILY_ADVICE_LIMIT: z.coerce.number().int().min(0).max(200).default(10),
  AI_DAILY_RECEIPT_LIMIT: z.coerce.number().int().min(0).max(100).default(5),
});

/** Which provider the settings point at: AI_PROVIDER, or the first key that's set (Claude first, for older settings). */
function chooseProvider(env: Record<string, string | undefined>, asked: AiProviderName | undefined): AiProviderName | null {
  if (asked) return env[KEY_VAR[asked]]?.trim() ? asked : null;
  for (const p of ["anthropic", "gemini", "openai", "groq"] as const) if (env[KEY_VAR[p]]?.trim()) return p;
  return null;
}

export interface AiSetupProblem {
  problem: string;
}

/** Read AI config from the server environment. Returns null when unconfigured (or set up unsafely). */
export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const r = readAiSetup(env);
  return "problem" in r ? null : r;
}

/** Like readAiConfig, but says why AI is off (for the health check and setup messages). */
export function readAiSetup(env: Record<string, string | undefined> = process.env): AiConfig | AiSetupProblem {
  assertServerOnly();
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) return { problem: "Some AI settings aren't valid numbers." };
  const e = parsed.data;
  const provider = chooseProvider(env, e.AI_PROVIDER);
  if (!provider) return { problem: e.AI_PROVIDER ? `AI_PROVIDER is ${e.AI_PROVIDER} but ${KEY_VAR[e.AI_PROVIDER]} isn't set.` : "No AI key is set." };
  const model = e.AI_MODEL ?? (provider === "anthropic" ? e.ANTHROPIC_MODEL : undefined) ?? DEFAULT_MODEL[provider];
  if (!model) return { problem: `Set AI_MODEL to the ${provider} model to use.` };
  const price: ModelPrice | null =
    e.AI_PRICE_INPUT_PER_M !== undefined && e.AI_PRICE_OUTPUT_PER_M !== undefined
      ? { inputPerMillion: e.AI_PRICE_INPUT_PER_M, outputPerMillion: e.AI_PRICE_OUTPUT_PER_M, source: "AI_PRICE_INPUT_PER_M / AI_PRICE_OUTPUT_PER_M" }
      : (KNOWN_PRICES[model] ?? null);
  const budget = e.AI_MONTHLY_BUDGET_USD ?? null;
  // A spending cap we can't measure isn't a cap: stay off rather than guess.
  if (budget !== null && !price) return { problem: `AI_MONTHLY_BUDGET_USD is set, but the price of ${model} isn't known. Set AI_PRICE_INPUT_PER_M and AI_PRICE_OUTPUT_PER_M from the provider's pricing page.` };
  return {
    provider,
    apiKey: env[KEY_VAR[provider]]!.trim(),
    model,
    geminiEndpoint: e.GEMINI_ENDPOINT,
    thinkingLevel: e.GEMINI_THINKING_LEVEL,
    baseUrl: e.AI_BASE_URL,
    price,
    monthlyBudgetUsd: budget,
    monthlyPersonLimit: e.AI_MONTHLY_REQUESTS_PER_PERSON === undefined ? null : Math.floor(e.AI_MONTHLY_REQUESTS_PER_PERSON),
    maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS,
    dailyPlanLimit: e.AI_DAILY_PLAN_LIMIT,
    dailyHelpLimit: e.AI_DAILY_HELP_LIMIT,
    dailyDraftLimit: e.AI_DAILY_DRAFT_LIMIT,
    dailyAdviceLimit: e.AI_DAILY_ADVICE_LIMIT,
    dailyReceiptLimit: e.AI_DAILY_RECEIPT_LIMIT,
  };
}

/** Estimated cost of one request in millionths of a US dollar (null when the price isn't known). */
export function estimateCostMicros(price: ModelPrice | null | undefined, usage: { inputTokens: number; outputTokens: number } | null): number | null {
  if (!price || !usage) return null;
  return Math.round(usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion);
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
