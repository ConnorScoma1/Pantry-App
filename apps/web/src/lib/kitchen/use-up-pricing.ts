"use client";

import type { BasketPrice } from "@kitchen-pantry/grocery-pricing";
import { extraCosts, shoppingForIdeas, type ExtraCost, type UseUpIdea } from "@kitchen-pantry/recipe-engine";
import { useCallback, useState } from "react";
import { priceListAction, pricingStatusAction } from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { loadSavedStore } from "@/lib/pricing/use-pricing";

export type UseUpPricingState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "unavailable"; message: string; needsStore: boolean }
  | { status: "done"; storeName: string; costs: Map<string, ExtraCost>; ideasKey: string };

/**
 * "What would I spend?" for the Use It Up ideas: one check at the household's
 * store for everything the shown ideas still need. Asked for by a tap only,
 * so changing the picked ingredients never spends the hourly price checks.
 * Never estimated: unpriced items are counted and said so.
 */
export function useUseUpPricing() {
  const { mode } = useProfile();
  const [state, setState] = useState<UseUpPricingState>({ status: "idle" });

  const check = useCallback(
    async (ideas: readonly UseUpIdea[], ideasKey: string) => {
      setState({ status: "busy" });
      const [status, store] = await Promise.all([pricingStatusAction(), loadSavedStore(mode)]);
      if (!status.enabled) return setState({ status: "unavailable", message: "Store prices aren't set up on this server yet.", needsStore: false });
      const s = store.ok ? store.data : null;
      if (!s) return setState({ status: "unavailable", message: "Choose your store to see what the extra shopping would cost.", needsStore: true });
      const items = shoppingForIdeas(ideas);
      if (items.length === 0) return setState({ status: "done", storeName: s.name, costs: extraCosts(ideas, []), ideasKey });
      const r = await priceListAction({ storeId: s.storeId, items });
      if (!r.ok) return setState({ status: "unavailable", message: r.message, needsStore: false });
      const costs = extraCosts(ideas, (r.data as BasketPrice).lines);
      setState({ status: "done", storeName: s.name, costs, ideasKey });
    },
    [mode],
  );

  return { state, check, reset: () => setState({ status: "idle" }) };
}
