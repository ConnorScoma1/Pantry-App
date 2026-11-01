"use client";

import { createLocalStoreRepository, type Result } from "@kitchen-pantry/database";
import { basketPriceSchema, type BasketPrice, type KrogerStore, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import type { GroceryItem, PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findStoresAction, getStoreAction, priceListAction, pricingStatusAction, setStoreAction } from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";

let previewStores: ReturnType<typeof createLocalStoreRepository> | null = null;
const localStores = () => (previewStores ??= createLocalStoreRepository(browserStorage));

/** The household's chosen store (Supabase) or this browser's (preview). */
export function loadSavedStore(mode: "supabase" | "preview"): Promise<Result<PricingStore | null>> {
  return mode === "preview" ? localStores().get() : getStoreAction();
}

/** What gets priced: what's still to buy. Names and amounts only. */
export function pricingItems(items: readonly GroceryItem[]) {
  return items
    .filter((i) => !i.checked)
    .slice(0, 80)
    .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity }));
}

/**
 * Store prices for the shared list. Prices come from the server (Kroger),
 * never from this device; the household's store is shared in Supabase mode
 * and kept in this browser in preview mode.
 */
export function usePricing(items: readonly GroceryItem[]) {
  const { mode } = useProfile();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [store, setStore] = useState<PricingStore | null>(null);
  const [basket, setBasket] = useState<BasketPrice | null>(null);
  const [pricedKey, setPricedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "stores" | "store" | "prices">(null);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<KrogerStore[] | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const listKey = useMemo(() => JSON.stringify(pricingItems(items)), [items]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await pricingStatusAction();
      const saved = await loadSavedStore(mode);
      if (cancelled) return;
      setEnabled(status.enabled);
      if (saved.ok) setStore(saved.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const refresh = useCallback(async (): Promise<Result<BasketPrice> | null> => {
    if (!store) return null;
    const request = pricingItems(itemsRef.current);
    if (request.length === 0) {
      setBasket(null);
      return null;
    }
    setBusy("prices");
    setError(null);
    const r = await priceListAction({ storeId: store.storeId, items: request });
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return r;
    }
    const checked = basketPriceSchema.safeParse(r.data);
    if (!checked.success) {
      setError("Prices came back in an unexpected shape, so they're not shown.");
      return null;
    }
    setBasket(checked.data);
    setPricedKey(JSON.stringify(request));
    return r;
  }, [store]);

  // Price once when a store is known and the list has loaded (not on every edit).
  const autoPriced = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !store || items.length === 0) return;
    if (autoPriced.current === store.storeId) return;
    autoPriced.current = store.storeId;
    void refresh();
  }, [enabled, store, items.length, refresh]);

  const findStores = useCallback(async (zip: string) => {
    setBusy("stores");
    setError(null);
    const r = await findStoresAction(zip);
    setBusy(null);
    if (r.ok) setStores(r.data);
    else setError(r.message);
    return r;
  }, []);

  const chooseStore = useCallback(
    async (locationId: string | null) => {
      setBusy("store");
      setError(null);
      const r = await setStoreAction(locationId);
      let saved: PricingStore | null = r.ok ? r.data : null;
      if (r.ok && mode === "preview") {
        const local = await localStores().set(r.data);
        saved = local.ok ? local.data : null;
      }
      setBusy(null);
      if (!r.ok) {
        setError(r.message);
        return r;
      }
      setStore(saved);
      setStores(null);
      setBasket(null);
      autoPriced.current = null;
      return r;
    },
    [mode],
  );

  const lines = useMemo(() => new Map<string, PricedLine>((basket?.lines ?? []).map((l) => [l.id, l])), [basket]);

  return {
    enabled,
    store,
    stores,
    basket,
    lines,
    busy,
    error,
    /** The list changed since the last price check. */
    stale: basket !== null && pricedKey !== listKey,
    refresh,
    findStores,
    chooseStore,
    clearStores: () => setStores(null),
  };
}
