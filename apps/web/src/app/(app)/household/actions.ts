"use server";

import {
  createSupabaseHouseholdLifeRepository,
  createSupabaseHouseholdRepository,
  type HouseholdLifeRepository,
  type CreatedInvite,
  type HouseholdInvite,
  type HouseholdMember,
  type HouseholdRepository,
  type HouseholdSummary,
  inviteLink,
  type InviteDetails,
  type Result,
} from "@kitchen-pantry/database";
import type { ActivityEvent, AttendanceData } from "@kitchen-pantry/shared-types";
import { inviteEmail, sendEmail } from "@kitchen-pantry/integrations";
import { revalidatePath } from "next/cache";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured, siteUrl } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Household membership and invitations. Every check (owner only, seat
 * limit, invite expiry, single use, email match) happens in the database
 * functions; these actions only require a signed-in user.
 */
async function run<T>(fn: (repo: HouseholdRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Sharing needs accounts. Connect Supabase (see the README)." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please sign in first." };
  return fn(createSupabaseHouseholdRepository(asSupabaseLike(supabase)));
}

/** Membership changes affect every page (household data, profile). */
async function changed<T>(result: Promise<Result<T>>): Promise<Result<T>> {
  const r = await result;
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function membersAction(): Promise<Result<HouseholdMember[]>> {
  return run((r) => r.members());
}
export async function householdsAction(): Promise<Result<HouseholdSummary[]>> {
  return run((r) => r.households());
}
export async function invitesAction(): Promise<Result<HouseholdInvite[]>> {
  return run((r) => r.invites());
}
/**
 * Create an invite. When an email address is given and the server has an
 * email provider (RESEND_API_KEY + INVITE_EMAIL_FROM), the link is emailed
 * from the server too. The link is built from NEXT_PUBLIC_SITE_URL, never
 * from the request, and each person can send at most 5 invite emails an hour
 * and 10 a day (counted in the database, so it holds across servers).
 */
export async function createInviteAction(input: unknown): Promise<Result<CreatedInvite & { emailed: boolean }>> {
  return run(async (r) => {
    const created = await r.createInvite(input);
    if (!created.ok) return created;
    const to = typeof (input as { email?: unknown } | null)?.email === "string" ? String((input as { email: string }).email).trim().toLowerCase() : "";
    const emailed = to ? await emailInvite(r, to, created.data, await emailsToday()) : false;
    return { ok: true, data: { ...created.data, emailed } };
  });
}

/** Invites with an email address this person created in the last day (including this one); null if unknown. */
async function emailsToday(): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("invite_emails_today");
  return error ? null : Number(data ?? 0);
}

const DAILY_INVITE_EMAILS = 10;
const sentBy = new Map<string, number[]>();
async function emailInvite(repo: HouseholdRepository, to: string, invite: CreatedInvite, today: number | null): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.INVITE_EMAIL_FROM ?? "";
  if (!apiKey || !from || !siteUrl.startsWith("https://")) return false;
  if (today === null || today > DAILY_INVITE_EMAILS) return false; // fail closed: the link still works when shared by hand
  const [members, households] = await Promise.all([repo.members(), repo.households()]);
  const me = members.ok ? members.data.find((m) => m.isYou) : undefined;
  const key = me?.userId ?? "unknown";
  const now = Date.now();
  const recent = (sentBy.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 5) return false;
  sentBy.set(key, [...recent, now]);
  const household = households.ok ? households.data.find((h) => h.isActive)?.name : undefined;
  const days = Math.max(1, Math.round((Date.parse(invite.expiresAt) - now) / 86_400_000));
  const result = await sendEmail(
    inviteEmail({ to, link: inviteLink(siteUrl, invite.token), householdName: household ?? "a household", inviterName: me?.displayName ?? "Someone", days }),
    { apiKey, from },
  );
  if (!result.ok) console.error("[invite] email not sent", { reason: result.reason });
  return result.ok;
}
export async function revokeInviteAction(id: unknown): Promise<Result<null>> {
  return run((r) => r.revokeInvite(id));
}
export async function inviteDetailsAction(token: unknown): Promise<Result<InviteDetails>> {
  return run((r) => r.inviteDetails(token));
}
export async function acceptInviteAction(token: unknown): Promise<Result<{ householdId: string }>> {
  return changed(run((r) => r.acceptInvite(token)));
}
export async function removeMemberAction(userId: unknown): Promise<Result<null>> {
  return changed(run((r) => r.removeMember(userId)));
}
export async function leaveHouseholdAction(): Promise<Result<null>> {
  return changed(run((r) => r.leave()));
}
export async function transferOwnershipAction(userId: unknown): Promise<Result<null>> {
  return changed(run((r) => r.transferOwnership(userId)));
}
export async function switchHouseholdAction(id: unknown): Promise<Result<null>> {
  return changed(run((r) => r.switchHousehold(id)));
}
export async function setDisplayNameAction(name: unknown): Promise<Result<null>> {
  return run((r) => r.setDisplayName(name));
}
export async function renameHouseholdAction(id: unknown, name: unknown): Promise<Result<null>> {
  return run((r) => r.rename(id, name));
}

// ---------------------------------------------------------------------------
// Who's eating, portions and the activity feed (milestone 15)
// ---------------------------------------------------------------------------
async function life<T>(fn: (repo: HouseholdLifeRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Sharing needs accounts. Connect Supabase (see the README)." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please sign in first." };
  return fn(createSupabaseHouseholdLifeRepository(asSupabaseLike(supabase)));
}

export async function attendanceAction(from: string, to: string): Promise<Result<AttendanceData>> {
  return life((r) => r.attendance(String(from), String(to)));
}
export async function setEatingAction(day: string, eating: boolean | null): Promise<Result<null>> {
  return life((r) => r.setEating(String(day), typeof eating === "boolean" ? eating : null));
}
export async function setGuestsAction(day: string, guests: number): Promise<Result<null>> {
  return life((r) => r.setGuests(String(day), Number(guests)));
}
export async function setPortionAction(portion: number): Promise<Result<number>> {
  return life((r) => r.setPortion(Number(portion)));
}
export async function activityAction(max = 40): Promise<Result<ActivityEvent[]>> {
  return life((r) => r.activity(Number(max)));
}
