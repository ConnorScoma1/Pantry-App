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

/**
 * Permanently delete the signed-in account (migration …2600). The database
 * does the work in one function: shared households stay with the other
 * members, a household that was only theirs goes with all its data.
 */
export async function deleteAccountAction(confirm: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Supabase isn't configured." };
  if (confirm !== "DELETE") return { ok: false, message: "Type DELETE in capitals to confirm." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_my_account", { confirm });
  if (error) {
    console.error("[profile] delete_my_account failed", { code: error.code });
    return {
      ok: false,
      message: error.code === "PGRST202" ? "Account deletion isn't set up on the server yet (migration …2600)." : "We couldn't delete your account. Please try again, or contact us.",
    };
  }
  // The session cookie belongs to a user that no longer exists.
  await supabase.auth.signOut().catch(() => undefined);
  return { ok: true };
}
