"use client";

import { createLocalMealPlanRepository, CONFIRMED_PLAN, type MealPlanRepository, type Result } from "@kitchen-pantry/database";
import {
  applyDessertPicks,
  applyPicks,
  cookTheSpecialsTerms,
  confirmPlan,
  dessertDays,
  draftToInput,
  planDesserts,
  daysToPlan,
  emptyPlan,
  planWeek,
  suggestSwap,
  toDraft,
  weekBasket,
  type PlanDraft,
  type PlannedPick,
} from "@kitchen-pantry/meal-planner";
import type { RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { specialsResultSchema, type Special } from "@kitchen-pantry/grocery-pricing";
import { pricingStatusAction, specialsAction } from "@/app/(app)/grocery/actions";
import { loadSavedStore } from "@/lib/pricing/use-pricing";
import type { MealPlan, PlanningMode, PlanSource, Recipe } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  aiStatusAction,
  generatePlanAction,
  getWeekAction,
  previousWeeksAction,
  saveWeekAction,
} from "@/app/(app)/plan/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";
import { useRecipes } from "@/lib/recipes/use-recipes";

const supabasePlans: MealPlanRepository = {
  getWeek: (w) => getWeekAction(w),
  save: (input, o) => saveWeekAction(input, Boolean(o?.overwriteConfirmed)),
  previous: (b) => previousWeeksAction(b),
};

let previewPlans: MealPlanRepository | null = null;
function previewRepository(): MealPlanRepository {
  previewPlans ??= createLocalMealPlanRepository(browserStorage);
  return previewPlans;
}

export interface PlanMessage {
  tone: "info" | "warning" | "error";
  text: string;
}

/**
 * One week's meal plan plus everything needed to build and edit it.
 * Planning with Claude happens on the server; the deterministic planner
 * runs here for swaps and whenever AI isn't available.
 */
