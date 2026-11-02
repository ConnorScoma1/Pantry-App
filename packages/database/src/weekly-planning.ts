import type {
  AppNotification,
  IsoDate,
  NotificationPreferences,
  OnboardingProfile,
  PantryItem,
  PlanningJob,
  PlanningMode,
  PricingStore,
  RatingSummary,
  Recipe,
  RecipeRating,
  RecommendationEvent,
  WeeklyPlanningSettings,
} from "@kitchen-pantry/shared-types";
import { notificationPreferencesPatchSchema, notificationPreferencesSchema, pricingStoreSchema, pushTokenSchema, weeklyPlanningInputSchema } from "@kitchen-pantry/validation";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { pantryRowToItem, type PantryRow } from "./kitchen";
import { eventRowToEvent, RECIPE_SELECT, recipeRowToRecipe, ratingRowToRating, type EventRow, type RatingRow, type RecipeRow } from "./recipes";
import { parseStoredProfile } from "./rpc";

/**
 * Weekly drafts (milestone 11), shared by web and mobile.
 *  - Settings are the household's (any member can change them).
 *  - Notification preferences and notices are each person's own.
 *  - Jobs are written only by the server; members can read what happened.
 */
export interface WeeklyPlanningRepository {
  settings(): Promise<Result<WeeklyPlanningSettings>>;
  saveSettings(input: unknown): Promise<Result<WeeklyPlanningSettings>>;
  /** What the drafting job did for one week, if it ran. */
  jobForWeek(weekStart: IsoDate): Promise<Result<PlanningJob | null>>;
  latestJob(): Promise<Result<PlanningJob | null>>;
  notifications(): Promise<Result<AppNotification[]>>;
  markRead(ids: string[]): Promise<Result<null>>;
  preferences(): Promise<Result<NotificationPreferences>>;
  /** Saves only the switches in the change; returns the full, current settings. */
  savePreferences(change: unknown): Promise<Result<NotificationPreferences>>;
  registerPushToken(input: unknown): Promise<Result<null>>;
  unregisterPushToken(token: string): Promise<Result<null>>;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = { planReadyInApp: true, planReadyPush: false, useSoonInApp: true, useSoonPush: false, timeZone: null };

const DEFAULT_SETTINGS: WeeklyPlanningSettings = {
  enabled: false,
  runDay: 6,
  runHour: 9,
  timeZone: "America/Chicago",
  mode: "balanced",
  enabledByName: null,
  enabledByYou: false,
};

function settingsFrom(raw: unknown): WeeklyPlanningSettings {
  const v = (raw ?? {}) as Partial<Record<keyof WeeklyPlanningSettings, unknown>>;
  return {
    enabled: v.enabled === true,
    runDay: typeof v.runDay === "number" ? v.runDay : DEFAULT_SETTINGS.runDay,
    runHour: typeof v.runHour === "number" ? v.runHour : DEFAULT_SETTINGS.runHour,
    timeZone: typeof v.timeZone === "string" ? v.timeZone : DEFAULT_SETTINGS.timeZone,
    mode: (typeof v.mode === "string" ? v.mode : "balanced") as PlanningMode,
    enabledByName: typeof v.enabledByName === "string" ? v.enabledByName : null,
    enabledByYou: v.enabledByYou === true,
  };
}

interface JobRow {
  id: string;
  week_start: string;
  planning_mode: PlanningMode;
  status: PlanningJob["status"];
  meal_plan_id: string | null;
  message: string | null;
  details: PlanningJob["details"] | null;
  created_at: string;
  finished_at: string | null;
}
const JOB_SELECT = "id, week_start, planning_mode, status, meal_plan_id, message, details, created_at, finished_at";
const jobFromRow = (r: JobRow): PlanningJob => ({
  id: r.id,
  weekStart: r.week_start,
  mode: r.planning_mode,
  status: r.status,
  mealPlanId: r.meal_plan_id,
  message: r.message,
  details: r.details ?? {},
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

interface NoticeRow {
  id: string;
  kind: "plan_ready" | "use_soon";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
const NOTICE_SELECT = "id, kind, title, body, link, read_at, created_at";
const noticeFromRow = (r: NoticeRow): AppNotification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link && /^\/[A-Za-z0-9/_?=&.-]*$/.test(r.link) ? r.link : null,
  readAt: r.read_at,
  createdAt: r.created_at,
});

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function createSupabaseWeeklyPlanningRepository(db: SupabaseLike, userId: () => Promise<string | null>): WeeklyPlanningRepository {
  async function readPreferences(): Promise<Result<NotificationPreferences>> {
    const { data, error } = await db.from("notification_preferences").select("plan_ready_in_app, plan_ready_push, use_soon_in_app, use_soon_push, time_zone").maybeSingle();
    if (error) return dbFailure("notification preferences", error, "Couldn't load notification settings.");
    const row = data as { plan_ready_in_app: boolean; plan_ready_push: boolean; use_soon_in_app: boolean; use_soon_push: boolean; time_zone: string | null } | null;
    return {
      ok: true,
      data: row
        ? { planReadyInApp: row.plan_ready_in_app, planReadyPush: row.plan_ready_push, useSoonInApp: row.use_soon_in_app, useSoonPush: row.use_soon_push, timeZone: row.time_zone }
        : DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }
  return {
    async settings() {
      const { data, error } = await db.rpc("get_weekly_planning");
      if (error) return dbFailure("weekly planning", error, "Couldn't load weekly draft settings.");
      return { ok: true, data: settingsFrom(data) };
    },
    async saveSettings(input) {
      const parsed = weeklyPlanningInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the settings." };
      const { data, error } = await db.rpc("save_weekly_planning", { settings: parsed.data });
      if (error) return dbFailure("save weekly planning", error, "Couldn't save weekly draft settings. Please try again.");
      return { ok: true, data: settingsFrom(data) };
    },
    async jobForWeek(weekStart) {
      const { data, error } = await db.from("planning_jobs").select(JOB_SELECT).eq("week_start", weekStart).maybeSingle();
      if (error) return dbFailure("planning job", error, "Couldn't check this week's draft.");
      return { ok: true, data: data ? jobFromRow(data as JobRow) : null };
    },
    async latestJob() {
      const { data, error } = await db.from("planning_jobs").select(JOB_SELECT).order("week_start", { ascending: false }).limit(1).maybeSingle();
      if (error) return dbFailure("latest planning job", error, "Couldn't check the latest draft.");
      return { ok: true, data: data ? jobFromRow(data as JobRow) : null };
    },
    async notifications() {
      const { data, error } = await db.from("notifications").select(NOTICE_SELECT).order("created_at", { ascending: false }).limit(20);
      if (error) return dbFailure("notifications", error, "Couldn't load notifications.");
      return { ok: true, data: (data as NoticeRow[]).map(noticeFromRow) };
    },
    async markRead(ids) {
      const clean = ids.filter(isUuid).slice(0, 50);
      if (clean.length === 0) return { ok: true, data: null };
      const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).in("id", clean).is("read_at", null);
      if (error) return dbFailure("mark notifications read", error, "Couldn't update notifications.");
      return { ok: true, data: null };
    },
    preferences: readPreferences,
    async savePreferences(input) {
      const parsed = notificationPreferencesPatchSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Please check the notification settings." };
      const uid = await userId();
      if (!uid) return { ok: false, message: "Please sign in again." };
      const c = parsed.data;
      const row: Record<string, unknown> = { user_id: uid, updated_at: new Date().toISOString() };
      if (c.planReadyInApp !== undefined) row.plan_ready_in_app = c.planReadyInApp;
      if (c.planReadyPush !== undefined) row.plan_ready_push = c.planReadyPush;
      if (c.useSoonInApp !== undefined) row.use_soon_in_app = c.useSoonInApp;
      if (c.useSoonPush !== undefined) row.use_soon_push = c.useSoonPush;
      if (c.timeZone !== undefined) row.time_zone = c.timeZone;
      // Only the columns sent are changed (the rest keep their saved values or defaults).
      let { error } = await db.from("notification_preferences").upsert(row, { onConflict: "user_id" });
      if (error && error.code === "23514" && "time_zone" in row) {
        // A zone name the database doesn't know: keep the switches, skip the zone.
        delete row.time_zone;
        ({ error } = await db.from("notification_preferences").upsert(row, { onConflict: "user_id" }));
      }
      if (error) return dbFailure("save notification preferences", error, "Couldn't save notification settings. Please try again.");
      return readPreferences();
    },
    async registerPushToken(input) {
      const parsed = pushTokenSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "This phone gave an unexpected notification address." };
      const { error } = await db.rpc("register_push_token", { push_token: parsed.data.token, device_platform: parsed.data.platform });
      if (error) return dbFailure("register push token", error, "Couldn't turn on phone notifications.");
      return { ok: true, data: null };
    },
    async unregisterPushToken(token) {
      const { error } = await db.rpc("unregister_push_token", { push_token: token });
      if (error) return dbFailure("unregister push token", error, "Couldn't turn off phone notifications.");
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode (on-device): settings are remembered, but there is no server
// to draft anything — the screens say so.
// ---------------------------------------------------------------------------
export const LOCAL_WEEKLY_KEY = "kp-preview-weekly-planning-v1";
export const LOCAL_NOTICES_KEY = "kp-preview-notifications-v1";
export const LOCAL_JOBS_KEY = "kp-preview-planning-jobs-v1";
export const LOCAL_NOTICE_PREFS_KEY = "kp-preview-notification-prefs-v1";

async function readJson<T>(storage: KeyValueStorage, key: string, fallback: T): Promise<T> {
  try {
    const raw = await storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function createLocalWeeklyPlanningRepository(storage: KeyValueStorage): WeeklyPlanningRepository {
  return {
    async settings() {
      return { ok: true, data: settingsFrom(await readJson(storage, LOCAL_WEEKLY_KEY, DEFAULT_SETTINGS)) };
    },
    async saveSettings(input) {
      const parsed = weeklyPlanningInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the settings." };
      const next: WeeklyPlanningSettings = { ...parsed.data, mode: parsed.data.mode as PlanningMode, enabledByName: parsed.data.enabled ? "You" : null, enabledByYou: parsed.data.enabled };
      await storage.setItem(LOCAL_WEEKLY_KEY, JSON.stringify(next));
      return { ok: true, data: next };
    },
    async jobForWeek(weekStart) {
      const jobs = await readJson<PlanningJob[]>(storage, LOCAL_JOBS_KEY, []);
      return { ok: true, data: jobs.find((j) => j.weekStart === weekStart) ?? null };
    },
    async latestJob() {
      const jobs = await readJson<PlanningJob[]>(storage, LOCAL_JOBS_KEY, []);
      return { ok: true, data: [...jobs].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] ?? null };
    },
    async notifications() {
      return { ok: true, data: (await readJson<AppNotification[]>(storage, LOCAL_NOTICES_KEY, [])).slice(0, 20) };
    },
    async markRead(ids) {
      const now = new Date().toISOString();
      const list = await readJson<AppNotification[]>(storage, LOCAL_NOTICES_KEY, []);
      await storage.setItem(LOCAL_NOTICES_KEY, JSON.stringify(list.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: now } : n))));
      return { ok: true, data: null };
    },
    async preferences() {
      return { ok: true, data: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(await readJson(storage, LOCAL_NOTICE_PREFS_KEY, {})) } };
    },
    async savePreferences(input) {
      const change = notificationPreferencesPatchSchema.safeParse(input);
      if (!change.success) return { ok: false, message: "Please check the notification settings." };
      const parsed = notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(await readJson(storage, LOCAL_NOTICE_PREFS_KEY, {})), ...change.data });
      if (!parsed.success) return { ok: false, message: "Please check the notification settings." };
      await storage.setItem(LOCAL_NOTICE_PREFS_KEY, JSON.stringify(parsed.data));
      return { ok: true, data: parsed.data };
    },
    async registerPushToken() {
      return { ok: false, message: "Phone notifications need a signed-in account." };
    },
    async unregisterPushToken() {
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Server side (service role only): claim, read inputs, finish.
// ---------------------------------------------------------------------------
export interface ClaimedPlanningJob {
  jobId: string;
  householdId: string;
  weekStart: IsoDate;
  mode: PlanningMode;
  attempts: number;
}

export interface PlanningJobContext {
  jobId: string;
  householdId: string;
  /** The member the draft is planned as (their skill and tastes; everyone's allergies). */
  userId: string;
  weekStart: IsoDate;
  mode: PlanningMode;
  profile: OnboardingProfile;
  pantry: PantryItem[];
  favorites: string[];
  ratings: RecipeRating[];
  events: RecommendationEvent[];
  summaries: RatingSummary[];
  recipeIds: string[];
  store: PricingStore | null;
}

export interface FinishedPlanningJob {
  status: "drafted" | "skipped";
  mealPlanId: string | null;
  message: string | null;
  pushUsers: string[];
}

export interface PlanningJobServer {
  claim(max?: number): Promise<Result<ClaimedPlanningJob[]>>;
  context(jobId: string): Promise<Result<PlanningJobContext | { skip: string }>>;
  recipes(ids: string[]): Promise<Result<Recipe[]>>;
  finish(jobId: string, plan: unknown, details: Record<string, unknown> & { message: string }): Promise<Result<FinishedPlanningJob>>;
  stop(jobId: string, reason: string, skipped: boolean): Promise<Result<null>>;
  pushTokens(userIds: string[]): Promise<Result<Array<{ userId: string; token: string }>>>;
  forgetPushTokens(tokens: string[]): Promise<Result<null>>;
}

/** `svc` must be a service-role client; the database refuses these calls from anyone else. */
export function createPlanningJobServer(svc: SupabaseLike): PlanningJobServer {
  return {
    async claim(max = 25) {
      const { data, error } = await svc.rpc("claim_planning_jobs", { max_jobs: max });
      if (error) return dbFailure("claim planning jobs", error, "Couldn't claim planning jobs.");
      const rows = (data ?? []) as Array<{ job_id: string; household_id: string; week_start: string; planning_mode: PlanningMode; attempts: number }>;
      return { ok: true, data: rows.map((r) => ({ jobId: r.job_id, householdId: r.household_id, weekStart: r.week_start, mode: r.planning_mode, attempts: r.attempts })) };
    },
    async context(jobId) {
      const { data, error } = await svc.rpc("planning_job_context", { job: jobId });
      if (error) return dbFailure("planning context", error, "Couldn't read the household's planning inputs.");
      const raw = data as Record<string, unknown> | null;
      if (!raw) return { ok: false, message: "No planning inputs." };
      if (typeof raw.skip === "string") return { ok: true, data: { skip: raw.skip } };
      const profile = parseStoredProfile(raw.profile);
      if (!profile) return { ok: true, data: { skip: "The household hasn't finished setting up, so there's no draft this week." } };
      const store = pricingStoreSchema.safeParse(raw.store);
      const summaries = (Array.isArray(raw.summaries) ? raw.summaries : []) as Array<{ recipe_id: string; average: number | string; rating_count: number | string; would_cook_again_pct: number | string | null }>;
      return {
        ok: true,
        data: {
          jobId: String(raw.jobId),
          householdId: String(raw.householdId),
          userId: String(raw.userId),
          weekStart: String(raw.weekStart),
          mode: String(raw.mode) as PlanningMode,
          profile,
          pantry: ((raw.pantry ?? []) as PantryRow[]).map(pantryRowToItem),
          favorites: ((raw.favorites ?? []) as unknown[]).filter((x): x is string => typeof x === "string"),
          ratings: ((raw.ratings ?? []) as RatingRow[]).map(ratingRowToRating),
          events: ((raw.events ?? []) as EventRow[]).map(eventRowToEvent),
          summaries: summaries.map((s) => ({
            recipeId: s.recipe_id,
            average: Number(s.average),
            count: Number(s.rating_count),
            wouldCookAgainPct: s.would_cook_again_pct === null ? null : Number(s.would_cook_again_pct),
          })),
          recipeIds: ((raw.recipeIds ?? []) as unknown[]).filter((x): x is string => typeof x === "string" && isUuid(x)),
          store: store.success && raw.store ? (store.data as PricingStore) : null,
        },
      };
    },
    async recipes(ids) {
      const out: Recipe[] = [];
      // Only the ids the database said this household can read.
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100).filter(isUuid);
        if (chunk.length === 0) continue;
        const { data, error } = await svc.from("recipes").select(RECIPE_SELECT).in("id", chunk);
        if (error) return dbFailure("planning recipes", error, "Couldn't load recipes.");
        out.push(...(data as RecipeRow[]).map(recipeRowToRecipe));
      }
      return { ok: true, data: out.sort((a, b) => a.title.localeCompare(b.title)) };
    },
    async finish(jobId, plan, details) {
      const { data, error } = await svc.rpc("finish_planning_job", { job: jobId, plan, details });
      if (error) return dbFailure("finish planning job", error, "Couldn't save the draft.");
      const r = (data ?? {}) as { status?: string; mealPlanId?: string | null; message?: string | null; pushUsers?: unknown[] };
      return {
        ok: true,
        data: {
          status: r.status === "drafted" ? "drafted" : "skipped",
          mealPlanId: r.mealPlanId ?? null,
          message: r.message ?? null,
          pushUsers: (r.pushUsers ?? []).filter((x): x is string => typeof x === "string"),
        },
      };
    },
    async stop(jobId, reason, skipped) {
      const { error } = await svc.rpc("stop_planning_job", { job: jobId, reason, skipped });
      if (error) return dbFailure("stop planning job", error, "Couldn't record the planning result.");
      return { ok: true, data: null };
    },
    async pushTokens(userIds) {
      const ids = userIds.filter(isUuid);
      if (ids.length === 0) return { ok: true, data: [] };
      const { data, error } = await svc.from("push_tokens").select("user_id, token").in("user_id", ids);
      if (error) return dbFailure("push tokens", error, "Couldn't load phone addresses.");
      return { ok: true, data: (data as Array<{ user_id: string; token: string }>).map((r) => ({ userId: r.user_id, token: r.token })) };
    },
    async forgetPushTokens(tokens) {
      if (tokens.length === 0) return { ok: true, data: null };
      const { error } = await svc.from("push_tokens").delete().in("token", tokens);
      if (error) return dbFailure("forget push tokens", error, "Couldn't clean up phone addresses.");
      return { ok: true, data: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Use-soon reminders (server, service role only). The database decides who
// is told what, once a day in each person's daytime; this just reads back
// the phone notifications to send.
// ---------------------------------------------------------------------------
export interface UseSoonRun {
  people: number;
  notices: number;
  push: Array<{ userId: string; title: string; body: string }>;
}

export async function runUseSoonReminders(svc: SupabaseLike, maxPeople = 500): Promise<Result<UseSoonRun>> {
  const { data, error } = await svc.rpc("use_soon_reminders", { max_people: Math.min(Math.max(Math.trunc(maxPeople) || 500, 1), 5000) });
  if (error) return dbFailure("use-soon reminders", error, "Couldn't run use-soon reminders.");
  const raw = (data ?? {}) as { people?: unknown; notices?: unknown; push?: unknown };
  const push = (Array.isArray(raw.push) ? raw.push : [])
    .map((p) => p as { userId?: unknown; title?: unknown; body?: unknown })
    .filter((p): p is { userId: string; title: string; body: string } => typeof p.userId === "string" && isUuid(p.userId) && typeof p.title === "string" && typeof p.body === "string")
    .map((p) => ({ userId: p.userId, title: p.title.slice(0, 120), body: p.body.slice(0, 300) }));
  return { ok: true, data: { people: Number(raw.people) || 0, notices: Number(raw.notices) || 0, push } };
}
