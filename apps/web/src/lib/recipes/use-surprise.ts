"use client";

import { recipeCostsResultSchema, specialsResultSchema, type RecipeCost, type Special } from "@kitchen-pantry/grocery-pricing";
import { cookTheSpecialsTerms, recipeCostInput, surpriseHistory, surpriseMe, type SurpriseResult } from "@kitchen-pantry/meal-planner";
import { tasteProfile, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import type { SurpriseKind } from "@kitchen-pantry/shared-types";
import { useCallback, useRef, useState } from "react";
import { pricingStatusAction, recipeCostsAction, specialsAction } from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { loadSavedStore } from "@/lib/pricing/use-pricing";
import type { useRecipes } from "@/lib/recipes/use-recipes";

/**
 * Surprise Me: a few fresh ideas of the kind asked for, never repeating
 * what was cooked or suggested in the last two weeks. "Under $5" and "On
 * sale" ask the household's store for real prices (only then).
 */
export function useSurprise(data: ReturnType<typeof useRecipes>) {
  const { mode, profile } = useProfile();
  const [kind, setKind] = useState<SurpriseKind | null>(null);
  const [result, setResult] = useState<SurpriseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const priced = useRef<{ storeId: string | null; specials: Special[] | null; costs: Map<string, RecipeCost> }>({ storeId: null, specials: null, costs: new Map() });

  const run = useCallback(
    async (k: SurpriseKind, more = false) => {
      if (!more || k !== kind) seen.current = new Set();
      setKind(k);
      setBusy(true);
      setError(null);
      const ranked: RankedRecipe[] = data.rank({ includeAboveSkill: true }).recipes;
      const history = surpriseHistory(data.events, data.myRatings);
      let storeName: string | null = null;
      let specials: Special[] | undefined;
      let costs: Map<string, RecipeCost> | undefined;

      if (k === "specials" || k === "under_5") {
        const [status, store] = await Promise.all([pricingStatusAction(), loadSavedStore(mode)]);
        const s = store.ok ? store.data : null;
        storeName = s?.name ?? null;
        if (s && status.enabled) {
          if (priced.current.storeId !== s.storeId) priced.current = { storeId: s.storeId, specials: null, costs: new Map() };
          if (k === "specials") {
            if (!priced.current.specials) {
              const r = await specialsAction({ storeId: s.storeId, terms: cookTheSpecialsTerms(ranked) });
              const parsed = r.ok ? specialsResultSchema.safeParse(r.data) : null;
              if (parsed?.success) priced.current.specials = parsed.data.specials as Special[];
              else if (!r.ok) setError(r.message);
            }
            specials = priced.current.specials ?? undefined;
          } else {
            // Price up to 8 likely-cheap recipes we haven't priced yet (fewest things to buy first).
            const todo = ranked
              .filter((r) => r.allowed && !r.dismissed && !r.aboveSkill && (r.recipe.course ?? "main") === "main" && !priced.current.costs.has(r.recipe.id) && !seen.current.has(r.recipe.id))
              .sort((a, b) => Number(b.recipe.tags.includes("budget")) - Number(a.recipe.tags.includes("budget")) || a.coverage.missing.length - b.coverage.missing.length)
              .slice(0, 8);
            if (todo.length > 0) {
              const r = await recipeCostsAction({ storeId: s.storeId, recipes: todo.map((t) => recipeCostInput(t.recipe)) });
              const parsed = r.ok ? recipeCostsResultSchema.safeParse(r.data) : null;
              if (parsed?.success) for (const c of parsed.data.costs) priced.current.costs.set(c.id, c as RecipeCost);
              else if (!r.ok) setError(r.message);
            }
            costs = priced.current.costs.size > 0 ? priced.current.costs : undefined;
          }
        }
      }

      const r = surpriseMe({
        kind: k,
        ranked,
        history,
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
    [data, kind, mode, profile.skillLevel],
  );

  return { kind, result, busy, error, run, reset: () => { setKind(null); setResult(null); } };
}
