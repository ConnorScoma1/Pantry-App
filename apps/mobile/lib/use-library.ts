import type { LibraryFacetCounts, Result } from "@kitchen-pantry/database";
import { recipeCostsResultSchema } from "@kitchen-pantry/grocery-pricing";
import { departmentFor, recipeCostInput } from "@kitchen-pantry/meal-planner";
import {
  applyVariety,
  buildMenu,
  collapseVersions,
  cuisineMenuTemplate,
  formatAmount,
  householdProfile,
  isCookable,
  MENU_TEMPLATES,
  newCuisines,
  parseRecipeRequest,
  rankRecipe,
  rankRecipes,
  templatesFor,
  varietyHistory,
  type BuiltMenu,
  type LibraryQuery,
  type MenuTemplate,
  type ParsedRequest,
  type RankedRecipe,
} from "@kitchen-pantry/recipe-engine";
import { worldCuisines, type Recipe, type SavedMenu, type VarietyMode } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "./config";
import { useApp } from "./app-state";
import type { useRecipes } from "./use-recipes";

/**
 * The recipe library and menus on the phone (spec 08) — the same engine as
 * the web app: search runs in the database (or on the device in preview),
 * then results are ranked for the household with allergies, diet and
 * equipment as hard filters and the variety engine on top.
 */
type RecipesData = ReturnType<typeof useRecipes>;
const PAGE = 20;

export function useLibrary(data: RecipesData) {
  const profile = data.context.profile;
  const [text, setText] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [includeIdeas, setIncludeIdeas] = useState(false);
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [results, setResults] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<LibraryFacetCounts | null>(null);
  const run = useRef(0);

  useEffect(() => {
    void data.repo.facets().then((f) => f.ok && setFacets(f.data));
  }, [data.repo]);

  const history = useMemo(() => varietyHistory(data.recipes, data.events, data.myRatings, data.context.today), [data.recipes, data.events, data.myRatings, data.context.today]);

  const search = useCallback(
    async (offset = 0) => {
      const id = ++run.current;
      const hh = householdProfile(profile);
      const p = text.trim() ? parseRecipeRequest(text, { dietStyle: hh.diet.style }) : null;
      setParsed(p);
      const q: LibraryQuery = { ...(p?.query ?? {}) };
      if (cuisine) q.cuisines = [cuisine];
      if (hh.diet.allergies.length) q.excludeAllergens = [...hh.diet.allergies];
      if (hh.diet.style !== "omnivore") q.diet = [...new Set([...(q.diet ?? []), hh.diet.style])];
      if (includeIdeas) q.statuses = ["tested", "reviewed", "pending_review", "idea"];
      if (p?.avoidRecent) q.excludeIds = [...history.cooked.keys()].slice(0, 200);
      Object.assign(q, { limit: PAGE, offset, sort: q.text ? "relevance" : "rotate", seed: data.context.today });
      setLoading(true);
      const r = await data.repo.search(q);
      if (id !== run.current) return;
      setLoading(false);
      if (!r.ok) return setError(r.message);
      setError(null);
      setTotal(r.data.total);
      setResults((prev) => (offset === 0 ? r.data.recipes : [...prev, ...r.data.recipes.filter((x) => !prev.some((y) => y.id === x.id))]));
    },
    [text, cuisine, includeIdeas, profile, history, data.repo, data.context.today],
  );

  useEffect(() => {
    const t = setTimeout(() => void search(0), text ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, text]);

  const ranked = useMemo(() => {
    const list = results.map((r) => rankRecipe(r, data.context)).filter((r) => r.allowed && !r.dismissed);
    const ordered = parsed?.query.text ? list : applyVariety(list, history, parsed?.variety ?? "balanced", data.context.today);
    return collapseVersions(ordered, (r) => r.recipe).map((x) => ({ ranked: x.item, otherVersions: x.otherVersions }));
  }, [results, data.context, parsed, history]);

  return {
    text,
    setText,
    cuisine,
    setCuisine,
    includeIdeas,
    setIncludeIdeas,
    parsed,
    results: ranked,
    total,
    loading,
    error,
    facets,
    canLoadMore: results.length < total,
    loadMore: () => search(results.length),
  };
}

export function useForYou(data: RecipesData, ranked: RankedRecipe[], mode: VarietyMode) {
  return useMemo(() => {
    const h = varietyHistory(data.recipes, data.events, data.myRatings, data.context.today);
    return {
      results: collapseVersions(applyVariety(ranked, h, mode, data.context.today), (r) => r.recipe).map((x) => ({ ranked: x.item, otherVersions: x.otherVersions })),
      newCuisines: newCuisines(data.recipes.filter(isCookable), h).slice(0, 6),
    };
  }, [data.recipes, data.events, data.myRatings, data.context.today, ranked, mode]);
}

export type DraftVersion = "simplified" | "budget" | "elevated" | "traditional" | "full";

/** AI drafts run on the web server (the Claude key never ships in the app); preview mode has no server account. */
export function useRecipeDraft(data: RecipesData) {
  const { mode, accessToken } = useApp();
  const [busy, setBusy] = useState<DraftVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useCallback(
    async (recipe: Recipe, version: DraftVersion): Promise<Result<{ recipe: Recipe; changes: string[]; cached: boolean }>> => {
      setError(null);
      const token = await accessToken();
      if (mode === "preview" || !apiUrl || !token) {
        const message = "AI drafts need an account and the Kitchen Pantry server. Sign in to use them.";
        setError(message);
        return { ok: false, message };
      }
      setBusy(version);
      try {
        const res = await fetch(`${apiUrl}/api/recipes/draft`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId: recipe.id, version }),
        });
        const body = (await res.json()) as Result<{ recipe: Recipe; changes: string[]; cached: boolean }>;
        if (!body.ok) setError(body.message);
        else data.remember([body.data.recipe]);
        return body;
      } catch {
        const message = "We couldn't reach the server. Check your connection and try again.";
        setError(message);
        return { ok: false, message };
      } finally {
        setBusy(null);
      }
    },
    [mode, accessToken, data],
  );
  return { busy, error, request };
}

