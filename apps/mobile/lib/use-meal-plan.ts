import { CONFIRMED_PLAN, type Result } from "@kitchen-pantry/database";
import {
  cheaperSwaps,
  cheaperWeekToPrice,
  recipeCostInput,
  type CheaperSwap,
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
import { recipeCostsResultSchema, specialsResultSchema, type RecipeCost, type Special } from "@kitchen-pantry/grocery-pricing";
import type { MealPlan, PlanningMode, PlanSource, Recipe } from "@kitchen-pantry/shared-types";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, useProfile } from "./app-state";
import { apiUrl } from "./config";
import { useRecipes } from "./use-recipes";
import { useActiveTrip } from "./use-shopping";

export interface PlanMessage {
  tone: "info" | "warning" | "error";
  text: string;
}

interface GeneratedPlan {
  picks: PlannedPick[];
  summary: string;
  source: PlanSource;
  notice: string | null;
}

/**
 * Same behaviour as the web hook. Planning with Claude goes through the
 * Kitchen Pantry server (EXPO_PUBLIC_API_URL) with the user's Supabase
 * token; without it, or in preview mode, the built-in planner runs on the
 * phone. Either way, picks are re-checked here against this household's
 * safe recipes before anything is saved.
 */
export function useMealPlan(weekStart: string) {
  const { mealPlans: repo, accessToken, mode: dataMode, stores } = useApp();
  const profile = useProfile();
  const recipesData = useRecipes();

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "building" | "saving" | "pricing">(null);
  const [message, setMessage] = useState<PlanMessage | null>(null);
  const [ai, setAi] = useState<{ enabled: boolean; remaining: number | null }>({ enabled: false, remaining: null });
  const seedRef = useRef(1);

  const reload = useCallback(async () => {
    const r = await repo.getWeek(weekStart);
    if (r.ok) setPlan(r.data);
    else setMessage({ tone: "error", text: r.message });
    setLoading(false);
  }, [repo, weekStart]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const callServer = useCallback(
    async (method: "GET" | "POST", body?: unknown): Promise<unknown> => {
      if (!apiUrl || dataMode !== "supabase") return null;
      const token = await accessToken();
      if (!token) return null;
      const res = await fetch(`${apiUrl}/api/meal-plan`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    },
    [accessToken, dataMode],
  );

  useEffect(() => {
    void callServer("GET")
      .then((s) => {
        const status = s as { enabled?: boolean; remaining?: number | null } | null;
        setAi({ enabled: Boolean(status?.enabled), remaining: status?.remaining ?? null });
      })
      .catch(() => setAi({ enabled: false, remaining: null }));
  }, [callServer]);

  const candidates = useMemo(() => recipesData.rank().recipes, [recipesData.rank]);
  const byId = useMemo(() => {
    const all = recipesData.rank({ includeAboveSkill: true, course: "any" });
    return new Map([...all.recipes, ...all.hidden, ...all.dismissed].map((x) => [x.recipe.id, x] as const));
  }, [recipesData.rank]);
  const draft: PlanDraft = useMemo(() => (plan ? toDraft(plan) : emptyPlan(weekStart)), [plan, weekStart]);

  // Same dessert behaviour as the web hook.
  const dessertCandidates = useMemo(
    () => recipesData.rank({ course: "dessert", dessertCategories: profile.desserts.categories }).recipes,
    [recipesData.rank, profile.desserts.categories],
  );
  const allDesserts = useMemo(() => recipesData.rank({ course: "dessert" }).recipes, [recipesData.rank]);
  const withAutoDesserts = useCallback(
    (d: PlanDraft): PlanDraft => {
      const kept = d.desserts.filter((x) => x.locked);
      const days = dessertDays(weekStart, profile.desserts.frequency, recipesData.context.today, d.meals.map((m) => m.date)).filter((day) => !kept.some((x) => x.date === day));
      const dinners = d.meals.map((m) => (m.recipeId ? byId.get(m.recipeId)?.recipe : undefined)).filter((r): r is Recipe => Boolean(r));
      return applyDessertPicks(
        d,
        planDesserts({
          weekStart,
          days,
          candidates: dessertCandidates,
          dinners,
          servings: profile.household.cookingFor,
          avoid: new Set(kept.map((x) => x.recipeId).filter((x): x is string => Boolean(x))),
          seed: seedRef.current,
        }),
      );
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

  // Cook the Specials: sale prices from the household's store, via the Kitchen Pantry server.
  const specialsRef = useRef<{ specials: Special[]; source: { storeName: string; checkedAt: string } | null }>({ specials: [], source: null });
  // The household's planned shopping trip: its stores' specials count too (spec 03 §6).
  const trip = useActiveTrip();
  const tripRef = useRef(trip.trip);
  tripRef.current = trip.trip;
  const loadSpecials = useCallback(async (): Promise<string | null> => {
    specialsRef.current = { specials: [], source: null };
    if (dataMode !== "supabase" || !apiUrl) return "Sign in (with the Kitchen Pantry server set up) to cook the specials — this week was planned like Balanced.";
    const store = await stores.get();
    const list: Array<{ storeId: string; name: string }> = store.ok && store.data ? [{ storeId: store.data.storeId, name: store.data.name }] : [];
    for (const st of tripRef.current?.stops ?? []) {
      const id = st.storeKey.startsWith("kroger:") ? st.storeKey.slice(7) : null;
      if (id && !list.some((x) => x.storeId === id)) list.push({ storeId: id, name: st.name });
    }
    if (list.length === 0) return "Choose your store on the Grocery tab to cook the specials — this week was planned like Balanced.";
    const token = await accessToken();
    const found: Special[] = [];
    const used: string[] = [];
    let checkedAt: string | null = null;
    let failure: string | null = null;
    for (const st of list.slice(0, 3)) {
      try {
        const res = await fetch(`${apiUrl}/api/pricing/specials`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: st.storeId, terms: cookTheSpecialsTerms(candidates) }),
        });
        const r = (await res.json()) as Result<unknown>;
        if (!r.ok) {
          failure ??= r.message;
          continue;
        }
        const parsed = specialsResultSchema.safeParse(r.data);
        if (!parsed.success) continue;
        found.push(...(parsed.data.specials as Special[]));
        used.push(st.name);
        checkedAt ??= parsed.data.fetchedAt;
      } catch {
        failure ??= "Couldn't reach the Kitchen Pantry server for sale prices.";
      }
    }
    if (used.length === 0) return `${failure ?? "Sale prices couldn't be loaded."} This week was planned like Balanced.`;
    const storeName = used.length === 1 ? used[0]! : `${used.slice(0, -1).join(", ")} and ${used[used.length - 1]}`;
    specialsRef.current = { specials: found.slice(0, 300), source: { storeName: storeName.slice(0, 160), checkedAt: checkedAt! } };
    return null;
  }, [accessToken, candidates, dataMode, stores]);

  const build = useCallback(
    async (mode: PlanningMode, options: { regenerate?: boolean } = {}) => {
      setBusy("building");
      setMessage(null);
      if (options.regenerate) seedRef.current += 1;
      const days = daysToPlan(draft, profile.household.dinnersPerWeek, recipesData.context.today);
      if (days.length === 0) {
        setBusy(null);
        setMessage({ tone: "info", text: "There are no nights left to plan this week. Try next week." });
        return;
      }
      const fixed = draft.meals.filter((m) => m.locked || m.customTitle).map((m) => ({ date: m.date, recipeId: m.recipeId }));
      const avoid = options.regenerate ? draft.meals.filter((m) => !m.locked && m.recipeId).map((m) => m.recipeId!) : [];
      const specialsNotice = mode === "cook_the_specials" ? await loadSpecials() : null;
      const specials = mode === "cook_the_specials" ? specialsRef.current.specials : [];
      const specialsSource = mode === "cook_the_specials" ? specialsRef.current.source : null;

      let picks: PlannedPick[] = [];
      let summary: string | null = null;
      let source: PlanSource = "rules";
      let notice: string | null = null;

      if (ai.enabled) {
        try {
          const res = (await callServer("POST", { weekStart, days, mode, seed: seedRef.current, avoid, fixed, specials, specialsSource })) as
            | { ok: true; data: GeneratedPlan }
            | { ok: false; message: string }
            | null;
          if (res && res.ok) {
            const safe = new Set(candidates.map((c) => c.recipe.id));
            picks = res.data.picks.filter((p) => safe.has(p.recipeId) && days.includes(p.date));
            summary = res.data.summary;
            source = res.data.source;
            notice = res.data.notice;
          } else if (res && !res.ok) {
            notice = res.message;
          }
        } catch {
          notice = "Couldn't reach the planner, so here's our standard plan.";
        }
      }

      const missing = days.filter((d) => !picks.some((p) => p.date === d));
      if (missing.length > 0) {
        const extra = planWeek({
          days: missing,
          candidates,
          mode,
          goals: profile.goals.ranked,
          servings: profile.household.cookingFor,
          fixed: [...fixed, ...picks.map((p) => ({ date: p.date, recipeId: p.recipeId }))],
          avoid: new Set(avoid),
          seed: seedRef.current,
          specials,
          specialsSource,
        });
        picks = [...picks, ...extra.picks];
        if (!summary) summary = extra.summary;
        if (extra.unfilled.length > 0) {
          notice = `We couldn't find enough suitable recipes for ${extra.unfilled.length} night${extra.unfilled.length === 1 ? "" : "s"}. Add a meal of your own or loosen a filter.`;
        }
      }

      const saved = await save(withAutoDesserts(applyPicks(draft, picks, { source, summary, mode })), true);
      setBusy(null);
      const warn = [specialsNotice, notice].filter(Boolean).join(" ");
      if (saved.ok && warn) setMessage({ tone: "warning", text: warn });
    },
    [ai.enabled, callServer, candidates, draft, profile, recipesData.context.today, save, weekStart, withAutoDesserts, loadSpecials],
  );

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

  const planned = useMemo(
    () => draft.meals.map((m) => (m.recipeId ? byId.get(m.recipeId) : undefined)).filter((r): r is RankedRecipe => Boolean(r)),
    [draft.meals, byId],
  );
  const basket = useMemo(() => weekBasket(planned), [planned]);

  /** "Is there a cheaper week?" — same rules as the web (see meal-planner/cheaper-week.ts). */
  const [cheaper, setCheaper] = useState<{ swaps: CheaperSwap[]; storeName: string; notice: string | null } | null>(null);
  const findCheaper = useCallback(async () => {
    const done = (v: typeof cheaper) => {
      setCheaper(v);
      setBusy(null);
    };
    setBusy("pricing");
    if (dataMode !== "supabase" || !apiUrl) return done({ swaps: [], storeName: "", notice: "Sign in (with the Kitchen Pantry server set up) to price swaps at your store." });
    const store = await stores.get();
    if (!store.ok || !store.data) return done({ swaps: [], storeName: "", notice: "Choose your store on the Grocery tab first." });
    const meals = draft.meals.map((m) => ({ date: m.date, recipeId: m.recipeId, servings: m.servings, locked: m.locked || Boolean(m.customTitle) }));
    const todo = cheaperWeekToPrice(meals, candidates);
    const costs = new Map<string, RecipeCost>();
    const token = await accessToken();
    for (const ids of [todo.planned, todo.alternatives]) {
      const recipes = ids.map((id) => byId.get(id)?.recipe).filter((r): r is Recipe => Boolean(r)).map(recipeCostInput);
      if (recipes.length === 0) continue;
      try {
        const res = await fetch(`${apiUrl}/api/pricing/recipe-costs`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: store.data.storeId, recipes }),
        });
        const r = (await res.json()) as Result<unknown>;
        if (!r.ok) return done({ swaps: [], storeName: store.data.name, notice: r.message });
        const parsed = recipeCostsResultSchema.safeParse(r.data);
        if (!parsed.success) return done({ swaps: [], storeName: store.data.name, notice: "Prices came back in an unexpected shape." });
        for (const c of parsed.data.costs) costs.set(c.id, c as RecipeCost);
      } catch {
        return done({ swaps: [], storeName: store.data.name, notice: "Couldn't reach the Kitchen Pantry server." });
      }
    }
    const favourites = new Set([...recipesData.myRatings.values()].filter((x) => x.overall >= 4).map((x) => x.recipeId));
    const swaps = cheaperSwaps(meals, byId, candidates, costs, { favourites });
    const shares = [...costs.values()].map((c) => c.pricedCount / Math.max(1, c.pricedCount + c.unpriced.length));
    const avg = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
    done({
      swaps,
      storeName: store.data.name,
      notice: swaps.length
        ? null
        : avg < 0.7
          ? `Not enough of these recipes could be priced at ${store.data.name} to compare them fairly — about ${Math.round(avg * 100)}% of their ingredients matched a store package.`
          : "No cheaper swaps that are just as good for you this week.",
    });
  }, [accessToken, byId, candidates, dataMode, draft.meals, recipesData.myRatings, stores]);

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
    cheaper,
    findCheaper,
    clearCheaper: () => setCheaper(null),
    save,
    confirm: () => save(confirmPlan(draft), true),
    unconfirm: () => save({ ...draft, confirmedAt: null }, true),
    previous: () => repo.previous(weekStart),
  };
}
