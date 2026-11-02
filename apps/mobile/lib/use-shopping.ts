import { DEFAULT_SAVED_SHOPPING, type Result } from "@kitchen-pantry/database";
import type { KrogerStore } from "@kitchen-pantry/grocery-pricing";
import type { GroceryItem } from "@kitchen-pantry/shared-types";
import {
  comparisonResultSchema,
  runComparison,
  SAMPLE_STORES,
  SampleRoutingProvider,
  SampleStoresPricingProvider,
  type ActiveTrip,
  type ComparisonResponse,
  type SavedShopping,
  type StrategyId,
  type TripPlan,
} from "@kitchen-pantry/shopping-optimizer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "./app-state";
import { apiUrl } from "./config";
import { pricingItems } from "./use-pricing";

export type Comparison = ComparisonResponse & { adviceToken: string | null; routingNote: string | null };
export interface ShoppingAdvice {
  source: "ai" | "app";
  summary: string;
  tips: string[];
  notice: string | null;
}
interface Status {
  livePrices: boolean;
  routing: "mapbox" | null;
  advisor: boolean;
}

/** The household's chosen trip. */
export function useActiveTrip() {
  const { shopping } = useApp();
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const reload = useCallback(async () => {
    const r = await shopping.activeTrip();
    if (r.ok) setTrip(r.data);
  }, [shopping]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const end = useCallback(
    async (status: "done" | "cancelled") => {
      if (!trip) return { ok: true as const, data: null };
      const r = await shopping.endTrip(trip.id, status);
      if (r.ok) setTrip(null);
      return r;
    },
    [shopping, trip],
  );
  return { trip, reload, end };
}

/**
 * One Store vs. Best Deals on the phone. Real comparisons run on the
 * Kitchen Pantry server (Kroger and Mapbox keys stay there). The practice
 * comparison uses only made-up sample data, so it runs right here — it
 * works without a server or an account.
 */
export function useShopping(items: readonly GroceryItem[]) {
  const { mode, accessToken, shopping, profile, stores: storeRepo } = useApp();
  const [status, setStatus] = useState<Status | null>(null);
  const [saved, setSaved] = useState<SavedShopping>(DEFAULT_SAVED_SHOPPING);
  const [loaded, setLoaded] = useState(false);
  const [practice, setPractice] = useState(true);
  const [nearby, setNearby] = useState<KrogerStore[] | null>(null);
  const [usualStoreKey, setUsualStoreKey] = useState<string | null>(null);
  const [result, setResult] = useState<Comparison | null>(null);
  const [advice, setAdvice] = useState<ShoppingAdvice | null>(null);
  const [busy, setBusy] = useState<null | "compare" | "stores" | "advice" | "trip">(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<Result<T>> => {
      const token = await accessToken();
      if (!token || !apiUrl) return { ok: false, message: "Please sign in again." };
      try {
        const res = await fetch(`${apiUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
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
      const [settings, usual] = await Promise.all([shopping.getSettings(), storeRepo.get()]);
      let s: Status = { livePrices: false, routing: null, advisor: false };
      if (mode === "supabase" && apiUrl) {
        const token = await accessToken();
        if (token) {
          try {
            const res = await fetch(`${apiUrl}/api/shopping/compare`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) s = (await res.json()) as Status;
          } catch {
            // offline: practice only
          }
        }
      }
      if (cancelled) return;
      setStatus(s);
      setPractice(!s.livePrices);
      if (settings.ok) setSaved(settings.data);
      if (usual.ok && usual.data) setUsualStoreKey(`kroger:${usual.data.storeId}`);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, accessToken, shopping, storeRepo]);

  const save = useCallback(
    async (next: SavedShopping) => {
      setSaved(next);
      const r = await shopping.saveSettings(next);
      if (!r.ok) setError(r.message);
      return r;
    },
    [shopping],
  );

  const findNearby = useCallback(async () => {
    setBusy("stores");
    setError(null);
    const r = await call<KrogerStore[]>(`/api/pricing?zip=${encodeURIComponent((profile?.household.postalCode ?? "").slice(0, 5))}`);
    setBusy(null);
    if (r.ok) setNearby(r.data);
    else setError(r.message);
  }, [call, profile?.household.postalCode]);

  const compare = useCallback(async () => {
    const request = pricingItems(items);
    if (request.length === 0) return setError("Add things to your list first.");
    setBusy("compare");
    setError(null);
    setAdvice(null);
    let value: Comparison | null = null;
    if (practice) {
      const r = await runComparison({
        pricing: new SampleStoresPricingProvider(),
        stores: SAMPLE_STORES,
        needs: request,
        settings: saved.settings,
        routing: new SampleRoutingProvider(),
        start: { lat: 0, lng: 0 },
      });
      // The AI advisor only explains comparisons the server made, so practice results show the app's own sentence.
      value = { ...r, adviceToken: null, routingNote: null };
    } else {
      const r = await call<Comparison>("/api/shopping/compare", {
        method: "POST",
        body: JSON.stringify({
          mode: "live",
          items: request,
          storeIds: saved.compareStoreIds,
          start: saved.startAddress ? { kind: "address", text: saved.startAddress } : null,
          settings: saved.settings,
          baselineStoreKey: usualStoreKey && saved.compareStoreIds.includes(usualStoreKey.slice(7)) ? usualStoreKey : null,
          departAt: new Date().toISOString(),
        }),
      });
      if (!r.ok) {
        setBusy(null);
        setResult(null);
        return setError(r.message);
      }
      const checked = comparisonResultSchema.safeParse(r.data);
      if (!checked.success) {
        setBusy(null);
        return setError("The comparison came back in an unexpected shape, so it isn't shown.");
      }
      value = { ...checked.data, adviceToken: r.data.adviceToken ?? null, routingNote: r.data.routingNote ?? null };
    }
    setBusy(null);
    setResult(value);
  }, [items, practice, saved, call, usualStoreKey]);

  const explain = useCallback(async () => {
    if (!result?.adviceToken) return;
    setBusy("advice");
    const r = await call<ShoppingAdvice>("/api/shopping/advice", { method: "POST", body: JSON.stringify({ token: result.adviceToken }) });
    setBusy(null);
    if (r.ok) setAdvice(r.data);
    else setError(r.message);
  }, [call, result]);

  const choose = useCallback(
    async (strategy: StrategyId, plan: TripPlan) => {
      if (!result) return { ok: false as const, message: "Compare the stores first." };
      const storeOf = new Map(result.stores.map((s) => [s.key, s]));
      const input = {
        strategy,
        isSample: result.isSample,
        stops: plan.stops.map((s) => ({ storeKey: s.storeKey, name: storeOf.get(s.storeKey)?.name ?? "Store", address: storeOf.get(s.storeKey)?.address ?? null, itemIds: s.itemIds })),
      };
      setBusy("trip");
      // Real trips go through the server, which re-reads each store's details from Kroger.
      const r =
        mode === "supabase" && !result.isSample
          ? await call<{ id: string }>("/api/shopping/trip", { method: "POST", body: JSON.stringify(input) })
          : await shopping.saveTrip(input);
      setBusy(null);
      if (!r.ok) setError(r.message);
      return r;
    },
    [call, mode, result, shopping],
  );

  const itemNames = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  return { mode, status, loaded, saved, save, practice, setPractice, nearby, findNearby, usualStoreKey, result, compare, advice, explain, choose, busy, error, itemNames };
}
