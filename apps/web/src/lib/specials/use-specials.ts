"use client";

import { specialsResultSchema, type Special, type SpecialsResult } from "@kitchen-pantry/grocery-pricing";
import { specialsTerms } from "@kitchen-pantry/meal-planner";
import { seasonalContext } from "@kitchen-pantry/recipe-engine";
import type { PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pricingStatusAction, specialsAction } from "@/app/(app)/grocery/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { useGrocery } from "@/lib/grocery/use-grocery";
import { todayIso } from "@/lib/kitchen/use-kitchen";
import { loadSavedStore } from "@/lib/pricing/use-pricing";
import { useActiveTrip } from "@/lib/shopping/use-shopping";

/**
 * Specials at the household's store. The browser sends item names (what's
 * on the list, this season's produce, everyday staples); sale prices come
 * back from the server (Kroger) and are validated again here. When the
 * household has planned a multi-store trip, the specials at each of those
 * stores can be viewed too.
 */
export function useSpecials() {
  const { mode, profile } = useProfile();
  const grocery = useGrocery();
  const [today] = useState(() => todayIso());
  const seasonal = useMemo(() => seasonalContext(profile, today), [profile, today]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [usual, setUsual] = useState<PricingStore | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const trip = useActiveTrip();
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [result, setResult] = useState<SpecialsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(grocery.items);
  itemsRef.current = grocery.items;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [status, saved] = await Promise.all([pricingStatusAction(), loadSavedStore(mode)]);
      if (cancelled) return;
      setEnabled(status.enabled);
      if (saved.ok) setUsual(saved.data);
      setStoreLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // The usual store plus the real stores in the household's planned trip.
  const choices = useMemo(() => {
    const out: PricingStore[] = usual ? [usual] : [];
    for (const st of trip.trip?.stops ?? []) {
      const id = st.storeKey.startsWith("kroger:") ? st.storeKey.slice(7) : null;
      if (id && !out.some((x) => x.storeId === id)) out.push({ provider: "kroger", storeId: id, name: st.name, address: st.address, setAt: null });
    }
    return out;
  }, [usual, trip.trip]);
  const store = choices.find((c) => c.storeId === picked) ?? usual ?? choices[0] ?? null;

  const refresh = useCallback(async () => {
    if (!store) return;
    setBusy(true);
    setError(null);
    const terms = specialsTerms({ groceryItems: itemsRef.current, seasonal });
    const r = await specialsAction({ storeId: store.storeId, terms });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const checked = specialsResultSchema.safeParse(r.data);
    if (!checked.success) return setError("Specials came back in an unexpected shape, so they're not shown.");
    setResult(checked.data as SpecialsResult);
  }, [store, seasonal]);

  // Load once the store and the list are known.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !store || grocery.loading || loadedFor.current === store.storeId) return;
    loadedFor.current = store.storeId;
    void refresh();
  }, [enabled, store, grocery.loading, refresh]);

  const listNames = useMemo(() => grocery.items.filter((i) => !i.checked).map((i) => i.name), [grocery.items]);

  const addToList = useCallback(
    async (s: Special) => {
      const name = s.matchedTerm.charAt(0).toUpperCase() + s.matchedTerm.slice(1);
      return grocery.add({ name, department: s.department, amount: null, note: `On sale: ${s.name}`.slice(0, 200) });
    },
    [grocery],
  );

  return {
    loading: enabled === null || !storeLoaded || (busy && result === null),
    enabled,
    store,
    choices,
    pick: (storeId: string) => {
      setResult(null);
      setPicked(storeId);
    },
    hasTrip: trip.trip !== null,
    result,
    busy,
    error,
    seasonal,
    listNames,
    refresh,
    addToList,
    mode,
  };
}
