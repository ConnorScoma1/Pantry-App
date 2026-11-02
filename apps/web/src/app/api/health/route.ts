import { NextResponse } from "next/server";
import { pricingStatus } from "@/lib/pricing/server";
import { weeklyDraftsStatus } from "@/lib/planning/weekly";
import { serviceRoleConfigured } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * For uptime monitors: is the app up, and which optional parts are switched
 * on? Says only on/off — never a key, URL or count. No sign-in needed.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      time: new Date().toISOString(),
      features: {
        database: isSupabaseConfigured,
        serverJobs: serviceRoleConfigured(),
        ai: Boolean(process.env.ANTHROPIC_API_KEY),
        storePrices: pricingStatus().enabled,
        weeklyDrafts: weeklyDraftsStatus().running,
        inviteEmail: Boolean(process.env.RESEND_API_KEY && process.env.INVITE_EMAIL_FROM),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
