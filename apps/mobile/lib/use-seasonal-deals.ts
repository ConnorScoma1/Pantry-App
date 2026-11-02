import type { Result } from "@kitchen-pantry/database";
import { basketPriceSchema, onSale, type BasketPrice, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import { produceSearchName } from "@kitchen-pantry/recipe-engine";
import type { PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "./app-state";
import { apiUrl } from "./config";
import type { PricingBlocker } from "./use-pricing";

export interface SeasonalDeal {
  produce: string;
  line: PricedLine;
}

/**
 * Opt-in seasonal deals: asks the household's store (through the Kitchen
 * Pantry server, real prices) about this week's in-season produce and keeps
 * only what it reports on sale. Only when the person taps the button.
 */
export function useSeasonalDeals(produce: readonly string[], wanted: boolean) {
  const { mode, accessToken, stores: repo } = useApp();
  const [blocker, setBlocker] = useState<PricingBlocker | "checking">("checking");
  const [store, setStore] = useState<PricingStore | null>(null);
  const [deals, setDeals] = useState<SeasonalDeal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void (async () => {
      const saved = await repo.get();
      if (!cancelled && saved.ok) setStore(saved.data);
      if (mode !== "supabase") return setBlocker("preview");
      if (!apiUrl) return setBlocker("no_server");
      try {
        const token = await accessToken();
        const res = await fetch(`${apiUrl}/api/pricing`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
        const status = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setBlocker(status.enabled ? null : "not_connected");
      } catch {
        if (!cancelled) setBlocker("no_server");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, mode, repo, accessToken]);

  const check = useCallback(async () => {
    if (!store || produce.length === 0) return;
    const token = await accessToken();
    if (!token) return setError("Please sign in again.");
    const names = produce.slice(0, 12);
    setBusy(true);
    setError(null);
    let r: Result<BasketPrice>;
    try {
      const res = await fetch(`${apiUrl}/api/pricing`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.storeId,
          items: names.map((n, i) => ({ id: `season-${i}`, name: produceSearchName(n), quantity: null })),
        }),
      });
      r = (await res.json()) as Result<BasketPrice>;
    } catch {
      r = { ok: false, message: "Couldn't reach the Kitchen Pantry server." };
    }
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const checked = basketPriceSchema.safeParse(r.data);
    if (!checked.success) return setError("Prices came back in an unexpected shape, so they're not shown.");
    setDeals(onSale(checked.data.lines).map((line) => ({ produce: names[Number(line.id.slice(7))]!, line })));
  }, [store, produce, accessToken]);

  return { blocker, store, deals, busy, error, check };
}
