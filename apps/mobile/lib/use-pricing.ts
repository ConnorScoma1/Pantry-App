import type { Result } from "@kitchen-pantry/database";
import { basketPriceSchema, type BasketPrice, type KrogerStore, type PricedLine } from "@kitchen-pantry/grocery-pricing";
import type { GroceryItem, PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./app-state";
import { apiUrl } from "./config";

export function pricingItems(items: readonly GroceryItem[]) {
  return items
    .filter((i) => !i.checked)
    .slice(0, 80)
    .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity }));
}

/** Why prices can't show on this phone, or null when they can. */
export type PricingBlocker = "no_server" | "preview" | "not_connected" | null;

/**
 * Same behaviour as the web hook. The phone never talks to Kroger: it asks
 * the Kitchen Pantry web server (EXPO_PUBLIC_API_URL) with the signed-in
 * user's token, and the server returns real store prices.
 */
export function usePricing(items: readonly GroceryItem[]) {
  const { mode, accessToken, stores: repo } = useApp();
  const [blocker, setBlocker] = useState<PricingBlocker | "checking">("checking");
  const [store, setStore] = useState<PricingStore | null>(null);
  const [basket, setBasket] = useState<BasketPrice | null>(null);
  const [pricedKey, setPricedKey] = useState<string | null>(null);
  const [found, setFound] = useState<KrogerStore[] | null>(null);
  const [busy, setBusy] = useState<null | "stores" | "store" | "prices">(null);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const listKey = useMemo(() => JSON.stringify(pricingItems(items)), [items]);

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<Result<T>> => {
      const token = await accessToken();
      if (!token) return { ok: false, message: "Please sign in again." };
      try {
        const res = await fetch(`${apiUrl}/api/pricing${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
        });
        return (await res.json()) as Result<T>;
      } catch {
        return { ok: false, message: "Couldn't reach the Kitchen Pantry server." };
      }
    },
    [accessToken],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await repo.get();
      if (!cancelled && saved.ok) setStore(saved.data);
      if (mode !== "supabase") return setBlocker("preview");
      if (!apiUrl) return setBlocker("no_server");
      const token = await accessToken();
      try {
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
  }, [mode, repo, accessToken]);

  const refresh = useCallback(async () => {
    if (!store) return;
    const request = pricingItems(itemsRef.current);
    if (request.length === 0) return setBasket(null);
    setBusy("prices");
    setError(null);
    const r = await call<BasketPrice>("", { method: "POST", body: JSON.stringify({ storeId: store.storeId, items: request }) });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    const checked = basketPriceSchema.safeParse(r.data);
    if (!checked.success) return setError("Prices came back in an unexpected shape, so they're not shown.");
    setBasket(checked.data);
    setPricedKey(JSON.stringify(request));
  }, [store, call]);

  const autoPriced = useRef<string | null>(null);
  useEffect(() => {
    if (blocker !== null || !store || items.length === 0 || autoPriced.current === store.storeId) return;
    autoPriced.current = store.storeId;
    void refresh();
  }, [blocker, store, items.length, refresh]);

  const findStores = useCallback(
    async (zip: string) => {
      setBusy("stores");
      setError(null);
      const r = await call<KrogerStore[]>(`?zip=${encodeURIComponent(zip)}`);
      setBusy(null);
      if (r.ok) setFound(r.data);
      else setError(r.message);
    },
    [call],
  );

  const chooseStore = useCallback(
    async (s: KrogerStore) => {
      setBusy("store");
      setError(null);
      const r = await repo.set({
        provider: "kroger",
        storeId: s.locationId,
        name: s.name,
        address: [s.address, s.city, s.region].filter(Boolean).join(", ") || null,
      });
      setBusy(null);
      if (!r.ok) {
        setError(r.message);
        return false;
      }
      setStore(r.data);
      setFound(null);
      setBasket(null);
      autoPriced.current = null;
      return true;
    },
    [repo],
  );

  const lines = useMemo(() => new Map<string, PricedLine>((basket?.lines ?? []).map((l) => [l.id, l])), [basket]);

  return {
    blocker,
    store,
    stores: found,
    basket,
    lines,
    busy,
    error,
    stale: basket !== null && pricedKey !== listKey,
    refresh,
    findStores,
    chooseStore,
  };
}
