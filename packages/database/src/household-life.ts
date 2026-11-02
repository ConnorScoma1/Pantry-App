import type { ActivityEvent, ActivityKind, AttendanceData, IsoDate, PantryOutcome } from "@kitchen-pantry/shared-types";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { LOCAL_PANTRY_LOG_KEY } from "./kitchen";

/**
 * Shared household, part 2: who's eating (each person answers for
 * themselves; guests are shared), personal portion size, and the
 * household's recent activity.
 */
export interface HouseholdLifeRepository {
  attendance(from: IsoDate, to: IsoDate): Promise<Result<AttendanceData>>;
  /** null clears your answer (back to the default: eating). */
  setEating(day: IsoDate, eating: boolean | null): Promise<Result<null>>;
  setGuests(day: IsoDate, guests: number): Promise<Result<null>>;
  setPortion(portion: number): Promise<Result<number>>;
  activity(max?: number): Promise<Result<ActivityEvent[]>>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set<ActivityKind>(["pantry_added", "pantry_consumed", "pantry_discarded", "pantry_expired", "grocery_added", "grocery_checked", "rated", "cart_ordered", "shop_logged", "plan_confirmed", "plan_drafted"]);
const SAVE_FAILED = "Couldn't save that. Please try again.";

function parseAttendance(raw: unknown): AttendanceData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (x: unknown) => (Array.isArray(x) ? (x as Array<Record<string, unknown>>) : []);
  return {
    members: arr(r.members)
      .filter((m) => typeof m.userId === "string")
      .map((m) => ({ userId: String(m.userId), name: typeof m.name === "string" ? m.name.slice(0, 80) : "Household member", isYou: m.isYou === true, portion: Math.min(3, Math.max(0.25, Number(m.portion) || 1)) })),
    answers: arr(r.answers)
      .filter((a) => typeof a.userId === "string" && typeof a.day === "string" && DAY.test(a.day) && typeof a.eating === "boolean")
      .map((a) => ({ day: String(a.day), userId: String(a.userId), eating: a.eating as boolean })),
    guests: arr(r.guests)
      .filter((g) => typeof g.day === "string" && DAY.test(g.day) && Number.isInteger(Number(g.guests)))
      .map((g) => ({ day: String(g.day), guests: Math.min(20, Math.max(0, Number(g.guests))) })),
  };
}

function parseActivity(raw: unknown): ActivityEvent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .filter((e) => KINDS.has(e.kind as ActivityKind) && typeof e.at === "string")
    .map((e) => ({
      kind: e.kind as ActivityKind,
      actorName: typeof e.actorName === "string" ? e.actorName.slice(0, 80) : null,
      isYou: e.isYou === true,
      at: String(e.at),
      subject: typeof e.subject === "string" ? e.subject.slice(0, 160) : "",
      detail: typeof e.detail === "string" ? e.detail.slice(0, 40) : null,
    }));
}

function validDay(day: string): boolean {
  return DAY.test(day);
}

