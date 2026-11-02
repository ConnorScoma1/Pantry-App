"use server";

import { createSupabaseSavingsRepository, type Result, type SavingsData, type SavingsRepository } from "@kitchen-pantry/database";
import type { SpendingEntry } from "@kitchen-pantry/shared-types";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Smart Savings reads and logged shops, as the signed-in member (row-level security applies). */
async function withRepo<T>(fn: (repo: SavingsRepository) => Promise<Result<T>>): Promise<Result<T>> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Please sign in again." };
  return fn(createSupabaseSavingsRepository(asSupabaseLike(supabase)));
}

export async function savingsOverviewAction(since: string): Promise<Result<SavingsData>> {
  return withRepo((r) => r.overview(String(since)));
}
export async function addSpendingAction(input: unknown): Promise<Result<SpendingEntry>> {
  return withRepo((r) => r.addSpending(input));
}
export async function updateSpendingAction(id: string, input: unknown): Promise<Result<SpendingEntry>> {
  return withRepo((r) => r.updateSpending(String(id), input));
}
export async function removeSpendingAction(id: string): Promise<Result<null>> {
  return withRepo((r) => r.removeSpending(String(id)));
}
