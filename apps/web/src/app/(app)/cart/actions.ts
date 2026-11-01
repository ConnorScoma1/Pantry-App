"use server";

import { createSupabaseCartRepository, type CartDraftInput, type Result, type SendCartResult, type SupabaseLike } from "@kitchen-pantry/database";
import type { CartDraft, CartLine } from "@kitchen-pantry/grocery-pricing";
import { disconnectKroger, krogerConnected, retailerOptions, sendCart, startKrogerConnect, type RetailerOption } from "@/lib/cart/server";
import { matchCartItems } from "@/lib/pricing/server";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Smart Cart server actions. Each runs as the signed-in user (RLS applies).
 * In preview mode (no Supabase) only matching runs here; the cart itself is
 * kept in the browser and only the practice retailer can "send".
 */
async function session(): Promise<{ db: SupabaseLike; uid: string } | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { db: asSupabaseLike(supabase), uid: user.id } : null;
}
const signedOut = { ok: false as const, message: "Your session expired. Please sign in again." };

export async function cartOptionsAction(): Promise<{ retailers: RetailerOption[]; krogerConnected: boolean }> {
  const s = await session();
  return { retailers: retailerOptions(), krogerConnected: s ? await krogerConnected(s.db) : false };
}

export async function matchCartAction(request: unknown): Promise<Result<{ lines: CartLine[]; warning: string | null }>> {
  const s = await session();
  if (isSupabaseConfigured && !s) return signedOut;
  return matchCartItems(request, s?.uid ?? "preview");
}

async function withRepo<T>(fn: (repo: ReturnType<typeof createSupabaseCartRepository>) => Promise<Result<T>>): Promise<Result<T>> {
  const s = await session();
  if (!s) return isSupabaseConfigured ? signedOut : { ok: false, message: "Supabase isn't configured." };
  return fn(createSupabaseCartRepository(s.db));
}

export async function currentCartAction(): Promise<Result<CartDraft | null>> {
  return withRepo((r) => r.current());
}
export async function saveCartAction(input: CartDraftInput): Promise<Result<CartDraft>> {
  return withRepo((r) => r.save(input));
}
export async function approveCartAction(id: string, version: number): Promise<Result<CartDraft>> {
  return withRepo((r) => r.approve(String(id), Number(version)));
}
export async function resolveCartAction(id: string, added: boolean): Promise<Result<CartDraft>> {
  return withRepo((r) => r.resolve(String(id), added === true));
}
export async function setPurchaseAction(id: string, ordered: boolean): Promise<Result<CartDraft>> {
  return withRepo((r) => r.setPurchase(String(id), ordered === true));
}
export async function discardCartAction(id: string): Promise<Result<null>> {
  return withRepo((r) => r.discard(String(id)));
}

export async function sendCartAction(request: { draftId: string; key: string }): Promise<Result<SendCartResult>> {
  const s = await session();
  if (!s) return signedOut;
  return sendCart(s.db, s.uid, request);
}

export async function connectKrogerAction(): Promise<Result<{ url: string }>> {
  const s = await session();
  if (!s) return signedOut;
  return startKrogerConnect(s.uid, "web");
}

export async function disconnectKrogerAction(): Promise<Result<null>> {
  const s = await session();
  if (!s) return signedOut;
  return disconnectKroger(s.uid);
}
