import type {
  IsoDate,
  OnboardingProfile,
  PantryItem,
  PlanningMode,
  PlanSource,
  RatingSummary,
  Recipe,
  RecipeRating,
  RecommendationEvent,
  WeeklyPlanningSettings,
} from "@kitchen-pantry/shared-types";
import type { Special, SpecialsTerm } from "@kitchen-pantry/grocery-pricing";
import { dismissedRecipeIds, rankRecipes, type RankedRecipe, type RankingContext } from "@kitchen-pantry/recipe-engine";
import { dessertDays, planDesserts } from "./desserts";
import { applyDessertPicks, applyPicks, draftToInput, emptyPlan } from "./edit";
import { chooseDinnerDays, planWeek, type PlannedPick, type PlanWeekInput } from "./planner";
import { cookTheSpecialsTerms, isMinorSaleItem, saleMatches } from "./specials";
import { surpriseHistory } from "./surprise";
import { addDays } from "./week";

/**
 * Weekly drafts (spec 02 §6). Once a week, at the household's chosen time,
 * the server drafts NEXT week: specials → pantry and use-by dates → the
 * household's preferences → candidate recipes → the planner (which keeps the
 * basket small and reuses ingredients) → a draft → a notice.
 *
 * These helpers are pure so the server job and the apps agree on what "next
 * week" and "the drafting time" mean. A draft is never confirmed and nothing
 * is ever bought; the database only writes it into an empty week.
 */

export const DEFAULT_WEEKLY_PLANNING: WeeklyPlanningSettings = {
  enabled: false,
  runDay: 6,
  runHour: 9,
  timeZone: "America/Chicago",
  mode: "balanced",
  enabledByName: null,
  enabledByYou: false,
};

export const WEEKDAYS = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 7, label: "Sunday" },
] as const;

const ISO_DAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Date, ISO weekday and hour right now in a time zone (falls back to UTC for an unknown zone). */
export function localParts(now: Date, timeZone: string): { date: IsoDate; isoDay: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(now);
  } catch {
    return localParts(now, "UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    isoDay: ISO_DAY[get("weekday")] ?? 1,
    hour: Number(get("hour")) % 24,
  };
}

export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return `${h % 12} ${h < 12 ? "AM" : "PM"}`;
}

export interface WeeklySchedule {
  /** The week the next draft is for (a Monday). */
  weekStart: IsoDate;
  /** This week's drafting time has passed: the next server check drafts it (if it hasn't already). */
  due: boolean;
  /** Local date of this week's drafting time. */
  runDate: IsoDate;
  /** "Saturday at 9 AM". */
  label: string;
}

/** Same rule as the database's claim_planning_jobs(). */
export function weeklySchedule(settings: Pick<WeeklyPlanningSettings, "runDay" | "runHour" | "timeZone">, now: Date): WeeklySchedule {
  const local = localParts(now, settings.timeZone);
  const monday = addDays(local.date, 1 - local.isoDay);
  const due = local.isoDay > settings.runDay || (local.isoDay === settings.runDay && local.hour >= settings.runHour);
  const day = WEEKDAYS.find((d) => d.day === settings.runDay)?.label ?? "Saturday";
  return { weekStart: addDays(monday, 7), due, runDate: addDays(monday, settings.runDay - 1), label: `${day} at ${hourLabel(settings.runHour)}` };
}

/** The household's usual dinner nights next week (none if dinner isn't one of its meals). */
export function weeklyDraftDays(profile: Pick<OnboardingProfile, "household">, weekStart: IsoDate): IsoDate[] {
  const { mealsIncluded, dinnersPerWeek } = profile.household;
  if (!mealsIncluded.includes("dinner") || dinnersPerWeek <= 0) return [];
  return chooseDinnerDays(weekStart, dinnersPerWeek);
}

/** What the planner (or Claude) is asked for. */
export function weeklyPlanInput(args: {
  weekStart: IsoDate;
  profile: Pick<OnboardingProfile, "household" | "goals">;
  candidates: RankedRecipe[];
  mode: PlanningMode;
  specials?: readonly Special[];
  specialsSource?: { storeName: string; checkedAt: string } | null;
  seed?: number;
}): PlanWeekInput {
  return {
    days: weeklyDraftDays(args.profile, args.weekStart),
    candidates: args.candidates,
    mode: args.mode,
    goals: args.profile.goals.ranked,
    servings: args.profile.household.cookingFor,
    fixed: [],
    avoid: new Set(),
    seed: args.seed ?? 1,
    specials: args.mode === "cook_the_specials" ? (args.specials ?? []) : [],
    specialsSource: args.mode === "cook_the_specials" ? (args.specialsSource ?? null) : null,
  };
}

