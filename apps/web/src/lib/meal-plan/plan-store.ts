import "server-only";
import type { AiPlanStore } from "@kitchen-pantry/ai";
import type { SupabaseLike } from "@kitchen-pantry/database";

/**
 * Where a household's AI meal-plan answers are kept between requests
 * (migration `…2400_ai_plan_cache`), so the web, the phone and the weekly
 * job don't pay twice for the same request. Best-effort: any error — the
 * migration not applied yet, the network — is just a miss.
 */

/** As the signed-in person: their active household's answers (via the database functions). */
export function supabasePlanStore(db: SupabaseLike): AiPlanStore {
  return {
    async get(key) {
      const { data, error } = await db.rpc("get_ai_plan", { key });
      if (error) {
        if (error.code !== "PGRST202") console.error("[ai] saved plan read failed", { code: error.code });
        return null;
      }
      return data ?? null;
    },
    async set(key, answer, ttlHours) {
      const { error } = await db.rpc("put_ai_plan", { key, answer, ttl_hours: ttlHours });
      if (error && error.code !== "PGRST202") console.error("[ai] saved plan write failed", { code: error.code });
    },
  };
}

/** As the service role (weekly job): one named household's answers. */
export function servicePlanStore(svc: SupabaseLike, householdId: string): AiPlanStore {
  return {
    async get(key) {
      const { data, error } = await svc
        .from("ai_plan_cache")
        .select("answer")
        .eq("household_id", householdId)
        .eq("cache_key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) return null;
      return (data as { answer?: unknown } | null)?.answer ?? null;
    },
    async set(key, answer, ttlHours) {
      const now = new Date();
      const { error } = await svc.from("ai_plan_cache").upsert(
        {
          household_id: householdId,
          cache_key: key,
          answer,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
        },
        { onConflict: "household_id,cache_key" },
      );
      if (error && error.code !== "42P01") console.error("[weekly] saved plan write failed", { code: error.code });
    },
  };
}
