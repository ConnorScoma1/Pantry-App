import "server-only";
import { createPlanningJobServer, runUseSoonReminders } from "@kitchen-pantry/database";
import { sendExpoPushes } from "@kitchen-pantry/integrations";
import { serviceRoleConfigured, serviceSupabase } from "@/lib/supabase/service";
import { isCronRequest } from "./weekly";

/**
 * Use-soon reminders (spec 01 Phase 6) — a scheduled server job.
 *
 * Something outside the app calls GET /api/jobs/use-soon every hour with
 * `Authorization: Bearer $CRON_SECRET`. The database picks who to remind:
 * people whose local time is between 8 AM and 8 PM, who haven't been
 * reminded today, and whose active household has non-staple items due today
 * or tomorrow (by the date the household entered). It leaves a notice in the
 * bell and returns the phone notifications to send, which go out here.
 *
 * OFF until USE_SOON_REMINDERS=on, a CRON_SECRET of at least 32 characters
 * and the service role key are set.
 */
export function useSoonStatus(): { running: boolean; reason: string | null } {
  if (process.env.USE_SOON_REMINDERS !== "on") return { running: false, reason: "Use-soon reminders aren't switched on on the server yet (see the README)." };
  if ((process.env.CRON_SECRET ?? "").length < 32) return { running: false, reason: "The server's CRON_SECRET isn't set (see the README)." };
  if (!serviceRoleConfigured()) return { running: false, reason: "The server's Supabase service role key isn't set (see the README)." };
  return { running: true, reason: null };
}

export { isCronRequest };

export interface UseSoonSummary {
  people: number;
  notices: number;
  pushes: { sent: number; failed: number };
}

export async function runUseSoon(): Promise<{ ok: true; data: UseSoonSummary } | { ok: false; message: string }> {
  const status = useSoonStatus();
  const svc = serviceSupabase();
  if (!status.running || !svc) return { ok: false, message: status.reason ?? "Use-soon reminders are off." };
  const run = await runUseSoonReminders(svc, Number(process.env.USE_SOON_PER_RUN ?? 500) || 500);
  if (!run.ok) return run;
  const summary: UseSoonSummary = { people: run.data.people, notices: run.data.notices, pushes: { sent: 0, failed: 0 } };
  if (run.data.push.length === 0) return { ok: true, data: summary };

  const server = createPlanningJobServer(svc);
  const byUser = new Map(run.data.push.map((p) => [p.userId, p]));
  const ids = [...byUser.keys()];
  // 50 people at a time: at most 10 phones each, so one read stays under the API's 1,000-row page.
  for (let i = 0; i < ids.length; i += 50) {
    const tokens = await server.pushTokens(ids.slice(i, i + 50));
    if (!tokens.ok || tokens.data.length === 0) continue;
    const sent = await sendExpoPushes(
      tokens.data.map((t) => {
        const p = byUser.get(t.userId)!;
        return { to: t.token, title: p.title, body: p.body, data: { url: "/kitchen" } };
      }),
      { accessToken: process.env.EXPO_ACCESS_TOKEN || null },
    );
    summary.pushes.sent += sent.sent;
    summary.pushes.failed += sent.failed;
    if (sent.stale.length > 0) await server.forgetPushTokens(sent.stale);
  }
  return { ok: true, data: summary };
}
