import { basketPriceSchema } from "@kitchen-pantry/grocery-pricing";
import { extraCosts, shoppingForIdeas, type ExtraCost, type UseUpIdea } from "@kitchen-pantry/recipe-engine";
import { useCallback, useState } from "react";
import { useApp } from "./app-state";
import { apiUrl } from "./config";

export type UseUpPricingState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "unavailable"; message: string; needsStore: boolean }
  | { status: "done"; storeName: string; costs: Map<string, ExtraCost>; ideasKey: string };

/**
 * "What would the extra shopping cost?" on the phone: one check at the
 * household's store through the Kitchen Pantry server, only when tapped.
 * Real shelf prices only; unpriced items are counted, never guessed.
 */
export function useUseUpPricing() {
  const { mode, accessToken, stores } = useApp();
  const [state, setState] = useState<UseUpPricingState>({ status: "idle" });

  const check = useCallback(
    async (ideas: readonly UseUpIdea[], ideasKey: string) => {
      setState({ status: "busy" });
      if (mode !== "supabase") return setState({ status: "unavailable", message: "Store prices need a signed-in account.", needsStore: false });
      if (!apiUrl) return setState({ status: "unavailable", message: "The Kitchen Pantry server isn't set up in this app (EXPO_PUBLIC_API_URL).", needsStore: false });
      const saved = await stores.get();
      const store = saved.ok ? saved.data : null;
      if (!store) return setState({ status: "unavailable", message: "Choose your store on the Grocery tab to see what the extra shopping would cost.", needsStore: true });
      const items = shoppingForIdeas(ideas);
      if (items.length === 0) return setState({ status: "done", storeName: store.name, costs: extraCosts(ideas, []), ideasKey });
      const token = await accessToken();
      try {
        const res = await fetch(`${apiUrl}/api/pricing`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: store.storeId, items }),
        });
        const r = (await res.json()) as { ok: boolean; data?: unknown; message?: string };
        if (!r.ok) return setState({ status: "unavailable", message: r.message ?? "Couldn't check prices.", needsStore: false });
        const basket = basketPriceSchema.safeParse(r.data);
        if (!basket.success) return setState({ status: "unavailable", message: "Prices came back in an unexpected shape, so they're not shown.", needsStore: false });
        setState({ status: "done", storeName: store.name, costs: extraCosts(ideas, basket.data.lines), ideasKey });
      } catch {
        setState({ status: "unavailable", message: "Couldn't reach the Kitchen Pantry server.", needsStore: false });
      }
    },
    [mode, accessToken, stores],
  );
  return { state, check };
}
