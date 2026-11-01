"use client";

import { basketPriceSchema, onSale, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import { produceSearchName } from "@kitchen-pantry/recipe-engine";
import type { PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useState } from "react";
import { priceListAction, pricingStatusAction } from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { loadSavedStore } from "@/lib/pricing/use-pricing";

export interface SeasonalDeal {
  produce: string;
  line: PricedLine;
}

/**
 * Opt-in "Seasonal grocery deals": asks the household's store (real prices,
 * via the server) about this week's in-season produce and keeps only what the
 * store reports on sale. Runs when asked, never in the background.
 */
export function useSeasonalDeals(produce: readonly string[], wanted: boolean) {
  const { mode } = useProfile();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [store, setStore] = useState<PricingStore | null>(null);
  const [deals, setDeals] = useState<SeasonalDeal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void (async () => {
      const [status, saved] = await Promise.all([pricingStatusAction(), loadSavedStore(mode)]);
      if (cancelled) return;
      setEnabled(status.enabled);
      if (saved.ok) setStore(saved.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, wanted]);

  const check = useCallback(async () => {
    if (!store || produce.length === 0) return;
    setBusy(true);
    setError(null);
    const names = produce.slice(0, 12);
    const r = await priceListAction({
      storeId: store.storeId,
      items: names.map((n, i) => ({ id: `season-${i}`, name: produceSearchName(n), quantity: null })),
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const checked = basketPriceSchema.safeParse(r.data);
    if (!checked.success) return setError("Prices came back in an unexpected shape, so they're not shown.");
    setDeals(onSale(checked.data.lines).map((line) => ({ produce: names[Number(line.id.slice(7))]!, line })));
  }, [store, produce]);

  return { enabled, store, deals, busy, error, check, checkedCount: Math.min(produce.length, 12) };
}
