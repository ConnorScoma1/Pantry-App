import { sendCartDraft, subscribeToCartDrafts, type CartDraftInput, type Result } from "@kitchen-pantry/database";
import {
  cartLinesSchema,
  cartNeeds,
  matchCart,
  MockCartAdapter,
  SampleCatalogProvider,
  type CartDraft,
  type CartLine,
  type FulfillmentMethod,
} from "@kitchen-pantry/grocery-pricing";
import type { PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import { useApp } from "./app-state";
import { apiUrl } from "./config";
import { useGrocery } from "./use-grocery";
import { useKitchen } from "./use-kitchen";

export interface RetailerOption {
  id: string;
  name: string;
  mode: "direct_cart" | "shopping_link" | "export";
  sample: boolean;
  available: boolean;
  note: string | null;
  fulfillment: FulfillmentMethod[];
  needsSignIn: boolean;
}

const PREVIEW_RETAILERS: RetailerOption[] = [
  { id: "mock", name: "Sample Market (practice — no real store)", mode: "direct_cart", sample: true, available: true, note: "Made-up products and prices to try the flow. Nothing is sent anywhere.", fulfillment: ["pickup", "delivery"], needsSignIn: false },
  { id: "kroger", name: "Kroger family", mode: "direct_cart", sample: false, available: false, note: "Sign in to use a real store.", fulfillment: ["pickup", "delivery"], needsSignIn: true },
];

/**
 * Smart Cart on the phone (same flow as the web). The cart lives in Supabase
 * (shared, live) or on the device in preview mode. Matching real products,
 * Kroger sign-in and sending go through the Kitchen Pantry server, which
 * keeps the retailer secrets and tokens.
 */
export function useCart() {
  const { mode, carts: repo, stores, accessToken, realtime } = useApp();
  const grocery = useGrocery();
  const kitchen = useKitchen();
  const [retailers, setRetailers] = useState<RetailerOption[]>(PREVIEW_RETAILERS);
  const [krogerConnected, setKrogerConnected] = useState(false);
  const [store, setStore] = useState<PricingStore | null>(null);
  const [draft, setDraft] = useState<CartDraft | null>(null);
  const [busy, setBusy] = useState<null | "loading" | "building" | "saving" | "approving" | "sending" | "connecting">("loading");
  const [message, setMessage] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const draftRef = useRef<CartDraft | null>(null);
  draftRef.current = draft;

  const server = useCallback(
    async <T,>(body: Record<string, unknown>): Promise<T | { ok: false; message: string }> => {
      if (!apiUrl) return { ok: false, message: "The Kitchen Pantry server isn't set up (EXPO_PUBLIC_API_URL)." };
      const token = await accessToken();
      if (!token) return { ok: false, message: "Please sign in again." };
      try {
        const res = await fetch(`${apiUrl}/api/cart`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return (await res.json()) as T;
      } catch {
        return { ok: false, message: "Couldn't reach the Kitchen Pantry server." };
      }
    },
    [accessToken],
  );

  const reload = useCallback(async () => {
    const r = await repo.current();
    if (r.ok) setDraft(r.data);
  }, [repo]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [saved, current] = await Promise.all([stores.get(), repo.current()]);
      if (cancelled) return;
      if (saved.ok) setStore(saved.data);
      if (current.ok) setDraft(current.data);
      if (mode === "supabase") {
        const opts = await server<{ retailers?: RetailerOption[]; krogerConnected?: boolean }>({ action: "options" });
        if (!cancelled && "retailers" in opts && opts.retailers) {
          setRetailers(opts.retailers);
          setKrogerConnected(Boolean(opts.krogerConnected));
        }
      }
      if (!cancelled) setBusy(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, repo, stores, server]);

  useEffect(() => {
    if (!realtime) return;
    const sub = subscribeToCartDrafts(realtime, () => void reload());
    return () => sub.unsubscribe();
  }, [realtime, reload]);

  const fail = (r: { message: string }) => setMessage({ tone: "error", text: r.message });

  const save = useCallback(
    async (patch: Partial<CartDraft>) => {
      const d = draftRef.current;
      if (!d) return;
      const next = { ...d, ...patch };
      setDraft(next);
      setBusy("saving");
      const r = await repo.save({ id: d.id, retailer: next.retailer, storeId: next.storeId, storeName: next.storeName, fulfillment: next.fulfillment, lines: next.lines, expectedVersion: d.version });
      setBusy(null);
      if (r.ok) setDraft(r.data);
      else {
        fail(r);
        await reload();
      }
    },
    [repo, reload],
  );

  const build = useCallback(
    async (retailer: string, fulfillment: FulfillmentMethod) => {
      setMessage(null);
      const needs = cartNeeds(grocery.items, kitchen.items, kitchen.today);
      if (needs.length === 0) return setMessage({ tone: "info", text: "The grocery list is empty — add this week's meal plan to it first." });
      if (retailer === "kroger" && !store) return setMessage({ tone: "info", text: "Choose your Kroger store on the Grocery tab first." });
      setBusy("building");
      let matched: Result<{ lines: CartLine[]; warning: string | null }>;
      if (retailer === "mock") matched = { ok: true, data: await matchCart({ provider: new SampleCatalogProvider(), storeId: "sample", needs }) };
      else matched = (await server<Result<{ lines: CartLine[]; warning: string | null }>>({ action: "match", retailer, storeId: store?.storeId ?? null, needs })) as Result<{ lines: CartLine[]; warning: string | null }>;
      if (!matched.ok) {
        setBusy(null);
        return fail(matched);
      }
      const lines = cartLinesSchema.safeParse(matched.data.lines);
      if (!lines.success) {
        setBusy(null);
        return setMessage({ tone: "error", text: "Products came back in an unexpected shape, so the cart wasn't built." });
      }
      const d = draftRef.current;
      const open = d && ["draft", "approved", "failed"].includes(d.status) ? d : null;
      const input: CartDraftInput = {
        id: open?.id ?? null,
        retailer,
        storeId: retailer === "kroger" ? store!.storeId : null,
        storeName: retailer === "kroger" ? store!.name : "Sample Market",
        fulfillment,
        lines: lines.data as CartLine[],
        expectedVersion: open?.version ?? null,
      };
      const r = await repo.save(input);
      setBusy(null);
      if (r.ok) setDraft(r.data);
      else fail(r);
    },
    [grocery.items, kitchen.items, kitchen.today, store, repo, server],
  );

  const approve = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    setBusy("approving");
    const r = await repo.approve(d.id, d.version);
    setBusy(null);
    if (r.ok) setDraft(r.data);
    else {
      fail(r);
      await reload();
    }
  }, [repo, reload]);

  const send = useCallback(async () => {
    const d = draftRef.current;
    if (!d?.transferKey) return;
    setBusy("sending");
    setMessage(null);
    let r: Result<{ draft: CartDraft; message: string; needsAuth: boolean }>;
    if (d.retailer === "mock") r = await sendCartDraft({ repo, adapter: new MockCartAdapter(), draftId: d.id, key: d.transferKey, title: "Groceries" });
    else r = (await server<Result<{ draft: CartDraft; message: string; needsAuth: boolean }>>({ action: "send", draftId: d.id, key: d.transferKey })) as Result<{ draft: CartDraft; message: string; needsAuth: boolean }>;
    setBusy(null);
    if (!r.ok) return fail(r);
    await reload();
    setNeedsAuth(r.data.needsAuth);
    const st = r.data.draft.status;
    setMessage({ tone: st === "sent" || st === "link_ready" ? "success" : st === "unknown" || st === "failed" || r.data.needsAuth ? "error" : "info", text: r.data.message });
  }, [repo, server, reload]);

  /** Opens Kroger's sign-in; Kroger sends the shopper back to kitchenpantry://cart?kroger_code=… */
  const connectKroger = useCallback(async () => {
    setBusy("connecting");
    const r = await server<Result<{ url: string }>>({ action: "connect" });
    setBusy(null);
    if (!("ok" in r) || !r.ok) return fail(r as { message: string });
    await Linking.openURL(r.data.url);
  }, [server]);

  const finishKroger = useCallback(
    async (code: string, state: string) => {
      setBusy("connecting");
      const r = await server<Result<null>>({ action: "finish", code, state });
      setBusy(null);
      if ("ok" in r && r.ok) {
        setKrogerConnected(true);
        setNeedsAuth(false);
        setMessage({ tone: "success", text: "Kroger is connected. You can send the cart now." });
      } else fail(r as { message: string });
    },
    [server],
  );

  const act = useCallback(async (fn: (d: CartDraft) => Promise<Result<CartDraft | null>>) => {
    const d = draftRef.current;
    if (!d) return;
    const r = await fn(d);
    if (r.ok) setDraft(r.data);
    else fail(r);
  }, []);

  const checkOffList = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    const ids = new Set(d.lines.filter((l) => l.include).flatMap((l) => l.sourceIds));
    for (const item of grocery.items) if (ids.has(item.id) && !item.checked) await grocery.toggle(item);
    setMessage({ tone: "success", text: "Ticked off on the grocery list." });
  }, [grocery]);

  return {
    mode,
    loading: busy === "loading" || grocery.loading || kitchen.loading,
    busy,
    retailers,
    krogerConnected,
    store,
    draft,
    message,
    needsAuth,
    listCount: useMemo(() => grocery.items.filter((i) => !i.checked).length, [grocery.items]),
    build,
    editLine: (id: string, change: (l: CartLine) => CartLine) => {
      const d = draftRef.current;
      if (d) void save({ lines: d.lines.map((l) => (l.id === id ? change(l) : l)) });
    },
    setFulfillment: (f: FulfillmentMethod) => void save({ fulfillment: f }),
    approve,
    send,
    connectKroger,
    finishKroger,
    resolve: (added: boolean) => act((d) => repo.resolve(d.id, added)),
    setPurchase: (ordered: boolean) => act((d) => repo.setPurchase(d.id, ordered)),
    discard: () => act(async (d) => {
      const r = await repo.discard(d.id);
      return r.ok ? { ok: true, data: null } : r;
    }),
    checkOffList,
  };
}