export interface WeeklyDraftDetails {
  source: PlanSource;
  specialsUsed: number;
  storeName: string | null;
  useSoon: string[];
  unfilled: number;
  notes: string[];
}

export interface WeeklyDraft {
  /** Ready for save_meal_plan / finish_planning_job (never confirmed). */
  plan: ReturnType<typeof draftToInput>;
  dinners: number;
  details: WeeklyDraftDetails;
  /** One plain sentence or two for the notice (≤ 300 characters). */
  message: string;
}

function shortDate(iso: IsoDate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Turn the planner's answer into next week's draft. Picks are re-checked
 * against the household's safe candidates (so nothing filtered — allergies,
 * diets, "Not for us" — can slip in), missing nights are filled by the
 * deterministic planner, and desserts follow the household's frequency.
 * Returns null when there's nothing to plan (no dinner nights).
 */
export function assembleWeeklyDraft(args: {
  input: PlanWeekInput;
  weekStart: IsoDate;
  profile: Pick<OnboardingProfile, "household" | "desserts">;
  result: { picks: readonly PlannedPick[]; summary: string; source: PlanSource };
  dessertCandidates: readonly RankedRecipe[];
  storeName?: string | null;
  notes?: readonly string[];
}): WeeklyDraft | null {
  const { input, weekStart } = args;
  if (input.days.length === 0) return null;
  const byId = new Map(input.candidates.map((c) => [c.recipe.id, c] as const));
  const days = new Set(input.days);
  const seen = new Set<string>();
  const usedDays = new Set<IsoDate>();
  let picks = args.result.picks.filter((p) => {
    const ok = byId.has(p.recipeId) && days.has(p.date) && !seen.has(p.recipeId) && !usedDays.has(p.date);
    if (ok) {
      seen.add(p.recipeId);
      usedDays.add(p.date);
    }
    return ok;
  });
  let source = args.result.source;
  let summary: string | null = args.result.summary || null;

  const missing = input.days.filter((d) => !usedDays.has(d));
  let unfilled = 0;
  if (missing.length > 0) {
    const extra = planWeek({ ...input, days: missing, fixed: picks.map((p) => ({ date: p.date, recipeId: p.recipeId })) });
    picks = [...picks, ...extra.picks];
    unfilled = extra.unfilled.length;
    if (picks.length === extra.picks.length) {
      source = "rules";
      summary = extra.summary;
    }
  }
  if (picks.length === 0) return null;

  let draft = applyPicks(emptyPlan(weekStart, input.mode), picks, { source, summary, mode: input.mode });
  const dinners = picks.map((p) => byId.get(p.recipeId)!.recipe);
  const dessertNights = dessertDays(weekStart, args.profile.desserts.frequency, undefined, picks.map((p) => p.date));
  if (dessertNights.length > 0) {
    draft = applyDessertPicks(
      draft,
      planDesserts({ weekStart, days: dessertNights, candidates: args.dessertCandidates, dinners, servings: input.servings, seed: input.seed }),
    );
  }

  // Pantry items close to their use-by date that the week uses up.
  const useSoon: string[] = [];
  for (const p of picks) {
    for (const item of byId.get(p.recipeId)!.coverage.usesSoon) {
      const name = item.name.toLowerCase();
      if (!useSoon.includes(name)) useSoon.push(name);
    }
  }
  // Sale items the week actually buys (Cook the Specials only; everyday basics don't count).
  const saleItems = new Set<string>();
  for (const p of picks) {
    for (const m of saleMatches(byId.get(p.recipeId)!, input.specials ?? [])) if (!isMinorSaleItem(m.item)) saleItems.add(m.item.toLowerCase());
  }

  const details: WeeklyDraftDetails = {
    source,
    specialsUsed: saleItems.size,
    storeName: args.storeName ?? null,
    useSoon: useSoon.slice(0, 4),
    unfilled,
    notes: [...(args.notes ?? [])].slice(0, 4),
  };
  return { plan: draftToInput(draft), dinners: picks.length, details, message: weeklyDraftMessage(weekStart, picks.length, details) };
}

/** "5 dinners for the week of Nov 9. Uses up your spinach and chicken. …" */
export function weeklyDraftMessage(weekStart: IsoDate, dinners: number, d: Pick<WeeklyDraftDetails, "useSoon" | "specialsUsed" | "storeName" | "unfilled">): string {
  const parts = [`${dinners} dinner${dinners === 1 ? "" : "s"} for the week of ${shortDate(weekStart)}.`];
  if (d.useSoon.length > 0) parts.push(`Uses up your ${joinNames(d.useSoon.slice(0, 2))}.`);
  if (d.specialsUsed > 0 && d.storeName) parts.push(`${d.specialsUsed} thing${d.specialsUsed === 1 ? "" : "s"} on sale at ${d.storeName}.`);
  if (d.unfilled > 0) parts.push(`${d.unfilled} night${d.unfilled === 1 ? "" : "s"} left open.`);
  parts.push("Nothing was bought — review and confirm when you're ready.");
  let text = parts.join(" ");
  if (text.length > 300) text = `${text.slice(0, 297)}…`;
  return text;
}

