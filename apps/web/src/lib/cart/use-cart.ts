"use client";

import { createLocalCartRepository, sendCartDraft, subscribeToCartDrafts, type CartDraftInput, type CartRepository, type Result } from "@kitchen-pantry/database";
import { cartLinesSchema, cartNeeds, MockCartAdapter, type CartDraft, type CartLine, type FulfillmentMethod } from "@kitchen-pantry/grocery-pricing";
import type { PricingStore } from "@kitchen-pantry/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveCartAction,
  cartOptionsAction,
  connectKrogerAction,
  currentCartAction,
  disconnectKrogerAction,
  discardCartAction,
  matchCartAction,
  resolveCartAction,
  saveCartAction,
  sendCartAction,
  setPurchaseAction,
} from "@/app/(app)/cart/actions";
import { useProfile } from "@/components/profile/profile-provider";
import { browserStorage } from "@/lib/browser-storage";
import { useGrocery } from "@/lib/grocery/use-grocery";
import { useKitchen } from "@/lib/kitchen/use-kitchen";
import { loadSavedStore } from "@/lib/pricing/use-pricing";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { RetailerOption } from "@/lib/cart/server";

let previewRepo: CartRepository | null = null;
const localRepo = () => (previewRepo ??= createLocalCartRepository(browserStorage));

/** Server-backed repository (Supabase mode). */
const serverRepo: Pick<CartRepository, "current" | "save" | "approve" | "resolve" | "setPurchase" | "discard"> = {
  current: () => currentCartAction(),
  save: (input) => saveCartAction(input),
  approve: (id, v) => approveCartAction(id, v),
  resolve: (id, added) => resolveCartAction(id, added),
  setPurchase: (id, ordered) => setPurchaseAction(id, ordered),
  discard: (id) => discardCartAction(id),
};

export type CartBusy = null | "loading" | "building" | "saving" | "approving" | "sending" | "connecting";

/**
 * Smart Cart for one household: build from the shared list, review and
 * approve together, send once. Supabase mode keeps the cart in the database
 * (shared, live); preview mode keeps it in this browser and only the
 * practice retailer can "send".
 */
