import { DEFAULT_NOTIFICATION_PREFERENCES, type WeeklyPlanningRepository } from "@kitchen-pantry/database";
import { DEFAULT_WEEKLY_PLANNING, weeklySchedule } from "@kitchen-pantry/meal-planner";
import type { AppNotification, NotificationPreferences, PlanningJob, WeeklyPlanningSettings } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState as RNAppState } from "react-native";
import { useApp } from "./app-state";
import { apiUrl } from "./config";
import { hasPushToken, pushSupport, registerForPush, unregisterPush } from "./push";

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_WEEKLY_PLANNING.timeZone;
  } catch {
    return DEFAULT_WEEKLY_PLANNING.timeZone;
  }
}

/**
 * Phone notifications are per person but delivered per phone. Turning one on
 * registers THIS phone (and asks permission) — also when it's already on for
 * the account from another phone. After saving, if the account has no phone
 * notifications left on (as the server now says), this phone is forgotten.
 */
function usePhonePush(repo: WeeklyPlanningRepository) {
  const [thisPhone, setThisPhone] = useState(false);
  useEffect(() => {
    void hasPushToken().then(setThisPhone);
  }, []);
  const before = useCallback(
    async (patch: Partial<NotificationPreferences>): Promise<string | null> => {
      if (patch.planReadyPush !== true && patch.useSoonPush !== true) return null;
      const reg = await registerForPush(repo);
      if (!reg.ok) return reg.message;
      setThisPhone(true);
      return null;
    },
    [repo],
  );
  const after = useCallback(
    async (saved: NotificationPreferences) => {
      if (!saved.planReadyPush && !saved.useSoonPush) {
        await unregisterPush(repo);
        setThisPhone(false);
      }
    },
    [repo],
  );
  return useMemo(() => ({ thisPhone, before, after }), [thisPhone, before, after]);
}

/** Weekly drafts on the phone — same settings and rules as the web. */
export function useWeeklyPlanning() {
  const { mode, weekly: repo, accessToken } = useApp();
  const [settings, setSettings] = useState<WeeklyPlanningSettings>(DEFAULT_WEEKLY_PLANNING);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [server, setServer] = useState<{ running: boolean; reason: string | null }>({ running: false, reason: null });
  const [latest, setLatest] = useState<PlanningJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, p, j] = await Promise.all([repo.settings(), repo.preferences(), repo.latestJob()]);
      let status = { running: false, reason: "Preview mode has no server, so drafts don't run here." as string | null };
      if (mode === "supabase") {
        status = { running: false, reason: "The Kitchen Pantry server isn't set up in this app (EXPO_PUBLIC_API_URL), so we can't check the drafting job." };
        const token = await accessToken();
        if (apiUrl && token) {
          try {
            const res = await fetch(`${apiUrl}/api/planning/status`, { headers: { Authorization: `Bearer ${token}` } });
            const body = (await res.json()) as { running?: unknown; reason?: unknown };
            status = { running: body.running === true, reason: typeof body.reason === "string" ? body.reason : null };
          } catch {
            status = { running: false, reason: "Couldn't reach the Kitchen Pantry server to check the drafting job." };
          }
        }
      }
      if (cancelled) return;
      if (s.ok) setSettings(s.data);
      if (p.ok) setPrefs(p.data);
      if (j.ok) setLatest(j.data);
      setServer(status);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, mode, accessToken]);

  const save = useCallback(
    async (patch: Partial<Pick<WeeklyPlanningSettings, "enabled" | "runDay" | "runHour" | "timeZone" | "mode">>) => {
      const next = { ...settings, ...patch };
      if (patch.enabled && !settings.enabled && !patch.timeZone) next.timeZone = deviceTimeZone();
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

  const phone = usePhonePush(repo);
  const savePrefs = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      if (loading) return;
      setError(null);
      const problem = await phone.before(patch);
      if (problem) return setError(problem);
      const prior = prefs;
      setPrefs({ ...prefs, ...patch });
      const r = await repo.savePreferences(patch);
      if (!r.ok) {
        setError(r.message);
        setPrefs(prior);
        return;
      }
      setPrefs(r.data);
      await phone.after(r.data);
    },
    [repo, prefs, loading, phone],
  );

  const schedule = useMemo(() => weeklySchedule(settings, new Date()), [settings]);
  // "On this phone" shows on only when this phone is the one receiving them.
  const shown = { ...prefs, planReadyPush: prefs.planReadyPush && phone.thisPhone, useSoonPush: prefs.useSoonPush && phone.thisPhone };
  return { mode, loading, saving, error, settings, prefs: shown, server, latest, schedule, save, savePrefs, push: pushSupport(mode) };
}

/**
 * Use-soon reminders (just this person): a notice in the app and/or on this
 * phone when kitchen items are due today or tomorrow. Saving also records
 * this phone's time zone, so reminders come in this person's daytime.
 */
export function useReminders() {
  const { mode, weekly: repo, accessToken } = useApp();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [server, setServer] = useState<{ running: boolean; reason: string | null }>({ running: false, reason: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await repo.preferences();
      let status = { running: false, reason: "Preview mode has no server, so reminders aren't sent — Home and My Kitchen still show what to use soon." as string | null };
      if (mode === "supabase") {
        status = { running: false, reason: "The Kitchen Pantry server isn't set up in this app (EXPO_PUBLIC_API_URL), so we can't check reminders." };
        const token = await accessToken();
        if (apiUrl && token) {
          try {
            const res = await fetch(`${apiUrl}/api/planning/status`, { headers: { Authorization: `Bearer ${token}` } });
            const body = (await res.json()) as { reminders?: { running?: unknown; reason?: unknown } };
            status = { running: body.reminders?.running === true, reason: typeof body.reminders?.reason === "string" ? body.reminders.reason : null };
          } catch {
            status = { running: false, reason: "Couldn't reach the Kitchen Pantry server to check reminders." };
          }
        }
      }
      if (cancelled) return;
      if (p.ok) setPrefs(p.data);
      setServer(status);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, mode, accessToken]);

  const phone = usePhonePush(repo);
  const save = useCallback(
    async (patch: Partial<Pick<NotificationPreferences, "useSoonInApp" | "useSoonPush">>) => {
      if (loading) return;
      setError(null);
      const problem = await phone.before(patch);
      if (problem) return setError(problem);
      const prior = prefs;
      setPrefs({ ...prefs, ...patch });
      const r = await repo.savePreferences({ ...patch, timeZone: deviceTimeZone() });
      if (!r.ok) {
        setError(r.message);
        setPrefs(prior);
        return;
      }
      setPrefs(r.data);
      await phone.after(r.data);
    },
    [repo, prefs, loading, phone],
  );
  const shown = { ...prefs, planReadyPush: prefs.planReadyPush && phone.thisPhone, useSoonPush: prefs.useSoonPush && phone.thisPhone };
  return { mode, loading, error, prefs: shown, server, save, push: pushSupport(mode) };
}

export function useWeeklyJob(weekStart: string) {
  const { weekly: repo } = useApp();
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

/** This person's notices; refreshed whenever the app comes back to the front. */
export function useNotifications() {
  const { weekly: repo } = useApp();
  const [items, setItems] = useState<AppNotification[]>([]);
  const refresh = useCallback(async () => {
    const r = await repo.notifications();
    if (r.ok) setItems(r.data);
  }, [repo]);
  useEffect(() => {
    void refresh();
    const sub = RNAppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
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
