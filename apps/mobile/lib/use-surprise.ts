import type { Result } from "@kitchen-pantry/database";
import { recipeCostsResultSchema, specialsResultSchema, type RecipeCost, type Special } from "@kitchen-pantry/grocery-pricing";
import { cookTheSpecialsTerms, recipeCostInput, surpriseHistory, surpriseMe, type SurpriseResult } from "@kitchen-pantry/meal-planner";
import { tasteProfile } from "@kitchen-pantry/recipe-engine";
import type { SurpriseKind } from "@kitchen-pantry/shared-types";
import { useCallback, useRef, useState } from "react";
import { useApp, useProfile } from "./app-state";
import { apiUrl } from "./config";
import type { useRecipes } from "./use-recipes";

/** Surprise Me on the phone — same engine as the web; store prices come through the Kitchen Pantry server. */
export function useSurprise(data: ReturnType<typeof useRecipes>) {
  const { mode, accessToken, stores } = useApp();
  const profile = useProfile();
  const [kind, setKind] = useState<SurpriseKind | null>(null);
  const [result, setResult] = useState<SurpriseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const priced = useRef<{ storeId: string | null; specials: Special[] | null; costs: Map<string, RecipeCost> }>({ storeId: null, specials: null, costs: new Map() });

  const post = useCallback(
    async (path: string, body: unknown): Promise<Result<unknown>> => {
      const token = await accessToken();
      try {
        const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return (await res.json()) as Result<unknown>;
      } catch {
        return { ok: false, message: "Couldn't reach the Kitchen Pantry server." };
      }
    },
    [accessToken],
  );

  const run = useCallback(
    async (k: SurpriseKind, more = false) => {
      if (!more || k !== kind) seen.current = new Set();
      setKind(k);
      setBusy(true);
      setError(null);
      const ranked = data.rank({ includeAboveSkill: true }).recipes;
      let storeName: string | null = null;
      let specials: Special[] | undefined;
      let costs: Map<string, RecipeCost> | undefined;
      if (k === "specials" || k === "under_5") {
        const store = await stores.get();
        const s = store.ok ? store.data : null;
        storeName = s?.name ?? null;
        if (s && mode === "supabase" && apiUrl) {
          if (priced.current.storeId !== s.storeId) priced.current = { storeId: s.storeId, specials: null, costs: new Map() };
          if (k === "specials") {
            if (!priced.current.specials) {
              const r = await post("/api/pricing/specials", { storeId: s.storeId, terms: cookTheSpecialsTerms(ranked) });
              const parsed = r.ok ? specialsResultSchema.safeParse(r.data) : null;
              if (parsed?.success) priced.current.specials = parsed.data.specials as Special[];
              else if (!r.ok) setError(r.message);
            }
            specials = priced.current.specials ?? undefined;
          } else {
            const todo = ranked
              .filter((r) => r.allowed && !r.dismissed && !r.aboveSkill && (r.recipe.course ?? "main") === "main" && !priced.current.costs.has(r.recipe.id) && !seen.current.has(r.recipe.id))
              .sort((a, b) => Number(b.recipe.tags.includes("budget")) - Number(a.recipe.tags.includes("budget")) || a.coverage.missing.length - b.coverage.missing.length)
              .slice(0, 8);
            if (todo.length > 0) {
              const r = await post("/api/pricing/recipe-costs", { storeId: s.storeId, recipes: todo.map((t) => recipeCostInput(t.recipe)) });
              const parsed = r.ok ? recipeCostsResultSchema.safeParse(r.data) : null;
              if (parsed?.success) for (const c of parsed.data.costs) priced.current.costs.set(c.id, c as RecipeCost);
              else if (!r.ok) setError(r.message);
            }
            costs = priced.current.costs.size > 0 ? priced.current.costs : undefined;
          }
        } else if (s) {
          setError("Sign in (with the Kitchen Pantry server set up) to use store prices.");
        }
      }
      const r = surpriseMe({
        kind: k,
        ranked,
        history: surpriseHistory(data.events, data.myRatings),
        today: data.context.today,
        skillLevel: profile.skillLevel,
        taste: tasteProfile(data.recipes, data.myRatings),
        myRatings: data.myRatings,
        specials,
        costs,
        storeName,
        exclude: seen.current,
      });
      for (const p of r.picks) {
        seen.current.add(p.ranked.recipe.id);
        void data.logEvent(p.ranked.recipe.id, "shown", "surprise");
      }
      setResult(r);
      setBusy(false);
    },
    [data, kind, mode, post, profile.skillLevel, stores],
  );

  return { kind, result, busy, error, run };
}
