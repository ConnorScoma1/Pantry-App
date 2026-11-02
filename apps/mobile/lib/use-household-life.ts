import { subscribeToAttendance } from "@kitchen-pantry/database";
import { addDays, dayAttendance, summarizeActivity, type ActivityItem, type DayAttendance } from "@kitchen-pantry/meal-planner";
import type { AttendanceData } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useApp, useProfile } from "./app-state";

/** Who's eating each night of a week, live (same rules as the web). */
export function useAttendance(weekStart: string) {
  const { life: repo, realtime } = useApp();
  const profile = useProfile();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const to = addDays(weekStart, 6);

  const reload = useCallback(async () => {
    const r = await repo.attendance(weekStart, to);
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, [repo, weekStart, to]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!realtime) return;
    const sub = subscribeToAttendance(realtime, () => void reload());
    return () => sub.unsubscribe();
  }, [realtime, reload]);

  const forDay = useCallback(
    (day: string): DayAttendance | null => (data ? dayAttendance(data, day, profile.household.cookingFor) : null),
    [data, profile.household.cookingFor],
  );
  const run = useCallback(
    async (p: Promise<{ ok: boolean; message?: string }>) => {
      const r = await p;
      setError(r.ok ? null : (r.message ?? "Couldn't save that."));
      await reload();
    },
    [reload],
  );
  return {
    data,
    error,
    forDay,
    setEating: (day: string, eating: boolean | null) => run(repo.setEating(day, eating)),
    setGuests: (day: string, guests: number) => run(repo.setGuests(day, Math.max(0, Math.min(20, guests)))),
    setPortion: (portion: number) => run(repo.setPortion(portion)),
    you: data?.members.find((m) => m.isYou) ?? null,
  };
}

export function useActivity(max = 25) {
  const { life: repo } = useApp();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const r = await repo.activity(80);
    if (r.ok) setItems(summarizeActivity(r.data, max));
    else setError(r.message);
  }, [repo, max]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { items, error, reload };
}
