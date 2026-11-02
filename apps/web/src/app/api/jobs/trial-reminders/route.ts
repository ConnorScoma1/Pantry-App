import { NextResponse } from "next/server";
import { isCronRequest, runTrialEnding } from "@/lib/planning/reminders";

/**
 * "Your free trial ends soon" reminders on their own (they also run with the
 * hourly use-soon and weekly-drafts jobs). Call with
 * `Authorization: Bearer $CRON_SECRET`. Does nothing until billing is
 * switched on; each person is reminded once.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: Request) {
  if ((process.env.CRON_SECRET ?? "").length < 32) return NextResponse.json({ ok: false, message: "CRON_SECRET isn't set." }, { status: 404 });
  if (!isCronRequest(request)) return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 401 });
  const result = await runTrialEnding();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
