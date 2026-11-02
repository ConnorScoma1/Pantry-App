import { NextResponse } from "next/server";
import { isCronRequest, runWeeklyDrafts, weeklyDraftsStatus } from "@/lib/planning/weekly";

/**
 * Weekly drafts job. Call it hourly with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron sends exactly that; pg_cron + pg_net can too — README).
 * Safe to call more often: each household gets at most one draft per week.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!weeklyDraftsStatus().running) return NextResponse.json({ ok: false, message: "Weekly drafts are off." }, { status: 404 });
  if (!isCronRequest(request)) return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 401 });
  const result = await runWeeklyDrafts();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
