"use server";

import {
  createSupabaseMealPlanRepository,
  type MealPlanRepository,
  type Result,
  type SaveResult,
} from "@kitchen-pantry/database";
import type { MealPlan } from "@kitchen-pantry/shared-types";
import { aiPlanningStatus, generateMealPlan, type AiPlanningStatus, type GeneratedPlan } from "@/lib/meal-plan/generate";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Meal plan server actions. Plans are read and written as the signed-in
 * user (RLS applies). Planning with Claude runs here, on the server, so the
 * API key never reaches the browser.
 */
async function session() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { db: asSupabaseLike(supabase), userId: user.id } : null;
}

async function withPlans<T>(fn: (repo: MealPlanRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const s = await session();
  if (!s) return { ok: false, message: "Your session expired. Please sign in again." };
  return fn(createSupabaseMealPlanRepository(s.db));
}

export async function getWeekAction(weekStart: string): Promise<Result<MealPlan | null>> {
  return withPlans((r) => r.getWeek(String(weekStart)));
}
export async function saveWeekAction(input: unknown, overwriteConfirmed = false): Promise<SaveResult> {
  return withPlans((r) => r.save(input, { overwriteConfirmed: Boolean(overwriteConfirmed) })) as Promise<SaveResult>;
}
export async function previousWeeksAction(before: string): Promise<Result<MealPlan[]>> {
  return withPlans((r) => r.previous(String(before), 6));
}

export async function aiStatusAction(): Promise<AiPlanningStatus> {
  if (!isSupabaseConfigured) return aiPlanningStatus(null);
  const s = await session();
  return s ? aiPlanningStatus(s.db) : { enabled: false, remaining: null };
}

/**
 * Plan the open nights. With Supabase the household's data is loaded on the
 * server; in preview mode the browser passes its local data (`preview`).
 */
export async function generatePlanAction(request: unknown, preview?: unknown): Promise<Result<GeneratedPlan>> {
  if (!isSupabaseConfigured) return generateMealPlan(request, { preview });
  const s = await session();
  if (!s) return { ok: false, message: "Your session expired. Please sign in again." };
  return generateMealPlan(request, { db: s.db, householdKey: s.userId });
}
