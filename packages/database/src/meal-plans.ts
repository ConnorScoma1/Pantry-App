import type { IsoDate, MealPlan, PlannedMeal, PlanningMode, PlanSource } from "@kitchen-pantry/shared-types";
import { issuesToFieldErrors, mealPlanInputSchema, type MealPlanInput } from "@kitchen-pantry/validation";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { randomUuid } from "./kitchen";

/**
 * Weekly meal plans — shared by web and mobile. One plan per household per
 * week; saving replaces the week atomically. A confirmed week is only
 * replaced when `overwriteConfirmed` is passed (after the person agreed).
 */
export interface MealPlanRepository {
  getWeek(weekStart: IsoDate): Promise<Result<MealPlan | null>>;
  save(input: unknown, options?: { overwriteConfirmed?: boolean }): Promise<Result<MealPlan>>;
  /** Earlier weeks, newest first — for "repeat a previous week". */
  previous(before: IsoDate, limit?: number): Promise<Result<MealPlan[]>>;
}

/** Saving over a confirmed week without permission. */
export const CONFIRMED_PLAN = "confirmed_plan";
export type SaveResult = Result<MealPlan> & { code?: typeof CONFIRMED_PLAN };

const LOAD_FAILED = "We couldn't load your meal plan. Please try again.";
const SAVE_FAILED = "We couldn't save your meal plan. Please try again.";
const CONFIRMED_MESSAGE = "This week is confirmed. Confirm that you want to change it.";

function invalid(error: Parameters<typeof issuesToFieldErrors>[0]): Result<never> {
  return { ok: false, message: "Please check the plan and try again.", fieldErrors: issuesToFieldErrors(error) };
}

interface PlanRow {
  id: string;
  week_start: string;
  status: MealPlan["status"];
  planning_mode: PlanningMode;
  generated_by: PlanSource;
  summary: string | null;
  confirmed_at: string | null;
  updated_at: string;
  planned_meals: Array<{
    id: string;
    planned_date: string;
    meal_type?: string | null;
    recipe_id: string | null;
    custom_title: string | null;
    servings: number;
    is_locked: boolean;
    note: string | null;
    position: number;
  }>;
}

const PLAN_SELECT =
  "id, week_start, status, planning_mode, generated_by, summary, confirmed_at, updated_at, " +
  "planned_meals(id, planned_date, meal_type, recipe_id, custom_title, servings, is_locked, note, position)";

export function planRowToPlan(row: PlanRow): MealPlan {
  return {
    id: row.id,
    weekStart: row.week_start,
    status: row.status,
    mode: row.planning_mode,
    generatedBy: row.generated_by,
    summary: row.summary,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
    meals: [...(row.planned_meals ?? [])]
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date) || a.position - b.position)
      .map((m) => ({
        id: m.id,
        date: m.planned_date,
        mealType: m.meal_type === "dessert" ? ("dessert" as const) : ("dinner" as const),
        recipeId: m.recipe_id,
        customTitle: m.custom_title,
        servings: m.servings,
        locked: m.is_locked,
        note: m.note,
      })),
  };
}

export function createSupabaseMealPlanRepository(db: SupabaseLike): MealPlanRepository {
  async function getWeek(weekStart: IsoDate): Promise<Result<MealPlan | null>> {
    const { data, error } = await db.from("meal_plans").select(PLAN_SELECT).eq("week_start", weekStart).maybeSingle();
    if (error) return dbFailure("meal plan", error, LOAD_FAILED);
    return { ok: true, data: data ? planRowToPlan(data as PlanRow) : null };
  }
  return {
    getWeek,
    async save(input, options = {}): Promise<SaveResult> {
      const parsed = mealPlanInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const { error } = await db.rpc("save_meal_plan", {
        plan: parsed.data,
        overwrite_confirmed: Boolean(options.overwriteConfirmed),
      });
      if (error) {
        if ((error as { hint?: string }).hint === CONFIRMED_PLAN || /confirmed/i.test(error.message ?? "")) {
          return { ok: false, message: CONFIRMED_MESSAGE, code: CONFIRMED_PLAN };
        }
        return dbFailure("save meal plan", error, SAVE_FAILED);
      }
      const fresh = await getWeek(parsed.data.weekStart);
      if (!fresh.ok) return fresh;
      if (!fresh.data) return { ok: false, message: SAVE_FAILED };
      return { ok: true, data: fresh.data };
    },
    async previous(before, limit = 6) {
      const { data, error } = await db
        .from("meal_plans")
        .select(PLAN_SELECT)
        .lt("week_start", before)
        .order("week_start", { ascending: false })
        .limit(limit);
      if (error) return dbFailure("previous meal plans", error, LOAD_FAILED);
      return { ok: true, data: (data as PlanRow[]).map(planRowToPlan) };
    },
  };
}

