import { DEFAULT_NOTIFICATION_PREFERENCES } from "@kitchen-pantry/database";
import { DEFAULT_WEEKLY_PLANNING, weeklySchedule } from "@kitchen-pantry/meal-planner";
import type { AppNotification, NotificationPreferences, PlanningJob, WeeklyPlanningSettings } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState as RNAppState } from "react-native";
import { useApp } from "./app-state";
import { apiUrl } from "./config";
import { pushSupport, registerForPush, unregisterPush } from "./push";

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_WEEKLY_PLANNING.timeZone;
  } catch {
    return DEFAULT_WEEKLY_PLANNING.timeZone;
  }
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

  const savePrefs = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      const next = { ...prefs, ...patch };
      setError(null);
      // Phone notifications: this phone must register its address first (and asks permission).
      if (patch.planReadyPush === true) {
        const reg = await registerForPush(repo);
        if (!reg.ok) return setError(reg.message);
      }
      if (patch.planReadyPush === false) await unregisterPush(repo);
      setPrefs(next);
      const r = await repo.savePreferences(next);
      if (!r.ok) {
        setError(r.message);
        setPrefs(prefs);
      }
    },
    [repo, prefs],
  );

  const schedule = useMemo(() => weeklySchedule(settings, new Date()), [settings]);
  return { mode, loading, saving, error, settings, prefs, server, latest, schedule, save, savePrefs, push: pushSupport(mode) };
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
