"use client";

import { recipeCostsResultSchema } from "@kitchen-pantry/grocery-pricing";
import { createLocalMenuRepository, type MenuRepository, type Result } from "@kitchen-pantry/database";
import { departmentFor, recipeCostInput } from "@kitchen-pantry/meal-planner";
import {
  buildMenu,
  cuisineMenuTemplate,
  formatAmount,
  isCookable,
  MENU_TEMPLATES,
  rankRecipes,
  templatesFor,
  type BuiltMenu,
  type LibraryQuery,
  type MenuTemplate,
} from "@kitchen-pantry/recipe-engine";
import { labelFor, worldCuisines, type Recipe, type SavedMenu } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pricingStatusAction, recipeCostsAction } from "@/app/(app)/grocery/actions";
import { deleteMenuAction, menusAction, saveMenuAction } from "@/app/(app)/recipes/library-actions";
import { browserStorage } from "@/lib/browser-storage";
import { useGrocery } from "@/lib/grocery/use-grocery";
import { loadSavedStore } from "@/lib/pricing/use-pricing";
import type { useRecipes } from "@/lib/recipes/use-recipes";

/**
 * Menus (spec 08 §4): pick a template, fill each course from the library
 * (searched per course, so it works with 50,000 recipes), scale it to the
 * guests, the cook's skill and time, and — only with the household's store
 * prices — the budget. Menus can be saved and sent to the grocery list.
 */
const supabaseMenus: MenuRepository = {
  list: () => menusAction(),
  save: (m) => saveMenuAction(m),
  remove: (id) => deleteMenuAction(id),
};
let localMenus: MenuRepository | null = null;