export function createSupabaseHouseholdLifeRepository(db: SupabaseLike): HouseholdLifeRepository {
  return {
    async attendance(from, to) {
      if (!validDay(from) || !validDay(to)) return { ok: false, message: "Choose a week." };
      const { data, error } = await db.rpc("meal_attendance_range", { from_day: from, to_day: to });
      if (error) return dbFailure("attendance", error, "Couldn't load who's eating.");
      return { ok: true, data: parseAttendance(data) };
    },
    async setEating(day, eating) {
      if (!validDay(day)) return { ok: false, message: "Choose a day." };
      const { error } = await db.rpc("set_meal_attendance", { target_day: day, is_eating: eating });
      if (error) return dbFailure("set attendance", error, SAVE_FAILED);
      return { ok: true, data: null };
    },
    async setGuests(day, guests) {
      if (!validDay(day) || !Number.isInteger(guests) || guests < 0 || guests > 20) return { ok: false, message: "Guests must be between 0 and 20." };
      const { error } = await db.rpc("set_meal_guests", { target_day: day, guest_count: guests });
      if (error) return dbFailure("set guests", error, SAVE_FAILED);
      return { ok: true, data: null };
    },
    async setPortion(portion) {
      if (!Number.isFinite(portion) || portion < 0.25 || portion > 3) return { ok: false, message: "Choose between a quarter and three servings." };
      const { data, error } = await db.rpc("set_my_portion", { new_portion: portion });
      if (error) return dbFailure("set portion", error, SAVE_FAILED);
      return { ok: true, data: Number(data) };
    },
    async activity(max = 40) {
      const { data, error } = await db.rpc("household_activity", { max_items: Math.min(Math.max(1, Math.round(max)), 100) });
      if (error) return dbFailure("household activity", error, "Couldn't load recent activity.");
      return { ok: true, data: parseActivity(data) };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode: just you (plus the rest of the household without accounts).
// ---------------------------------------------------------------------------
export const LOCAL_ATTENDANCE_KEY = "kp-preview-attendance-v1";

interface LocalAttendance {
  portion: number;
  answers: Record<string, boolean>;
  guests: Record<string, number>;
}

export function createLocalHouseholdLifeRepository(storage: KeyValueStorage): HouseholdLifeRepository {
  async function read(): Promise<LocalAttendance> {
    try {
      const raw = await storage.getItem(LOCAL_ATTENDANCE_KEY);
      const v = raw ? (JSON.parse(raw) as Partial<LocalAttendance>) : {};
      return { portion: Number(v.portion) || 1, answers: v.answers ?? {}, guests: v.guests ?? {} };
    } catch {
      return { portion: 1, answers: {}, guests: {} };
    }
  }
  const write = (v: LocalAttendance) => storage.setItem(LOCAL_ATTENDANCE_KEY, JSON.stringify(v));
  return {
    async attendance(from, to) {
      const v = await read();
      const inRange = (d: string) => d >= from && d <= to;
      return {
        ok: true,
        data: {
          members: [{ userId: "you", name: "You", isYou: true, portion: v.portion }],
          answers: Object.entries(v.answers).filter(([d]) => inRange(d)).map(([day, eating]) => ({ day, userId: "you", eating })),
          guests: Object.entries(v.guests).filter(([d, n]) => inRange(d) && n > 0).map(([day, guests]) => ({ day, guests })),
        },
      };
    },
    async setEating(day, eating) {
      if (!validDay(day)) return { ok: false, message: "Choose a day." };
      const v = await read();
      if (eating === null) delete v.answers[day];
      else v.answers[day] = eating;
      await write(v);
      return { ok: true, data: null };
    },
    async setGuests(day, guests) {
      if (!validDay(day) || !Number.isInteger(guests) || guests < 0 || guests > 20) return { ok: false, message: "Guests must be between 0 and 20." };
      const v = await read();
      if (guests === 0) delete v.guests[day];
      else v.guests[day] = guests;
      await write(v);
      return { ok: true, data: null };
    },
    async setPortion(portion) {
      if (!Number.isFinite(portion) || portion < 0.25 || portion > 3) return { ok: false, message: "Choose between a quarter and three servings." };
      const v = await read();
      v.portion = Math.round(portion * 4) / 4;
      await write(v);
      return { ok: true, data: v.portion };
    },
    async activity(max = 40) {
      try {
        const raw = await storage.getItem(LOCAL_PANTRY_LOG_KEY);
        const log = raw ? (JSON.parse(raw) as PantryOutcome[]) : [];
        return {
          ok: true,
          data: log.slice(0, max).map((e) => ({ kind: `pantry_${e.reason}` as ActivityKind, actorName: "You", isYou: true, at: e.at, subject: e.itemName, detail: null })),
        };
      } catch {
        return { ok: true, data: [] };
      }
    },
  };
}
