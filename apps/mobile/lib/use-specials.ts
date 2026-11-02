import type { Result } from "@kitchen-pantry/database";
import { specialsResultSchema, type Special, type SpecialsResult } from "@kitchen-pantry/grocery-pricing";
import { specialsTerms } from "@kitchen-pantry/meal-planner";
import { seasonalContext } from "@kitchen-pantry/recipe-engine";
import type { PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, useProfile } from "./app-state";
import { apiUrl } from "./config";
import { useGrocery } from "./use-grocery";
import { todayIso } from "./use-kitchen";
import type { PricingBlocker } from "./use-pricing";
import { useActiveTrip } from "./use-shopping";

/**
 * Specials at the household's store (same behaviour as the web). The phone
 * never talks to Kroger: it sends item names to the Kitchen Pantry server
 * with the signed-in user's token and validates what comes back. When the
 * household has planned a multi-store trip, those stores' specials can be
 * viewed too.
 */
export function useSpecials() {
  const { mode, accessToken, stores: repo } = useApp();
  const profile = useProfile();
  const grocery = useGrocery();
  const seasonal = useMemo(() => seasonalContext(profile, todayIso()), [profile]);
  const [blocker, setBlocker] = useState<PricingBlocker | "checking">("checking");
  const [usual, setUsual] = useState<PricingStore | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const trip = useActiveTrip();
  const choices = useMemo(() => {
    const out: PricingStore[] = usual ? [usual] : [];
    for (const st of trip.trip?.stops ?? []) {
      const id = st.storeKey.startsWith("kroger:") ? st.storeKey.slice(7) : null;
      if (id && !out.some((x) => x.storeId === id)) out.push({ provider: "kroger", storeId: id, name: st.name, address: st.address, setAt: null });
    }
    return out;
  }, [usual, trip.trip]);
  const store = choices.find((c) => c.storeId === picked) ?? usual ?? choices[0] ?? null;
  const [result, setResult] = useState<SpecialsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(grocery.items);
  itemsRef.current = grocery.items;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await repo.get();
      if (!cancelled && saved.ok) setUsual(saved.data);
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
  }, [mode, repo, accessToken]);

  const refresh = useCallback(async () => {
    if (!store) return;
    const token = await accessToken();
    if (!token) return setError("Please sign in again.");
    setBusy(true);
    setError(null);
    let r: Result<SpecialsResult>;
    try {
      const res = await fetch(`${apiUrl}/api/pricing/specials`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.storeId, terms: specialsTerms({ groceryItems: itemsRef.current, seasonal }) }),
      });
      r = (await res.json()) as Result<SpecialsResult>;
    } catch {
      r = { ok: false, message: "Couldn't reach the Kitchen Pantry server." };
    }
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const checked = specialsResultSchema.safeParse(r.data);
    if (!checked.success) return setError("Specials came back in an unexpected shape, so they're not shown.");
    setResult(checked.data as SpecialsResult);
  }, [store, seasonal, accessToken]);

  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (blocker !== null || !store || grocery.loading || loadedFor.current === store.storeId) return;
    loadedFor.current = store.storeId;
    void refresh();
  }, [blocker, store, grocery.loading, refresh]);

  const listNames = useMemo(() => grocery.items.filter((i) => !i.checked).map((i) => i.name), [grocery.items]);

  const addToList = useCallback(
    (s: Special) =>
      grocery.add({ name: s.matchedTerm.charAt(0).toUpperCase() + s.matchedTerm.slice(1), department: s.department, amount: null, note: `On sale: ${s.name}`.slice(0, 200) }),
    [grocery],
  );

  return {
    blocker,
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
    profile,
  };
}
