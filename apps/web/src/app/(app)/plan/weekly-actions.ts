"use server";

import { createSupabaseWeeklyPlanningRepository, type Result, type WeeklyPlanningRepository } from "@kitchen-pantry/database";
import type { AppNotification, NotificationPreferences, PlanningJob, WeeklyPlanningSettings } from "@kitchen-pantry/shared-types";
import { weeklyDraftsStatus } from "@/lib/planning/weekly";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Weekly drafts settings and notices, read and written as the signed-in
 * person (row-level security applies). Jobs themselves only run on the
 * server's schedule (lib/planning/weekly.ts).
 */
async function withRepo<T>(fn: (repo: WeeklyPlanningRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Please sign in again." };
  return fn(createSupabaseWeeklyPlanningRepository(asSupabaseLike(supabase), async () => user.id));
}

/** Whether the server job is set up (so the page can be honest when it isn't). */
export async function weeklyServerStatusAction(): Promise<{ running: boolean; reason: string | null }> {
  return weeklyDraftsStatus();
}
export async function weeklySettingsAction(): Promise<Result<WeeklyPlanningSettings>> {
  return withRepo((r) => r.settings());
}
export async function saveWeeklySettingsAction(input: unknown): Promise<Result<WeeklyPlanningSettings>> {
  return withRepo((r) => r.saveSettings(input));
}
export async function weeklyJobAction(weekStart: string): Promise<Result<PlanningJob | null>> {
  return withRepo((r) => r.jobForWeek(String(weekStart)));
}
export async function latestWeeklyJobAction(): Promise<Result<PlanningJob | null>> {
  return withRepo((r) => r.latestJob());
}
export async function notificationsAction(): Promise<Result<AppNotification[]>> {
  return withRepo((r) => r.notifications());
}
export async function markNotificationsReadAction(ids: string[]): Promise<Result<null>> {
  return withRepo((r) => r.markRead(Array.isArray(ids) ? ids.map(String) : []));
}
export async function notificationPrefsAction(): Promise<Result<NotificationPreferences>> {
  return withRepo((r) => r.preferences());
}
export async function saveNotificationPrefsAction(input: unknown): Promise<Result<NotificationPreferences>> {
  return withRepo((r) => r.savePreferences(input));
}
