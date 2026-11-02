import { NextResponse } from "next/server";
import { isCronRequest, runTrialEnding, runUseSoon, useSoonStatus } from "@/lib/planning/reminders";

/**
 * Use-soon reminders job. Call it hourly with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron, or pg_cron + pg_net — README). Safe to call more often: each
 * person is reminded at most once a day, and only in their daytime.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!useSoonStatus().running) return NextResponse.json({ ok: false, message: "Use-soon reminders are off." }, { status: 404 });
  if (!isCronRequest(request)) return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 401 });
  const result = await runUseSoon();
  // Trial reminders ride along (nothing happens until billing is switched on).
  const trial = await runTrialEnding();
  return NextResponse.json({ ...result, trial }, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