// ---------------------------------------------------------------------------
// Preview mode (on-device)
// ---------------------------------------------------------------------------

export const LOCAL_MEAL_PLANS_KEY = "kp-preview-meal-plans-v1";

export function inputToPlan(input: MealPlanInput, previous: MealPlan | null, now: Date): MealPlan {
  return {
    id: previous?.id ?? randomUuid(),
    weekStart: input.weekStart,
    status: input.confirmedAt ? "active" : "draft",
    mode: input.mode as PlanningMode,
    generatedBy: input.generatedBy,
    summary: input.summary,
    confirmedAt: input.confirmedAt,
    updatedAt: now.toISOString(),
    meals: [...input.meals]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (m): PlannedMeal => ({
          id: m.id ?? randomUuid(),
          date: m.date,
          mealType: m.mealType === "dessert" ? ("dessert" as const) : ("dinner" as const),
          recipeId: m.recipeId,
          customTitle: m.customTitle,
          servings: m.servings,
          locked: m.locked,
          note: m.note,
        }),
      ),
  };
}

export function createLocalMealPlanRepository(
  storage: KeyValueStorage,
  options: { now?: () => Date } = {},
): MealPlanRepository {
  const now = options.now ?? (() => new Date());
  async function readAll(): Promise<Record<string, MealPlan>> {
    try {
      const raw = await storage.getItem(LOCAL_MEAL_PLANS_KEY);
      const value: unknown = raw ? JSON.parse(raw) : {};
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, MealPlan>) : {};
    } catch {
      return {};
    }
  }
  return {
    async getWeek(weekStart) {
      return { ok: true, data: (await readAll())[weekStart] ?? null };
    },
    async save(input, options = {}): Promise<SaveResult> {
      const parsed = mealPlanInputSchema.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      const all = await readAll();
      const existing = all[parsed.data.weekStart] ?? null;
      if (existing?.confirmedAt && !options.overwriteConfirmed) {
        return { ok: false, message: CONFIRMED_MESSAGE, code: CONFIRMED_PLAN };
      }
      const plan = inputToPlan(parsed.data, existing, now());
      all[plan.weekStart] = plan;
      // Keep the last 12 weeks on the device.
      const keep = Object.keys(all).sort().slice(-12);
      const trimmed = Object.fromEntries(keep.map((k) => [k, all[k]!]));
      try {
        await storage.setItem(LOCAL_MEAL_PLANS_KEY, JSON.stringify(trimmed));
      } catch {
        return { ok: false, message: SAVE_FAILED };
      }
      return { ok: true, data: plan };
    },
    async previous(before, limit = 6) {
      const all = await readAll();
      return {
        ok: true,
        data: Object.values(all)
          .filter((p) => p.weekStart < before)
          .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
          .slice(0, limit),
      };
    },
  };
}

/** The client-side shape used to save a plan (drops server-only fields). */
export function planToInput(plan: Pick<MealPlan, "weekStart" | "mode" | "generatedBy" | "summary" | "confirmedAt" | "meals">): MealPlanInput {
  return {
    weekStart: plan.weekStart,
    mode: plan.mode,
    generatedBy: plan.generatedBy,
    summary: plan.summary,
    confirmedAt: plan.confirmedAt,
    meals: plan.meals.map((m) => ({
      id: m.id,
      date: m.date,
      mealType: m.mealType === "dessert" ? ("dessert" as const) : ("dinner" as const),
      recipeId: m.recipeId,
      customTitle: m.customTitle,
      servings: m.servings,
      locked: m.locked,
      note: m.note,
    })),
  };
}
