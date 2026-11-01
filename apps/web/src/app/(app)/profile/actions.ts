"use server";

import { createSupabaseProfileStore, rpc } from "@kitchen-pantry/database";
import { revalidatePath } from "next/cache";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function setSkillLevelAction(level: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const result = await createSupabaseProfileStore(asSupabaseLike(supabase)).setSkillLevel(level);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetLearnedPreferencesAction(): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(rpc.resetLearnedPreferences);
  if (error) {
    console.error("[profile] reset_learned_preferences failed", { code: error.code });
    return { ok: false, message: "Couldn't reset recommendations. Please try again." };
  }
  return { ok: true };
}

export async function setDessertsAction(settings: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const result = await createSupabaseProfileStore(asSupabaseLike(supabase)).setDesserts(settings);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setSeasonalAction(settings: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const supabase = await createSupabaseServerClient();
  const result = await createSupabaseProfileStore(asSupabaseLike(supabase)).setSeasonal(settings);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