export function useCart() {
  const { mode } = useProfile();
  const grocery = useGrocery();
  const kitchen = useKitchen();
  const repo = mode === "preview" ? localRepo() : serverRepo;
  const [retailers, setRetailers] = useState<RetailerOption[]>([]);
  const [krogerConnected, setKrogerConnected] = useState(false);
  const [store, setStore] = useState<PricingStore | null>(null);
  const [draft, setDraft] = useState<CartDraft | null>(null);
  const [busy, setBusy] = useState<CartBusy>("loading");
  const [message, setMessage] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const draftRef = useRef<CartDraft | null>(null);
  draftRef.current = draft;

  const reload = useCallback(async () => {
    const r = await repo.current();
    if (r.ok) setDraft(r.data);
    else setMessage({ tone: "error", text: r.message });
  }, [repo]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [opts, saved, current] = await Promise.all([cartOptionsAction(), loadSavedStore(mode), repo.current()]);
      if (cancelled) return;
      setRetailers(opts.retailers);
      setKrogerConnected(opts.krogerConnected);
      if (saved.ok) setStore(saved.data);
      if (current.ok) setDraft(current.data);
      setBusy(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, repo]);

  // Other members' edits arrive live (Supabase Realtime, RLS applies).
  useEffect(() => {
    if (mode !== "supabase") return;
    const client = getBrowserSupabase();
    if (!client) return;
    const sub = subscribeToCartDrafts(client as never, () => void reload());
    return () => sub.unsubscribe();
  }, [mode, reload]);

  const fail = (r: { message: string }) => setMessage({ tone: "error", text: r.message });

  const save = useCallback(
    async (patch: Partial<Pick<CartDraftInput, "lines" | "fulfillment" | "retailer" | "storeId" | "storeName">>) => {
      const d = draftRef.current;
      if (!d) return;
      const next = { ...d, ...patch } as CartDraft;
      setDraft(next); // optimistic
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

  /** (Re)build the cart from the shared list at this retailer. */
  const build = useCallback(
    async (retailer: string, fulfillment: FulfillmentMethod) => {
      setMessage(null);
      const needs = cartNeeds(grocery.items, kitchen.items, kitchen.today);
      if (needs.length === 0) return setMessage({ tone: "info", text: "The grocery list is empty — add this week's meal plan to it first." });
      if (retailer === "kroger" && !store) return setMessage({ tone: "info", text: "Choose your Kroger store on the Grocery List first." });
      setBusy("building");
      const matched = await matchCartAction({ retailer, storeId: retailer === "kroger" ? store!.storeId : null, needs });
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
      if (r.ok) {
        setDraft(r.data);
        if (matched.data.warning) setMessage({ tone: "error", text: matched.data.warning });
      } else fail(r);
    },
    [grocery.items, kitchen.items, kitchen.today, store, repo],
  );

  const editLine = useCallback((id: string, change: (l: CartLine) => CartLine) => {
    const d = draftRef.current;
    if (!d) return;
    void save({ lines: d.lines.map((l) => (l.id === id ? change(l) : l)) });
  }, [save]);

  const approve = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    setBusy("approving");
    setMessage(null);
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
    if (!d || !d.transferKey) return;
    setBusy("sending");
    setMessage(null);
    setNeedsAuth(false);
    let r: Result<{ draft: CartDraft; message: string; needsAuth: boolean }>;
    if (mode === "preview") {
      r = d.retailer === "mock"
        ? await sendCartDraft({ repo: localRepo(), adapter: new MockCartAdapter(), draftId: d.id, key: d.transferKey, title: "Groceries" })
        : { ok: false, message: "Sign in (Supabase mode) to send a real cart." };
    } else r = await sendCartAction({ draftId: d.id, key: d.transferKey });
    setBusy(null);
    if (!r.ok) return fail(r);
    setDraft(r.data.draft);
    setNeedsAuth(r.data.needsAuth);
    const st = r.data.draft.status;
    setMessage({ tone: st === "sent" || st === "link_ready" ? "success" : st === "unknown" || st === "failed" || r.data.needsAuth ? "error" : "info", text: r.data.message });
  }, [mode]);

  const connectKroger = useCallback(async () => {
    setBusy("connecting");
    const r = await connectKrogerAction();
    if (!r.ok) {
      setBusy(null);
      return fail(r);
    }
    window.location.assign(r.data.url);
  }, []);

  const disconnectKroger = useCallback(async () => {
    const r = await disconnectKrogerAction();
    if (r.ok) setKrogerConnected(false);
    else fail(r);
  }, []);

  const act = useCallback(async (fn: (d: CartDraft) => Promise<Result<CartDraft | null>>) => {
    const d = draftRef.current;
    if (!d) return;
    const r = await fn(d);
    if (r.ok) setDraft(r.data);
    else fail(r);
  }, []);

  /** Tick the cart's items off the shared list — only when the household says they bought them. */
  const checkOffList = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    const ids = new Set(d.lines.filter((l) => l.include).flatMap((l) => l.sourceIds));
    for (const item of grocery.items) if (ids.has(item.id) && !item.checked) await grocery.toggle(item);
    setMessage({ tone: "success", text: "Ticked off on the grocery list." });
  }, [grocery]);

  const listCount = useMemo(() => grocery.items.filter((i) => !i.checked).length, [grocery.items]);

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
    listCount,
    hasPlanItems: grocery.items.some((i) => i.source === "plan" && !i.checked),
    addPlan: grocery.addPlan,
    build,
    editLine,
    setFulfillment: (f: FulfillmentMethod) => void save({ fulfillment: f }),
    approve,
    send,
    connectKroger,
    disconnectKroger,
    resolve: (added: boolean) => act((d) => repo.resolve(d.id, added)),
    setPurchase: (ordered: boolean) => act((d) => repo.setPurchase(d.id, ordered)),
    discard: () => act(async (d) => {
      const r = await repo.discard(d.id);
      return r.ok ? { ok: true, data: null } : r;
    }),
    checkOffList,
    clearMessage: () => setMessage(null),
    reload,
  };
}