export function templateByCode(code: string | null): MenuTemplate | null {
  if (!code) return null;
  if (code.startsWith("cuisine:")) {
    const c = code.slice(8);
    const label = worldCuisines.find((w) => w.code === c)?.label;
    return label ? cuisineMenuTemplate(c, label) : null;
  }
  return MENU_TEMPLATES.find((t) => t.code === code) ?? null;
}

function courseQueries(t: MenuTemplate): LibraryQuery[] {
  const statuses: LibraryQuery["statuses"] = ["tested", "reviewed", "pending_review", "idea"];
  return t.courses.flatMap((c) => {
    const m = c.match;
    const term = m.terms?.[0] ?? m.dishKeys?.[0]?.replace(/-/g, " ");
    return [
      { statuses, limit: 40, sort: "relevance" as const, ...(m.courses ? { courses: m.courses } : {}), ...(m.cuisines ? { cuisines: m.cuisines } : t.cuisine && !m.terms ? { cuisines: [t.cuisine] } : {}), ...(m.categories && !m.courses ? { categories: m.categories } : {}) },
      ...(term ? [{ statuses, limit: 12, text: term }] : []),
    ];
  });
}

/** Menus on the phone: the same builder as the web app, with real store prices only. */
export function useMenus(data: RecipesData) {
  const { menus: repo, grocery, stores, accessToken } = useApp();
  const profile = data.context.profile;
  const [saved, setSaved] = useState<SavedMenu[]>([]);
  const [template, setTemplate] = useState<MenuTemplate | null>(null);
  const [guests, setGuests] = useState(profile.household.cookingFor || 4);
  const [budgetCents, setBudgetCents] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Recipe[]>([]);
  const [pinned, setPinned] = useState<Map<number, string>>(new Map());
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [storeName, setStoreName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void repo.list().then((r) => r.ok && setSaved(r.data));
  }, [repo]);

  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    void Promise.all(courseQueries(template).map((q) => data.repo.search(q))).then((pages) => {
      if (cancelled) return;
      const all = new Map<string, Recipe>();
      for (const p of pages) if (p.ok) for (const r of p.data.recipes) all.set(r.id, r);
      setCandidates([...all.values()]);
    });
    return () => {
      cancelled = true;
    };
  }, [template, data.repo]);

  const pool = useMemo(() => {
    const all = new Map<string, Recipe>([...data.recipes, ...candidates].map((r) => [r.id, r]));
    return rankRecipes([...all.values()], data.context, { course: "any", includeAboveSkill: true, includeIdeas: true }).recipes;
  }, [data.recipes, candidates, data.context]);

  const menu: BuiltMenu | null = useMemo(
    () => (template ? buildMenu(template, pool, { guests, skill: profile.skillLevel, budgetCents, prices, allergies: profile.diet.allergies, pinned }) : null),
    [template, pool, guests, profile.skillLevel, profile.diet.allergies, budgetCents, prices, pinned],
  );

  // Verified prices from the household's store, through the web server (no estimates).
  const ids = menu ? menu.courses.map((c) => c.recipe?.id ?? "").join(",") : "";
  useEffect(() => {
    if (!menu || !apiUrl) return;
    let cancelled = false;
    void (async () => {
      const [store, token] = await Promise.all([stores.get(), accessToken()]);
      if (!store.ok || !store.data || !token) return;
      const todo = menu.courses.map((c) => c.recipe).filter((r): r is Recipe => Boolean(r) && isCookable(r!) && !prices.has(r!.id));
      if (!todo.length) return;
      try {
        const res = await fetch(`${apiUrl}/api/pricing/recipe-costs`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: store.data.storeId, recipes: todo.map(recipeCostInput) }),
        });
        const body = (await res.json()) as Result<unknown>;
        const parsed = body.ok ? recipeCostsResultSchema.safeParse(body.data) : null;
        if (cancelled || !parsed?.success) return;
        setStoreName(store.data.name);
        setPrices((prev) => {
          const next = new Map(prev);
          for (const c of parsed.data.costs) if (c.complete && c.perServingCents !== null) next.set(c.id, c.perServingCents);
          return next;
        });
      } catch {
        // Prices are optional; the menu says when it couldn't check them.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const choose = useCallback((code: string | null) => {
    setTemplate(templateByCode(code));
    setPinned(new Map());
    setNotice(null);
  }, []);

  const save = useCallback(async () => {
    if (!menu) return;
    const r = await repo.save({ templateCode: menu.template.code, title: menu.template.title, guests: menu.guests, budgetCents, courses: menu.courses.map((c) => ({ course: c.course, label: c.label, recipeId: c.recipe?.id ?? null })) });
    setNotice(r.ok ? "Menu saved." : r.message);
    const list = await repo.list();
    if (list.ok) setSaved(list.data);
  }, [menu, repo, budgetCents]);

  const addToGrocery = useCallback(async () => {
    if (!menu) return;
    const list = await grocery.currentList();
    if (!list.ok) return setNotice(list.message);
    const listId = list.data.id;
    let added = 0;
    for (const item of menu.shopping) {
      const amount = item.quantity !== null ? `${formatAmount(item.quantity)}${item.unit ? ` ${item.unit}` : ""}` : null;
      const r = await grocery.add(listId, { name: item.item.slice(0, 120), department: departmentFor(item.item), amount, note: `For ${menu.template.title}` });
      if (r.ok) added += 1;
    }
    setNotice(`Added ${added} ${added === 1 ? "item" : "items"} to your grocery list.`);
  }, [menu, grocery]);

  return {
    templates: templatesFor(profile.seasonal?.holidayOptIns ?? []),
    template,
    choose,
    guests,
    setGuests,
    budgetCents,
    setBudgetCents,
    menu,
    pin: (i: number, id: string) => setPinned((prev) => new Map(prev).set(i, id)),
    storeName,
    saved,
    save,
    open: (m: SavedMenu) => {
      setTemplate(templateByCode(m.templateCode));
      setGuests(m.guests);
      setBudgetCents(m.budgetCents);
      setPinned(new Map(m.courses.flatMap((c, i) => (c.recipeId ? [[i, c.recipeId] as [number, string]] : []))));
    },
    remove: async (id: string) => {
      const r = await repo.remove(id);
      if (r.ok) setSaved((prev) => prev.filter((m) => m.id !== id));
    },
    addToGrocery,
    notice,
  };
}