export function useMealPlan(weekStart: string) {
  const { mode: dataMode, profile } = useProfile();
  const recipesData = useRecipes();
  const repo = dataMode === "preview" ? previewRepository() : supabasePlans;

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "building" | "saving">(null);
  const [message, setMessage] = useState<PlanMessage | null>(null);
  const [ai, setAi] = useState<{ enabled: boolean; remaining: number | null }>({ enabled: false, remaining: null });
  const seedRef = useRef(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    void repo.getWeek(weekStart).then((r) => {
      if (cancelled) return;
      if (r.ok) setPlan(r.data);
      else setMessage({ tone: "error", text: r.message });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, weekStart]);

  useEffect(() => {
    void aiStatusAction()
      .then(setAi)
      .catch(() => setAi({ enabled: false, remaining: null }));
  }, []);

  /** Safe candidates: allowed, not "Not for us", within skill. */
  const candidates = useMemo(() => recipesData.rank().recipes, [recipesData.rank]);
  /** Every recipe (including hidden ones) so planned meals always render. */
  const byId = useMemo(() => {
    const all = recipesData.rank({ includeAboveSkill: true, course: "any" });
    return new Map([...all.recipes, ...all.hidden, ...all.dismissed].map((x) => [x.recipe.id, x] as const));
  }, [recipesData.rank]);

  const draft: PlanDraft = useMemo(() => (plan ? toDraft(plan) : emptyPlan(weekStart)), [plan, weekStart]);

  /** Desserts this household can have, in its preferred categories (empty = all). */
  const dessertCandidates = useMemo(
    () => recipesData.rank({ course: "dessert", dessertCategories: profile.desserts.categories }).recipes,
    [recipesData.rank, profile.desserts.categories],
  );
  /** Every suitable dessert, for "Add dessert" (categories are a filter there). */
  const allDesserts = useMemo(() => recipesData.rank({ course: "dessert" }).recipes, [recipesData.rank]);

  /** Automatic desserts per the household's frequency; hand-picked ones stay. */
  const withAutoDesserts = useCallback(
    (d: PlanDraft): PlanDraft => {
      const kept = d.desserts.filter((x) => x.locked);
      const days = dessertDays(weekStart, profile.desserts.frequency, recipesData.context.today, d.meals.map((m) => m.date)).filter((day) => !kept.some((x) => x.date === day));
      const dinners = d.meals.map((m) => (m.recipeId ? byId.get(m.recipeId)?.recipe : undefined)).filter((r): r is Recipe => Boolean(r));
      const picks = planDesserts({
        weekStart,
        days,
        candidates: dessertCandidates,
        dinners,
        servings: profile.household.cookingFor,
        avoid: new Set(kept.map((x) => x.recipeId).filter((x): x is string => Boolean(x))),
        seed: seedRef.current,
      });
      return applyDessertPicks(d, picks);
    },
    [weekStart, profile.desserts.frequency, profile.household.cookingFor, recipesData.context.today, byId, dessertCandidates],
  );

  const save = useCallback(
    async (next: PlanDraft, overwriteConfirmed: boolean): Promise<Result<MealPlan>> => {
      setBusy((b) => b ?? "saving");
      const result = await repo.save(draftToInput(next), { overwriteConfirmed });
      setBusy(null);
      if (result.ok) setPlan(result.data);
      else if ((result as { code?: string }).code !== CONFIRMED_PLAN) setMessage({ tone: "error", text: result.message });
      return result;
    },
    [repo],
  );

  // Cook the Specials: the last sale prices used (kept for swaps).
  const specialsRef = useRef<{ specials: Special[]; source: { storeName: string; checkedAt: string } | null }>({ specials: [], source: null });

  /** Sale prices for what the candidate recipes need, from the household's store. Never invented. */
  const loadSpecials = useCallback(async (): Promise<{ specials: Special[]; source: { storeName: string; checkedAt: string } | null; notice: string | null }> => {
    const none = (notice: string) => ({ specials: [], source: null, notice });
    const [status, store] = await Promise.all([pricingStatusAction(), loadSavedStore(dataMode)]);
    if (!status.enabled) return none("Store prices aren't connected, so Cook the Specials planned like Balanced.");
    if (!store.ok || !store.data) return none("Choose your store on the Grocery List to cook the specials — this week was planned like Balanced.");
    const terms = cookTheSpecialsTerms(candidates);
    if (terms.length === 0) return none("Nothing to check at the store this week.");
    const r = await specialsAction({ storeId: store.data.storeId, terms });
    if (!r.ok) return none(`${r.message} This week was planned like Balanced.`);
    const parsed = specialsResultSchema.safeParse(r.data);
    if (!parsed.success) return none("Sale prices came back in an unexpected shape, so this week was planned like Balanced.");
    return { specials: parsed.data.specials as Special[], source: { storeName: store.data.name, checkedAt: parsed.data.fetchedAt }, notice: null };
  }, [candidates, dataMode]);

  /** Build (or rebuild) the open nights. Locked and custom meals stay. */
  const build = useCallback(
    async (mode: PlanningMode, options: { regenerate?: boolean } = {}) => {
      setBusy("building");
      setMessage(null);
      if (options.regenerate) seedRef.current += 1;
      const days = daysToPlan(draft, profile.household.dinnersPerWeek, recipesData.context.today);
      const fixed = draft.meals.filter((m) => m.locked || m.customTitle).map((m) => ({ date: m.date, recipeId: m.recipeId }));
      const avoid = options.regenerate ? draft.meals.filter((m) => !m.locked && m.recipeId).map((m) => m.recipeId!) : [];
      let specialsNotice: string | null = null;
      if (mode === "cook_the_specials") {
        const loaded = await loadSpecials();
        specialsRef.current = { specials: loaded.specials, source: loaded.source };
        specialsNotice = loaded.notice;
      }
      const localInput = {
        days,
        candidates,
        mode,
        goals: profile.goals.ranked,
        servings: profile.household.cookingFor,
        fixed,
        avoid: new Set(avoid),
        seed: seedRef.current,
        specials: mode === "cook_the_specials" ? specialsRef.current.specials : [],
        specialsSource: mode === "cook_the_specials" ? specialsRef.current.source : null,
      };

      let picks: PlannedPick[] = [];
      let summary: string | null = null;
      let source: PlanSource = "rules";
      let notice: string | null = null;

      if (ai.enabled && days.length > 0) {
        const preview =
          dataMode === "preview"
            ? {
                profile,
                pantry: recipesData.context.pantry.map((p) => ({
                  id: p.id, name: p.name, category: p.category, quantity: p.quantity, unit: p.unit,
                  storageLocation: p.storageLocation, useBy: p.useBy, isStaple: p.isStaple,
                })),
                favorites: [...recipesData.favorites],
                myRatings: [...recipesData.myRatings.values()].map((r) => ({
                  recipeId: r.recipeId, overall: r.overall, wouldCookAgain: r.wouldCookAgain, createdAt: r.createdAt,
                })),
                events: [...recipesData.dismissed].map((id) => ({ recipeId: id, event: "dismissed", surface: "recipes", createdAt: new Date().toISOString() })),
              }
            : undefined;
        try {
          const res = await generatePlanAction(
            { weekStart, days, mode, seed: seedRef.current, avoid, fixed, specials: localInput.specials, specialsSource: localInput.specialsSource },
            preview,
          );
          if (res.ok) {
            // Double-check on this device: only recipes this household can have.
            const safe = new Set(candidates.map((c) => c.recipe.id));
            picks = res.data.picks.filter((p) => safe.has(p.recipeId) && days.includes(p.date));
            summary = res.data.summary;
            source = res.data.source;
            notice = res.data.notice;
            if (res.data.source === "ai") setAi((a) => ({ ...a, remaining: a.remaining === null ? null : Math.max(0, a.remaining - 1) }));
          } else {
            notice = res.message;
          }
        } catch {
          notice = "Couldn't reach the planner, so here's our standard plan.";
        }
      }

      if (days.length === 0) {
        setBusy(null);
        setMessage({ tone: "info", text: "There are no nights left to plan this week. Try next week." });
        return;
      }

      // Fill anything left (or everything, without AI) with the on-device planner.
      const missing = days.filter((d) => !picks.some((p) => p.date === d));
      if (missing.length > 0) {
        const extra = planWeek({
          ...localInput,
          days: missing,
          fixed: [...fixed, ...picks.map((p) => ({ date: p.date, recipeId: p.recipeId }))],
        });
        picks = [...picks, ...extra.picks];
        if (!summary) summary = extra.summary;
        if (extra.unfilled.length > 0) {
          notice = `We couldn't find enough suitable recipes for ${extra.unfilled.length} night${extra.unfilled.length === 1 ? "" : "s"}. Add a meal of your own or loosen a filter.`;
        }
      }

      const next = withAutoDesserts(applyPicks(draft, picks, { source, summary, mode }));
      const saved = await save(next, true);
      setBusy(null);
      const warn = [specialsNotice, notice].filter(Boolean).join(" ");
      if (saved.ok && warn) setMessage({ tone: "warning", text: warn });
    },
    [ai.enabled, candidates, dataMode, draft, profile, recipesData, save, weekStart, withAutoDesserts, loadSpecials],
  );

  /** Next-best recipe for one night — instant and free (no AI call). */
  const proposeSwap = useCallback(
    (date: string, skip: ReadonlySet<string> = new Set()): PlannedPick | null => {
      const current = draft.meals.find((m) => m.date === date);
      return suggestSwap(
        {
          candidates,
          mode: draft.mode,
          goals: profile.goals.ranked,
          servings: current?.servings ?? profile.household.cookingFor,
          fixed: draft.meals.map((m) => ({ date: m.date, recipeId: m.recipeId })),
          seed: seedRef.current,
          specials: draft.mode === "cook_the_specials" ? specialsRef.current.specials : [],
        },
        date,
        current?.recipeId ?? null,
        skip,
      );
    },
    [candidates, draft, profile],
  );

  const plannedRanked = useMemo(
    () => draft.meals.map((m) => (m.recipeId ? byId.get(m.recipeId) : undefined)).filter((r): r is RankedRecipe => Boolean(r)),
    [draft.meals, byId],
  );
  const basket = useMemo(() => weekBasket(plannedRanked), [plannedRanked]);

  return {
    loading: loading || recipesData.loading,
    today: recipesData.context.today,
    busy,
    plan,
    draft,
    message,
    setMessage,
    ai,
    candidates,
    byId,
    dessertCandidates,
    allDesserts,
    basket,
    recipesData,
    build,
    proposeSwap,
    /** Save an edited week. Pass `overwriteConfirmed` only after the person agreed. */
    save,
    confirm: () => save(confirmPlan(draft), true),
    unconfirm: () => save({ ...draft, confirmedAt: null }, true),
    previous: () => repo.previous(weekStart),
  };
}
