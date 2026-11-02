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
  type InviteDetails,
  type Result,
} from "@kitchen-pantry/database";
import type { ActivityEvent, AttendanceData } from "@kitchen-pantry/shared-types";
import { revalidatePath } from "next/cache";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
export async function createInviteAction(input: unknown): Promise<Result<CreatedInvite>> {
  return run((r) => r.createInvite(input));
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
