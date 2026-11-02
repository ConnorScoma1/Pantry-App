"use client";

import { createLocalHouseholdLifeRepository, subscribeToAttendance, type HouseholdLifeRepository } from "@kitchen-pantry/database";
import { addDays, dayAttendance, summarizeActivity, type ActivityItem, type DayAttendance } from "@kitchen-pantry/meal-planner";
import type { AttendanceData } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { activityAction, attendanceAction, setEatingAction, setGuestsAction, setPortionAction } from "@/app/(app)/household/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabaseRepo: HouseholdLifeRepository = {
  attendance: (f, t) => attendanceAction(f, t),
  setEating: (d, e) => setEatingAction(d, e),
  setGuests: (d, n) => setGuestsAction(d, n),
  setPortion: (p) => setPortionAction(p),
  activity: (m) => activityAction(m),
};
let preview: HouseholdLifeRepository | null = null;
function useLifeRepo() {
  const { mode } = useProfile();
  return mode === "preview" ? (preview ??= createLocalHouseholdLifeRepository(browserStorage)) : supabaseRepo;
}

/**
 * Who's eating each night of a week (from `weekStart`), with suggested
 * servings. Each person answers for themselves; guests are shared. Live:
 * another member's answer shows up without a reload.
 */
export function useAttendance(weekStart: string) {
  const repo = useLifeRepo();
  const { profile } = useProfile();
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

  // Realtime: someone else changed their answer or the guests.
  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) return;
    const sub = subscribeToAttendance(client as never, () => void reload());
    return () => sub.unsubscribe();
  }, [reload]);

  const forDay = useCallback(
    (day: string): DayAttendance | null => (data ? dayAttendance(data, day, profile.household.cookingFor) : null),
    [data, profile.household.cookingFor],
  );

  const run = useCallback(
    async (p: Promise<{ ok: boolean; message?: string }>) => {
      const r = await p;
      if (!r.ok) setError(r.message ?? "Couldn't save that.");
      else setError(null);
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

export function useActivity(max = 30) {
  const repo = useLifeRepo();
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
  return useMemo(() => ({ items, error, reload }), [items, error, reload]);
}
