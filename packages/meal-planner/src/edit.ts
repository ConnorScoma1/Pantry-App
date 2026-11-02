import type { IsoDate, MealPlan, PlannedMeal, PlanningMode, PlanSource } from "@kitchen-pantry/shared-types";
import type { DessertPick } from "./desserts";
import type { PlannedPick } from "./planner";
import { chooseDinnerDays } from "./planner";
import { addDays } from "./week";

/**
 * Pure edits on a week's plan, shared by web and mobile so both behave the
 * same. Each returns a new draft; callers save it through the repository.
 * Meals are identified by date: one dinner per day, and optionally one
 * dessert per day (desserts live in their own list and never replace dinner).
 */
type DraftMeal = Omit<PlannedMeal, "id" | "mealType"> & { id?: string };
export type PlanDraft = Pick<MealPlan, "weekStart" | "mode" | "generatedBy" | "summary" | "confirmedAt"> & {
  meals: DraftMeal[];
  desserts: DraftMeal[];
};

export function emptyPlan(weekStart: IsoDate, mode: PlanningMode = "balanced"): PlanDraft {
  return { weekStart, mode, generatedBy: "manual", summary: null, confirmedAt: null, meals: [], desserts: [] };
}

export function toDraft(plan: MealPlan): PlanDraft {
  const strip = ({ mealType: _mealType, ...m }: PlannedMeal): DraftMeal => m;
  return {
    weekStart: plan.weekStart,
    mode: plan.mode,
    generatedBy: plan.generatedBy,
    summary: plan.summary,
    confirmedAt: plan.confirmedAt,
    meals: plan.meals.filter((m) => m.mealType !== "dessert").map(strip),
    desserts: plan.meals.filter((m) => m.mealType === "dessert").map(strip),
  };
}

/** What the repository saves: dinners and desserts in one list, each with its type. */
export function draftToInput(plan: PlanDraft) {
  return {
    weekStart: plan.weekStart,
    mode: plan.mode,
    generatedBy: plan.generatedBy,
    summary: plan.summary,
    confirmedAt: plan.confirmedAt,
    meals: [
      ...plan.meals.map((m) => ({ ...m, mealType: "dinner" as const })),
      ...(plan.desserts ?? []).map((m) => ({ ...m, mealType: "dessert" as const })),
    ],
  };
}

const sortMeals = (meals: PlanDraft["meals"]) => [...meals].sort((a, b) => a.date.localeCompare(b.date));

/** Meals the planner must keep: locked ones and the household's own custom meals. */
export function keptMeals(plan: PlanDraft): PlanDraft["meals"] {
  return plan.meals.filter((m) => m.locked || m.customTitle);
}

/**
 * Nights the planner should fill for this week: the household's dinner
 * days, minus kept meals and minus nights that are already over. If the
 * usual dinner days have passed, the remaining nights are used instead.
 */
export function daysToPlan(plan: PlanDraft, dinnersPerWeek: number, today?: IsoDate): IsoDate[] {
  const kept = new Set(keptMeals(plan).map((m) => m.date));
  const usual = chooseDinnerDays(plan.weekStart, dinnersPerWeek);
  if (!today || today <= plan.weekStart) return usual.filter((d) => !kept.has(d));
  const upcoming = usual.filter((d) => d >= today);
  // Mid-week: plan as many of the household's dinners as still fit.
  const remaining = Array.from({ length: 7 }, (_, i) => addDays(plan.weekStart, i)).filter((d) => d >= today);
  const wanted = Math.min(remaining.length, Math.max(upcoming.length, Math.round((dinnersPerWeek * remaining.length) / 7)));
  const days = upcoming.length >= wanted ? upcoming : [...upcoming, ...remaining.filter((d) => !upcoming.includes(d))].sort().slice(0, wanted);
  return days.filter((d) => !kept.has(d));
}

/** Days of the week left to cook, counting today. */
export function nightsLeft(weekStart: IsoDate, today: IsoDate): number {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d >= today).length;
}

/** Put the planner's picks into the week, keeping locked and custom meals. */
export function applyPicks(
  plan: PlanDraft,
  picks: readonly PlannedPick[],
  meta: { source: PlanSource; summary: string | null; mode: PlanningMode },
): PlanDraft {
  const kept = keptMeals(plan);
  const keptDays = new Set(kept.map((m) => m.date));
  const fresh = picks
    .filter((p) => !keptDays.has(p.date))
    .map((p) => ({ date: p.date, recipeId: p.recipeId, customTitle: null, servings: p.servings, locked: false, note: p.note }));
  return {
    ...plan,
    mode: meta.mode,
    generatedBy: meta.source,
    summary: meta.summary,
    confirmedAt: null, // a rebuilt week needs confirming again
    meals: sortMeals([...kept, ...fresh]),
  };
}

function edit(plan: PlanDraft, date: IsoDate, fn: (m: PlanDraft["meals"][number]) => PlanDraft["meals"][number] | null): PlanDraft {
  const meals = plan.meals.flatMap((m) => {
    if (m.date !== date) return [m];
    const next = fn(m);
    return next ? [next] : [];
  });
  return { ...plan, meals: sortMeals(meals) };
}

export function setServings(plan: PlanDraft, date: IsoDate, servings: number): PlanDraft {
  const s = Math.max(1, Math.min(24, Math.round(servings)));
  return edit(plan, date, (m) => ({ ...m, servings: s }));
}

