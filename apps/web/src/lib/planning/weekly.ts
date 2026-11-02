import "server-only";
import { timingSafeEqual } from "node:crypto";
import { planWeekWithClaude, readAiConfig } from "@kitchen-pantry/ai";
import { createPlanningJobServer, type ClaimedPlanningJob, type PlanningJobServer, type SupabaseLike } from "@kitchen-pantry/database";
import { sendExpoPushes } from "@kitchen-pantry/integrations";
import { draftWeek } from "@kitchen-pantry/meal-planner";
import { findSpecials, pricingStatus } from "@/lib/pricing/server";
import { serviceRoleConfigured, serviceSupabase } from "@/lib/supabase/service";

/**
 * Weekly drafts — the scheduled server job (spec 02 §6).
 *
 * Something outside the app calls GET /api/jobs/weekly-drafts every hour with
 * `Authorization: Bearer $CRON_SECRET` (Vercel Cron, or Supabase pg_cron +
 * pg_net — see the README). Each call claims the households whose drafting
 * time has passed and that haven't had this week's draft yet, then for each:
 * reads its inputs (as one of its members, inside the database), drafts the
 * week, saves it ONLY into an empty week, and leaves a notice.
 *
 * It never buys anything, never confirms a plan, and never changes a week
 * someone has confirmed or started. OFF until WEEKLY_DRAFTS=on, a CRON_SECRET
 * of at least 32 characters and the service role key are set.
 */
const FEATURE = "meal_plan";
const cronSecret = process.env.CRON_SECRET ?? "";
const perRun = Math.min(Math.max(Number(process.env.WEEKLY_DRAFTS_PER_RUN ?? 10) || 10, 1), 50);

export function weeklyDraftsStatus(): { running: boolean; reason: string | null } {
  if (process.env.WEEKLY_DRAFTS !== "on") return { running: false, reason: "Weekly drafts aren't switched on on the server yet (see the README)." };
  if (cronSecret.length < 32) return { running: false, reason: "The server's CRON_SECRET isn't set (see the README)." };
  if (!serviceRoleConfigured()) return { running: false, reason: "The server's Supabase service role key isn't set (see the README)." };
  return { running: true, reason: null };
}

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. */
export function isCronRequest(request: Request): boolean {
  if (cronSecret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(cronSecret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface WeeklyRunSummary {
  claimed: number;
  drafted: number;
  skipped: number;
  failed: number;
  pushes: { sent: number; failed: number };
}

async function aiUsedToday(svc: SupabaseLike, householdId: string): Promise<number | null> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await svc
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("feature", FEATURE)
    .in("outcome", ["ok", "fallback", "reserved"])
    .gte("created_at", since);
  return error ? null : Number(count ?? 0);
}

async function draftOne(server: PlanningJobServer, svc: SupabaseLike, job: ClaimedPlanningJob, summary: WeeklyRunSummary): Promise<void> {
  const ctx = await server.context(job.jobId);
  if (!ctx.ok) throw new Error(ctx.message);
  if ("skip" in ctx.data) {
    await server.stop(job.jobId, ctx.data.skip, true);
    summary.skipped += 1;
    return;
  }
  const c = ctx.data;
  const recipes = await server.recipes(c.recipeIds);
  if (!recipes.ok) throw new Error(recipes.message);

  // Claude only within the household's own daily allowance (shared with planning in the app).
  const config = readAiConfig();
  let ai = config && config.dailyPlanLimit > 0 ? config : null;
  if (ai) {
    const used = await aiUsedToday(svc, c.householdId);
    if (used === null || used >= ai.dailyPlanLimit) ai = null; // fail closed
  }

  const result = await draftWeek(
    {
      weekStart: c.weekStart,
      today: new Date().toISOString().slice(0, 10),
      mode: c.mode,
      profile: c.profile,
      pantry: c.pantry,
      favorites: c.favorites,
      ratings: c.ratings,
      events: c.events,
      summaries: c.summaries,
      recipes: recipes.data,
      store: c.store ? { storeId: c.store.storeId, name: c.store.name } : null,
    },
    {
      specials: pricingStatus().enabled
        ? async (store, terms) => {
            const r = await findSpecials({ storeId: store.storeId, terms }, `household:${c.householdId}`);
            return r.ok ? { ok: true, specials: r.data.specials, checkedAt: r.data.fetchedAt } : { ok: false, message: r.message };
          }
        : undefined,
      plan: async (input) => {
        const r = await planWeekWithClaude({
          config: ai,
          input,
          skillLevel: c.profile.skillLevel,
          householdSize: c.profile.household.cookingFor,
          cacheScope: c.householdId,
        });
        const asked = r.cached || r.source === "ai" || r.notice !== null;
        if (ai && asked) {
          const { error } = await svc.from("ai_usage").insert({
            household_id: c.householdId,
            user_id: c.userId,
            feature: FEATURE,
            model: r.model ?? ai.model,
            input_tokens: r.cached ? 0 : (r.usage?.inputTokens ?? 0),
            output_tokens: r.cached ? 0 : (r.usage?.outputTokens ?? 0),
            outcome: r.cached ? "cached" : r.source === "ai" ? "ok" : "fallback",
          });
          if (error) console.error("[weekly] usage log failed", { code: (error as { code?: string }).code });
        }
        return r;
      },
    },
  );

  if ("skip" in result) {
    await server.stop(job.jobId, result.skip, true);
    summary.skipped += 1;
    return;
  }
  const { draft } = result;
  const finished = await server.finish(job.jobId, draft.plan, { ...draft.details, message: draft.message });
  if (!finished.ok) throw new Error(finished.message);
  if (finished.data.status !== "drafted") {
    summary.skipped += 1;
    return;
  }
  summary.drafted += 1;

  if (finished.data.pushUsers.length > 0) {
    const tokens = await server.pushTokens(finished.data.pushUsers);
    if (tokens.ok && tokens.data.length > 0) {
      const sent = await sendExpoPushes(
        tokens.data.map((t) => ({ to: t.token, title: "Next week's meal plan is ready", body: draft.message, data: { url: `/plan?week=${c.weekStart}` } })),
        { accessToken: process.env.EXPO_ACCESS_TOKEN || null },
      );
      summary.pushes.sent += sent.sent;
      summary.pushes.failed += sent.failed;
      if (sent.stale.length > 0) await server.forgetPushTokens(sent.stale);
    }
  }
}

/** One scheduled run. Households are drafted one at a time to stay gentle on store and AI limits. */
export async function runWeeklyDrafts(): Promise<{ ok: true; data: WeeklyRunSummary } | { ok: false; message: string }> {
  const status = weeklyDraftsStatus();
  const svc = serviceSupabase();
  if (!status.running || !svc) return { ok: false, message: status.reason ?? "Weekly drafts are off." };
  const server = createPlanningJobServer(svc);
  const claimed = await server.claim(perRun);
  if (!claimed.ok) return claimed;
  const summary: WeeklyRunSummary = { claimed: claimed.data.length, drafted: 0, skipped: 0, failed: 0, pushes: { sent: 0, failed: 0 } };
  for (const job of claimed.data) {
    try {
      await draftOne(server, svc, job, summary);
    } catch (error) {
      summary.failed += 1;
      console.error("[weekly] draft failed", { job: job.jobId, attempt: job.attempts, error: error instanceof Error ? error.message : "unknown" });
      await server.stop(job.jobId, job.attempts >= 3 ? "We couldn't draft next week this time. Plan as usual — we'll try again next week." : "Drafting hit a problem; we'll try again shortly.", false);
    }
  }
  return { ok: true, data: summary };
}
