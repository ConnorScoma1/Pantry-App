"use client";

import { createLocalShoppingRepository, DEFAULT_SAVED_SHOPPING, type Result } from "@kitchen-pantry/database";
import type { KrogerStore } from "@kitchen-pantry/grocery-pricing";
import type { GroceryItem } from "@kitchen-pantry/shared-types";
import {
  comparisonResultSchema,
  type ActiveTrip,
  type ComparisonResponse,
  type SavedShopping,
  type StartPoint,
  type StrategyId,
  type TripPlan,
} from "@kitchen-pantry/shopping-optimizer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { findStoresAction } from "@/app/(app)/grocery/actions";
import {
  activeTripAction,
  adviseShoppingAction,
  compareShoppingAction,
  endTripAction,
  getShoppingSettingsAction,
  saveShoppingSettingsAction,
  saveTripAction,
  shoppingStatusAction,
} from "@/app/(app)/grocery/shopping-actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";
import { loadSavedStore, pricingItems } from "@/lib/pricing/use-pricing";

let local: ReturnType<typeof createLocalShoppingRepository> | null = null;
const localRepo = () => (local ??= createLocalShoppingRepository(browserStorage));

export type Comparison = ComparisonResponse & { adviceToken: string | null; routingNote: string | null };
export interface ShoppingAdvice {
  source: "ai" | "app";
  summary: string;
  tips: string[];
  notice: string | null;
}

/** The household's chosen trip (shared in Supabase mode, this browser in preview). */
export function useActiveTrip() {
  const { mode } = useProfile();
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    const r = mode === "preview" ? await localRepo().activeTrip() : await activeTripAction();
    if (r.ok) setTrip(r.data);
    setLoaded(true);
  }, [mode]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const end = useCallback(
    async (status: "done" | "cancelled"): Promise<Result<null>> => {
      if (!trip) return { ok: true, data: null };
      const r = mode === "preview" ? await localRepo().endTrip(trip.id, status) : await endTripAction(trip.id, status);
      if (r.ok) setTrip(null);
      return r;
    },
    [mode, trip],
  );
  return { trip, loaded, reload, end };
}

/**
 * One Store vs. Best Deals in the browser. Everything priced or routed is
 * done on the server; this keeps the shopper's settings, the stores they
 * compare and the latest result.
 */
export function useShopping(items: readonly GroceryItem[]) {
  const { mode, profile } = useProfile();
  const [status, setStatus] = useState<{ livePrices: boolean; routing: "mapbox" | null; advisor: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedShopping>(DEFAULT_SAVED_SHOPPING);
  const [loaded, setLoaded] = useState(false);
  const [practice, setPractice] = useState(false);
  const [nearby, setNearby] = useState<KrogerStore[] | null>(null);
  const [usualStoreKey, setUsualStoreKey] = useState<string | null>(null);
  const [result, setResult] = useState<Comparison | null>(null);
  const [advice, setAdvice] = useState<ShoppingAdvice | null>(null);
  const [busy, setBusy] = useState<null | "compare" | "stores" | "advice" | "save" | "trip">(null);
  const [error, setError] = useState<string | null>(null);
  const [devicePoint, setDevicePoint] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, settings, usual] = await Promise.all([
        shoppingStatusAction(),
        mode === "preview" ? localRepo().getSettings() : getShoppingSettingsAction(),
        loadSavedStore(mode),
      ]);
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
  }, [mode]);

  const save = useCallback(
    async (next: SavedShopping): Promise<Result<SavedShopping>> => {
      setSaved(next);
      setBusy("save");
      const r = mode === "preview" ? await localRepo().saveSettings(next) : await saveShoppingSettingsAction(next);
      setBusy(null);
      if (!r.ok) setError(r.message);
      return r;
    },
    [mode],
  );

  const findNearby = useCallback(async (zip?: string) => {
    setBusy("stores");
    setError(null);
    const r = await findStoresAction(zip ?? profile.household.postalCode);
    setBusy(null);
    if (r.ok) setNearby(r.data);
    else setError(r.message);
    return r;
  }, [profile.household.postalCode]);

  const compare = useCallback(async () => {
    const request = pricingItems(items);
    if (request.length === 0) {
      setError("Add things to your list first.");
      return null;
    }
    let start: StartPoint | null = null;
    if (devicePoint) start = { kind: "point", ...devicePoint };
    else if (saved.startAddress) start = { kind: "address", text: saved.startAddress };
    setBusy("compare");
    setError(null);
    setAdvice(null);
    const r = await compareShoppingAction({
      mode: practice ? "sample" : "live",
      items: request,
      storeIds: saved.compareStoreIds,
      start,
      settings: saved.settings,
      baselineStoreKey: practice ? null : usualStoreKey && saved.compareStoreIds.includes(usualStoreKey.slice(7)) ? usualStoreKey : null,
      departAt: new Date().toISOString(),
    });
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      setResult(null);
      return null;
    }
    const checked = comparisonResultSchema.safeParse(r.data);
    if (!checked.success) {
      setError("The comparison came back in an unexpected shape, so it isn't shown.");
      return null;
    }
    const value: Comparison = { ...checked.data, adviceToken: r.data.adviceToken ?? null, routingNote: r.data.routingNote ?? null };
    setResult(value);
    return value;
  }, [items, devicePoint, saved, practice, usualStoreKey]);

  const explain = useCallback(async () => {
    if (!result?.adviceToken) return;
    setBusy("advice");
    const r = await adviseShoppingAction(result.adviceToken);
    setBusy(null);
    if (r.ok) setAdvice(r.data);
    else setError(r.message);
  }, [result]);

  /** Organise the shared list by the stores in this trip. */
  const choose = useCallback(
    async (strategy: StrategyId, plan: TripPlan): Promise<Result<{ id: string }>> => {
      if (!result) return { ok: false, message: "Compare the stores first." };
      const storeOf = new Map(result.stores.map((s) => [s.key, s]));
      const input = {
        strategy,
        isSample: result.isSample,
        stops: plan.stops.map((s) => ({ storeKey: s.storeKey, name: storeOf.get(s.storeKey)?.name ?? "Store", address: storeOf.get(s.storeKey)?.address ?? null, itemIds: s.itemIds })),
      };
      setBusy("trip");
      const r = mode === "preview" ? await localRepo().saveTrip(input) : await saveTripAction(input);
      setBusy(null);
      if (!r.ok) setError(r.message);
      return r;
    },
    [mode, result],
  );

  const locateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can't share your location. Type a starting address instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setDevicePoint({ lat: Math.round(p.coords.latitude * 1e3) / 1e3, lng: Math.round(p.coords.longitude * 1e3) / 1e3 }),
      () => setError("Location wasn't shared. Type a starting address instead."),
      { maximumAge: 10 * 60_000, timeout: 10_000 },
    );
  }, []);

  const itemNames = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  return {
    mode,
    status,
    loaded,
    saved,
    save,
    practice,
    setPractice,
    nearby,
    findNearby,
    usualStoreKey,
    result,
    compare,
    advice,
    explain,
    choose,
    busy,
    error,
    setError,
    devicePoint,
    locateMe,
    clearDevicePoint: () => setDevicePoint(null),
    itemNames,
  };
}
