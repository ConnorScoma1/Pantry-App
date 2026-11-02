"use client";

import { createLocalWeeklyPlanningRepository, DEFAULT_NOTIFICATION_PREFERENCES, type WeeklyPlanningRepository } from "@kitchen-pantry/database";
import { DEFAULT_WEEKLY_PLANNING, weeklySchedule } from "@kitchen-pantry/meal-planner";
import type { AppNotification, NotificationPreferences, PlanningJob, WeeklyPlanningSettings } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  latestWeeklyJobAction,
  markNotificationsReadAction,
  notificationPrefsAction,
  notificationsAction,
  remindersStatusAction,
  saveNotificationPrefsAction,
  saveWeeklySettingsAction,
  weeklyJobAction,
  weeklyServerStatusAction,
  weeklySettingsAction,
} from "@/app/(app)/plan/weekly-actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";

const supabaseRepo: WeeklyPlanningRepository = {
  settings: () => weeklySettingsAction(),
  saveSettings: (i) => saveWeeklySettingsAction(i),
  jobForWeek: (w) => weeklyJobAction(w),
  latestJob: () => latestWeeklyJobAction(),
  notifications: () => notificationsAction(),
  markRead: (ids) => markNotificationsReadAction(ids),
  preferences: () => notificationPrefsAction(),
  savePreferences: (i) => saveNotificationPrefsAction(i),
  registerPushToken: async () => ({ ok: false, message: "Phone notifications are set up in the phone app." }),
  unregisterPushToken: async () => ({ ok: true, data: null }),
};

let preview: WeeklyPlanningRepository | null = null;
function useRepo(): { repo: WeeklyPlanningRepository; mode: "preview" | "supabase" } {
  const { mode } = useProfile();
  if (mode === "preview") {
    preview ??= createLocalWeeklyPlanningRepository(browserStorage);
    return { repo: preview, mode };
  }
  return { repo: supabaseRepo, mode: "supabase" };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_WEEKLY_PLANNING.timeZone;
  } catch {
    return DEFAULT_WEEKLY_PLANNING.timeZone;
  }
}

/** The household's weekly draft settings, plus this person's notification choices. */
export function useWeeklyPlanning() {
  const { repo, mode } = useRepo();
  const [settings, setSettings] = useState<WeeklyPlanningSettings>(DEFAULT_WEEKLY_PLANNING);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [server, setServer] = useState<{ running: boolean; reason: string | null }>({ running: false, reason: null });
  const [latest, setLatest] = useState<PlanningJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repo.settings(),
      repo.preferences(),
      repo.latestJob(),
      mode === "supabase" ? weeklyServerStatusAction() : Promise.resolve({ running: false, reason: "Preview mode has no server, so drafts don't run here." }),
    ]).then(([s, p, j, status]) => {
      if (cancelled) return;
      if (s.ok) setSettings(s.data);
      if (p.ok) setPrefs(p.data);
      if (j.ok) setLatest(j.data);
      setServer(status);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, mode]);

  const save = useCallback(
    async (patch: Partial<Pick<WeeklyPlanningSettings, "enabled" | "runDay" | "runHour" | "timeZone" | "mode">>) => {
      const next = { ...settings, ...patch };
      // Turning drafts on: use this device's time zone so "9 AM" means 9 AM here.
      if (patch.enabled && !settings.enabled && !patch.timeZone) next.timeZone = browserTimeZone();
      setSettings(next);
      setSaving(true);
      setError(null);
      const r = await repo.saveSettings({ enabled: next.enabled, runDay: next.runDay, runHour: next.runHour, timeZone: next.timeZone, mode: next.mode });
      setSaving(false);
      if (r.ok) setSettings(r.data);
      else {
        setError(r.message);
        setSettings(settings);
      }
    },
    [repo, settings],
  );

  const savePrefs = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      const before = prefs;
      setPrefs({ ...prefs, ...patch });
      // Only the changed switch is saved; the answer is the full, current settings.
      const r = await repo.savePreferences(patch);
      if (r.ok) setPrefs(r.data);
      else {
        setError(r.message);
        setPrefs(before);
      }
    },
    [repo, prefs],
  );

  const schedule = useMemo(() => weeklySchedule(settings, new Date()), [settings]);
  return { mode, loading, saving, error, settings, prefs, server, latest, schedule, save, savePrefs };
}

/**
 * Use-soon reminders (just this person): a notice in the bell and/or on the
 * phone when kitchen items are due today or tomorrow. Saving also records
 * this device's time zone, so reminders come in this person's daytime.
 */
export function useReminders() {
  const { repo, mode } = useRepo();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [server, setServer] = useState<{ running: boolean; reason: string | null }>({ running: false, reason: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repo.preferences(),
      mode === "supabase" ? remindersStatusAction() : Promise.resolve({ running: false, reason: "Preview mode has no server, so reminders aren't sent — Home and My Kitchen still show what to use soon." }),
    ]).then(([p, status]) => {
      if (cancelled) return;
      if (p.ok) setPrefs(p.data);
      setServer(status);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, mode]);

  const save = useCallback(
    async (patch: Partial<Pick<NotificationPreferences, "useSoonInApp" | "useSoonPush">>) => {
      if (loading) return;
      const before = prefs;
      setPrefs({ ...prefs, ...patch });
      setError(null);
      const r = await repo.savePreferences({ ...patch, timeZone: browserTimeZone() });
      if (r.ok) setPrefs(r.data);
      else {
        setError(r.message);
        setPrefs(before);
      }
    },
    [repo, prefs, loading],
  );
  return { mode, loading, error, prefs, server, save };
}

/** What the weekly draft job did for one week (for the banner on the plan). */
export function useWeeklyJob(weekStart: string) {
  const { repo } = useRepo();
  const [job, setJob] = useState<PlanningJob | null>(null);
  useEffect(() => {
    let cancelled = false;
    void repo.jobForWeek(weekStart).then((r) => {
      if (!cancelled && r.ok) setJob(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, weekStart]);
  return job;
}

/** This person's notices (plan ready, use soon). Refreshes when the tab comes back into view. */
export function useNotifications() {
  const { repo } = useRepo();
  const [items, setItems] = useState<AppNotification[]>([]);
  const refresh = useCallback(async () => {
    const r = await repo.notifications();
    if (r.ok) setItems(r.data);
  }, [repo]);
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);
  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const now = new Date().toISOString();
      setItems((list) => list.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: now } : n)));
      await repo.markRead(ids);
    },
    [repo],
  );
  return { items, unread: items.filter((n) => !n.readAt).length, refresh, markRead };
}
