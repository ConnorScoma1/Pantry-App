import "server-only";
import type { SupabaseLike } from "@kitchen-pantry/database";

/**
 * Per-household daily AI allowances (spec 02 §8, cost control).
 *
 * A request takes its slot BEFORE Claude is called and records how it went
 * afterwards, so many requests sent at once can't all slip under the limit:
 * the database counts and reserves under a per-household lock
 * (reserve_ai_request). Anything unexpected fails closed (no AI).
 */
export type AiFeature = "meal_plan" | "cooking_help" | "recipe_draft" | "shopping_advice";
export type AiOutcome = "ok" | "fallback" | "cached" | "unused";

/** A reserved slot's id, or null when the allowance is used up (or can't be checked). */
export async function reserveAiRequest(db: SupabaseLike, feature: AiFeature, dailyLimit: number): Promise<string | null> {
  if (dailyLimit <= 0) return null;
  const { data, error } = await db.rpc("reserve_ai_request", { feature_name: feature, daily_limit: dailyLimit });
  if (error) {
    console.error("[ai] reserve failed", { code: (error as { code?: string }).code });
    return null;
  }
  return typeof data === "string" ? data : null;
}

export async function finishAiRequest(
  db: SupabaseLike,
  id: string,
  outcome: AiOutcome,
  model: string,
  usage: { inputTokens: number; outputTokens: number } | null,
): Promise<void> {
  const { error } = await db.rpc("finish_ai_request", {
    request_id: id,
    final_outcome: outcome,
    model_name: model,
    tokens_in: usage?.inputTokens ?? 0,
    tokens_out: usage?.outputTokens ?? 0,
  });
  if (error) console.error("[ai] usage log failed", { code: (error as { code?: string }).code });
}

/**
 * Preview mode (no Supabase) has no accounts, so anyone who can reach the
 * server could spend its Anthropic key. AI there is on only for local
 * development, or when AI_IN_PREVIEW=on is set on purpose; either way a
 * small in-memory allowance per server applies.
 */
export function previewAiAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.AI_IN_PREVIEW === "on" || env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

/** A preview allowance: reserving is synchronous, so parallel requests can't overshoot it. */
export function createPreviewAllowance() {
  const used: number[] = [];
  const prune = () => {
    const dayAgo = Date.now() - 86_400_000;
    while (used.length && used[0]! < dayAgo) used.shift();
  };
  return {
    remaining(limit: number): number {
      prune();
      return Math.max(0, limit - used.length);
    },
    /** Take a slot now; returns a function that gives it back (for cached or unused requests). */
    reserve(limit: number): (() => void) | null {
      prune();
      if (used.length >= limit) return null;
      const t = Date.now();
      used.push(t);
      return () => {
        const i = used.indexOf(t);
        if (i >= 0) used.splice(i, 1);
      };
    },
  };
}
