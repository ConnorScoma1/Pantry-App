"use server";

import { rpc } from "@kitchen-pantry/database";
import { skillStepSchema } from "@kitchen-pantry/validation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function setSkillLevelAction(level: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  const parsed = skillStepSchema.safeParse({ skillLevel: level });
  if (!parsed.success) return { ok: false, message: "Choose a level from 1 to 5." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(rpc.setSkillLevel, { level: parsed.data.skillLevel });
  if (error) {
    console.error("[profile] set_skill_level failed", { code: error.code });
    return { ok: false, message: "Couldn't save your skill level. Please try again." };
  }
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