export interface MenuSettings {
  guests: number;
  budgetCents: number | null;
  maxActiveMinutes: number | null;
  stretch: boolean;
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

/** Library searches that find candidates for each course of a template. */
function courseQueries(t: MenuTemplate): LibraryQuery[] {
  const statuses: LibraryQuery["statuses"] = ["tested", "reviewed", "pending_review", "idea"];
  const out: LibraryQuery[] = [];
  for (const c of t.courses) {
    const m = c.match;
    out.push({ statuses, limit: 40, sort: "relevance", ...(m.courses ? { courses: m.courses } : {}), ...(m.cuisines ? { cuisines: m.cuisines } : t.cuisine && !m.terms ? { cuisines: [t.cuisine] } : {}), ...(m.categories && !m.courses ? { categories: m.categories } : {}) });
    const term = m.terms?.[0] ?? m.dishKeys?.[0]?.replace(/-/g, " ");
    if (term) out.push({ statuses, limit: 12, text: term });
  }
  return out;
}

export function useMenus(data: ReturnType<typeof useRecipes>) {
  const repo = data.mode === "preview" ? (localMenus ??= createLocalMenuRepository(browserStorage)) : supabaseMenus;
  const grocery = useGrocery();
  const profile = data.context.profile;
  const [saved, setSaved] = useState<SavedMenu[]>([]);
  const [template, setTemplate] = useState<MenuTemplate | null>(null);
  const [settings, setSettings] = useState<MenuSettings>({ guests: profile.household.cookingFor || 4, budgetCents: null, maxActiveMinutes: null, stretch: false });
  const [candidates, setCandidates] = useState<Recipe[]>([]);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [store, setStore] = useState<{ name: string; checked: boolean } | null>(null);
  const [pinned, setPinned] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void repo.list().then((r) => {
      if (r.ok) setSaved(r.data);
    });
  }, [repo]);

  // Candidates for each course of the chosen template.
  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all(courseQueries(template).map((q) => data.repo.search(q))).then((pages) => {
      if (cancelled) return;
      const seen = new Map<string, Recipe>();
      for (const p of pages) if (p.ok) for (const r of p.data.recipes) seen.set(r.id, r);
      setCandidates([...seen.values()]);
      setLoading(false);
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
    () =>
      template
        ? buildMenu(template, pool, {
            guests: settings.guests,
            skill: profile.skillLevel,
            stretch: settings.stretch,
            maxActiveMinutes: settings.maxActiveMinutes,
            budgetCents: settings.budgetCents,
            prices,
            allergies: profile.diet.allergies,
            pinned,
          })
        : null,
    [template, pool, settings, profile.skillLevel, profile.diet.allergies, prices, pinned],
  );

  // Real store prices for the picked recipes (and their alternatives), when the household has a store.
  const pickIds = menu ? menu.courses.flatMap((c) => [c.recipe, ...c.alternatives]).filter((r): r is Recipe => Boolean(r) && isCookable(r!)).map((r) => r.id).join(",") : "";
  useEffect(() => {
    if (!menu || !pickIds) return;
    let cancelled = false;
    void (async () => {
      const [status, s] = await Promise.all([pricingStatusAction(), loadSavedStore(data.mode)]);
      const st = s.ok ? s.data : null;
      if (!status.enabled || !st) {
        if (!cancelled) setStore(null);
        return;
      }
      const todo = menu.courses.flatMap((c) => [c.recipe, ...c.alternatives]).filter((r): r is Recipe => Boolean(r) && isCookable(r!) && !prices.has(r!.id)).slice(0, 12);
      if (todo.length === 0) return;
      const r = await recipeCostsAction({ storeId: st.storeId, recipes: todo.map(recipeCostInput) });
      const parsed = r.ok ? recipeCostsResultSchema.safeParse(r.data) : null;
      if (cancelled || !parsed?.success) return;
      setStore({ name: st.name, checked: true });
      setPrices((prev) => {
        const next = new Map(prev);
        // Only complete costs: a partly priced recipe would make the menu look cheaper than it is.
        for (const c of parsed.data.costs) if (c.complete && c.perServingCents !== null) next.set(c.id, c.perServingCents);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickIds, data.mode]);

  const choose = useCallback((code: string | null) => {
    setTemplate(templateByCode(code));
    setPinned(new Map());
    setNotice(null);
  }, []);

  const pin = useCallback((index: number, recipeId: string) => setPinned((prev) => new Map(prev).set(index, recipeId)), []);

  const save = useCallback(async (): Promise<Result<{ id: string }>> => {
    if (!menu) return { ok: false, message: "Pick a menu first." };
    const r = await repo.save({
      templateCode: menu.template.code,
      title: menu.template.title,
      guests: menu.guests,
      budgetCents: settings.budgetCents,
      courses: menu.courses.map((c) => ({ course: c.course, label: c.label, recipeId: c.recipe?.id ?? null })),
    });
    if (r.ok) {
      setNotice("Menu saved.");
      const list = await repo.list();
      if (list.ok) setSaved(list.data);
    } else setNotice(r.message);
    return r;
  }, [menu, repo, settings.budgetCents]);

  const open = useCallback((m: SavedMenu) => {
    const t = templateByCode(m.templateCode);
    if (!t) return;
    setTemplate(t);
    setSettings((s) => ({ ...s, guests: m.guests, budgetCents: m.budgetCents }));
    setPinned(new Map(m.courses.flatMap((c, i) => (c.recipeId ? [[i, c.recipeId] as [number, string]] : []))));
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const r = await repo.remove(id);
      if (r.ok) setSaved((prev) => prev.filter((m) => m.id !== id));
    },
    [repo],
  );

  const addToGrocery = useCallback(async () => {
    if (!menu) return;
    let added = 0;
    for (const item of menu.shopping) {
      const amount = item.quantity !== null ? `${formatAmount(item.quantity)}${item.unit ? ` ${item.unit}` : ""}` : null;
      const r = await grocery.add({ name: item.item.slice(0, 120), department: departmentFor(item.item), amount, note: `For ${menu.template.title}`.slice(0, 200) });
      if (r.ok) added += 1;
    }
    setNotice(`Added ${added} ${added === 1 ? "item" : "items"} to your grocery list.`);
  }, [menu, grocery]);

  return {
    templates: templatesFor(profile.seasonal?.holidayOptIns ?? []),
    cuisineChoices: worldCuisines.map((c) => ({ code: c.code, label: labelFor(worldCuisines, c.code) })),
    template,
    choose,
    settings,
    setSettings,
    menu,
    loading,
    pin,
    store,
    saved,
    save,
    open,
    remove,
    addToGrocery,
    groceryReady: !grocery.loading,
    notice,
  };
}