export function toggleLock(plan: PlanDraft, date: IsoDate): PlanDraft {
  return edit(plan, date, (m) => ({ ...m, locked: !m.locked }));
}

export function removeMeal(plan: PlanDraft, date: IsoDate): PlanDraft {
  return edit(plan, date, () => null);
}

/** Swap in a different recipe for one night (keeps servings and lock). */
export function replaceMeal(plan: PlanDraft, date: IsoDate, pick: Pick<PlannedPick, "recipeId" | "note">, servings: number): PlanDraft {
  const others = plan.meals.filter((m) => m.date !== date);
  if (others.some((m) => m.recipeId === pick.recipeId)) return plan; // never twice in a week
  const current = plan.meals.find((m) => m.date === date);
  const meal = {
    id: current?.id,
    date,
    recipeId: pick.recipeId,
    customTitle: null,
    servings: current?.servings ?? servings,
    locked: current?.locked ?? false,
    note: pick.note,
  };
  return { ...plan, meals: sortMeals([...others, meal]) };
}

export function addCustomMeal(plan: PlanDraft, date: IsoDate, title: string, servings: number): PlanDraft {
  const name = title.trim().slice(0, 80);
  if (!name) return plan;
  const others = plan.meals.filter((m) => m.date !== date);
  return {
    ...plan,
    meals: sortMeals([...others, { date, recipeId: null, customTitle: name, servings, locked: false, note: null }]),
  };
}

/** Move a meal to another day; if that day has a meal, the two swap. */
export function moveMeal(plan: PlanDraft, from: IsoDate, to: IsoDate): PlanDraft {
  if (from === to) return plan;
  const offset = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${plan.weekStart}T00:00:00Z`)) / 86_400_000;
  if (!(offset >= 0 && offset <= 6)) return plan;
  const meals = plan.meals.map((m) => (m.date === from ? { ...m, date: to } : m.date === to ? { ...m, date: from } : m));
  return { ...plan, meals: sortMeals(meals) };
}

/** Copy an earlier week's dinners onto the same weekdays of this week. */
export function repeatWeek(plan: PlanDraft, previous: MealPlan, allowedRecipeIds: ReadonlySet<string>): PlanDraft {
  const shift = (d: IsoDate) => addDays(plan.weekStart, Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${previous.weekStart}T00:00:00Z`)) / 86_400_000));
  const copy = (type: "dinner" | "dessert") =>
    previous.meals
      .filter((m) => (m.mealType === "dessert" ? "dessert" : "dinner") === type)
      .filter((m) => !m.recipeId || allowedRecipeIds.has(m.recipeId)) // skip anything no longer suitable
      .map((m) => ({ date: shift(m.date), recipeId: m.recipeId, customTitle: m.customTitle, servings: m.servings, locked: type === "dessert", note: "From a previous week" }));
  return { ...plan, generatedBy: "manual", summary: null, confirmedAt: null, meals: sortMeals(copy("dinner")), desserts: sortMeals(copy("dessert")) };
}

export function confirmPlan(plan: PlanDraft, at = new Date()): PlanDraft {
  return { ...plan, confirmedAt: at.toISOString() };
}

// ---------------------------------------------------------------------------
// Desserts. Ones added by hand are kept (locked) when the week is rebuilt;
// automatic ones are replaced.
// ---------------------------------------------------------------------------
export function applyDessertPicks(plan: PlanDraft, picks: readonly DessertPick[]): PlanDraft {
  const kept = (plan.desserts ?? []).filter((d) => d.locked);
  const keptDays = new Set(kept.map((d) => d.date));
  const keptIds = new Set(kept.map((d) => d.recipeId));
  const fresh = picks
    .filter((p) => !keptDays.has(p.date) && !keptIds.has(p.recipeId))
    .map((p) => ({ date: p.date, recipeId: p.recipeId, customTitle: null, servings: p.servings, locked: false, note: p.note }));
  return { ...plan, desserts: sortMeals([...kept, ...fresh]) };
}

/** "Add dessert": replaces any dessert on that day; never the same dessert twice in a week. */
export function addDessert(plan: PlanDraft, date: IsoDate, pick: { recipeId: string; note: string | null }, servings: number): PlanDraft {
  const others = (plan.desserts ?? []).filter((d) => d.date !== date);
  if (others.some((d) => d.recipeId === pick.recipeId)) return plan;
  const offset = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${plan.weekStart}T00:00:00Z`)) / 86_400_000;
  if (!(offset >= 0 && offset <= 6)) return plan;
  const s = Math.max(1, Math.min(24, Math.round(servings)));
  return {
    ...plan,
    desserts: sortMeals([...others, { date, recipeId: pick.recipeId, customTitle: null, servings: s, locked: true, note: pick.note }]),
  };
}

export function removeDessert(plan: PlanDraft, date: IsoDate): PlanDraft {
  return { ...plan, desserts: (plan.desserts ?? []).filter((d) => d.date !== date) };
}

export function setDessertServings(plan: PlanDraft, date: IsoDate, servings: number): PlanDraft {
  const s = Math.max(1, Math.min(24, Math.round(servings)));
  return { ...plan, desserts: (plan.desserts ?? []).map((d) => (d.date === date ? { ...d, servings: s } : d)) };
}