// ---------------------------------------------------------------------------
// The whole drafting step for one household (the server job calls this).
// ---------------------------------------------------------------------------
export interface WeeklyDraftContext {
  weekStart: IsoDate;
  today: IsoDate;
  mode: PlanningMode;
  profile: OnboardingProfile;
  pantry: PantryItem[];
  favorites: readonly string[];
  /** Newest first. */
  ratings: readonly RecipeRating[];
  events: readonly RecommendationEvent[];
  summaries: readonly RatingSummary[];
  /** Only recipes this household can read. */
  recipes: readonly Recipe[];
  store: { storeId: string; name: string } | null;
}

export interface WeeklyDraftDeps {
  /** Live sale prices at the household's store; absent when store prices aren't connected. */
  specials?: (store: { storeId: string; name: string }, terms: SpecialsTerm[]) => Promise<{ ok: true; specials: Special[]; checkedAt: string } | { ok: false; message: string }>;
  /** Claude when available (and within the household's daily limit), otherwise the deterministic planner. */
  plan: (input: PlanWeekInput) => Promise<{ picks: readonly PlannedPick[]; summary: string; source: PlanSource }>;
}

/**
 * Spec 02 §6, in order: specials (Cook the Specials) → pantry and use-by
 * dates → preferences → candidates (every hard filter applied by
 * rankRecipes) → planner → draft. Never buys anything and never confirms.
 */
export async function draftWeek(ctx: WeeklyDraftContext, deps: WeeklyDraftDeps): Promise<{ draft: WeeklyDraft } | { skip: string }> {
  const days = weeklyDraftDays(ctx.profile, ctx.weekStart);
  if (days.length === 0) return { skip: "Dinner isn't one of the meals you plan, so there was nothing to draft." };

  const myRatings = new Map<string, RecipeRating>();
  for (const r of ctx.ratings) if (!myRatings.has(r.recipeId)) myRatings.set(r.recipeId, r);
  const ranking: RankingContext = {
    profile: ctx.profile,
    pantry: ctx.pantry,
    today: ctx.today,
    favorites: new Set(ctx.favorites),
    ratings: new Map(ctx.summaries.map((s) => [s.recipeId, s] as const)),
    myRatings,
    dismissed: dismissedRecipeIds([...ctx.events]),
  };
  const recipes = [...ctx.recipes];
  const candidates = rankRecipes(recipes, ranking).recipes;
  if (candidates.length === 0) return { skip: "No recipes fit your household's filters right now, so there was nothing to draft." };
  const dessertCandidates = rankRecipes(recipes, ranking, { course: "dessert", dessertCategories: ctx.profile.desserts.categories }).recipes;

  const notes: string[] = [];
  let specials: Special[] = [];
  let specialsSource: { storeName: string; checkedAt: string } | null = null;
  if (ctx.mode === "cook_the_specials") {
    if (!deps.specials) notes.push("Store prices aren't connected, so this week was planned like Balanced.");
    else if (!ctx.store) notes.push("No store is chosen on the Grocery List, so this week was planned like Balanced.");
    else {
      const r = await deps.specials(ctx.store, cookTheSpecialsTerms(candidates));
      if (r.ok) {
        specials = r.specials;
        specialsSource = { storeName: ctx.store.name, checkedAt: r.checkedAt };
        if (specials.length === 0) notes.push(`Nothing this week needs was on sale at ${ctx.store.name}.`);
      } else notes.push(`${r.message} This week was planned like Balanced.`);
    }
  }

  // Cooked in the last ten days: steer away (a soft nudge, not a ban).
  const history = surpriseHistory(ctx.events, myRatings);
  const recent = new Set([...history.cookedOn].filter(([, day]) => day >= addDays(ctx.weekStart, -10)).map(([id]) => id));

  const input = { ...weeklyPlanInput({ weekStart: ctx.weekStart, profile: ctx.profile, candidates, mode: ctx.mode, specials, specialsSource, seed: Number(ctx.weekStart.replace(/-/g, "")) % 100_000 }), avoid: recent };
  const result = await deps.plan(input);
  const draft = assembleWeeklyDraft({
    input,
    weekStart: ctx.weekStart,
    profile: ctx.profile,
    result,
    dessertCandidates,
    storeName: specialsSource?.storeName ?? null,
    notes,
  });
  if (!draft) return { skip: "There weren't enough suitable recipes to draft next week." };
  return { draft };
}
