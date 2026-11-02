"use server";

import type { DraftHousehold } from "@kitchen-pantry/ai";
import { createSupabaseMenuRepository, createSupabaseRecipeRepository, type LibraryFacetCounts, type Result } from "@kitchen-pantry/database";
import type { LibraryPage } from "@kitchen-pantry/recipe-engine";
import { allergens, dietStyles, equipment, type Recipe, type SavedMenu } from "@kitchen-pantry/shared-types";
import { z } from "zod";
import { draftForHousehold, draftUseUpForHousehold, type DraftResult } from "@/lib/library/drafts";
import { asSupabaseLike } from "@/lib/supabase/adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Recipe library and menus (spec 08): thin wrappers over the shared repositories, as the signed-in user. */
async function signedIn() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { db: asSupabaseLike(supabase), userId: user.id } : null;
}
const EXPIRED = { ok: false as const, message: "Your session expired. Please sign in again." };

export async function searchLibraryAction(query: unknown): Promise<Result<LibraryPage>> {
  const s = await signedIn();
  return s ? createSupabaseRecipeRepository(s.db).search(query) : EXPIRED;
}
export async function libraryFacetsAction(): Promise<Result<LibraryFacetCounts>> {
  const s = await signedIn();
  return s ? createSupabaseRecipeRepository(s.db).facets() : EXPIRED;
}
export async function recipeBySlugAction(slug: string): Promise<Result<Recipe | null>> {
  const s = await signedIn();
  return s ? createSupabaseRecipeRepository(s.db).bySlug(String(slug)) : EXPIRED;
}
export async function menusAction(): Promise<Result<SavedMenu[]>> {
  const s = await signedIn();
  return s ? createSupabaseMenuRepository(s.db).list() : EXPIRED;
}
export async function saveMenuAction(menu: unknown): Promise<Result<{ id: string }>> {
  const s = await signedIn();
  return s ? createSupabaseMenuRepository(s.db).save(menu) : EXPIRED;
}
export async function deleteMenuAction(id: unknown): Promise<Result<null>> {
  const s = await signedIn();
  return s ? createSupabaseMenuRepository(s.db).remove(id) : EXPIRED;
}

// Preview mode: the browser's household limits, bounded.
const previewHousehold = z.object({
  allergies: z.array(z.enum(allergens.map((a) => a.code) as [string, ...string[]])).max(10),
  dietStyle: z.enum(dietStyles.map((d) => d.code) as [string, ...string[]]),
  avoid: z.array(z.string().max(60)).max(30),
  equipment: z.array(z.enum(equipment.map((e) => e.code) as [string, ...string[]])).max(20),
  skillLevel: z.number().int().min(1).max(5),
  servings: z.number().int().min(1).max(24),
});

/** An AI version of a recipe (simplified / budget / elevated / traditional), or the full recipe for a dish idea. */
export async function draftRecipeAction(input: unknown, preview?: unknown): Promise<Result<DraftResult>> {
  if (!isSupabaseConfigured) {
    const h = previewHousehold.safeParse(preview);
    if (!h.success) return { ok: false, message: "Your preview profile couldn't be read." };
    return draftForHousehold(input, { preview: { household: h.data as DraftHousehold } });
  }
  const s = await signedIn();
  return s ? draftForHousehold(input, { db: s.db, householdKey: s.userId }) : EXPIRED;
}

/** A new AI dinner around the picked kitchen ingredients (Use it before you lose it). */
export async function draftUseUpAction(input: unknown, preview?: unknown): Promise<Result<DraftResult>> {
  if (!isSupabaseConfigured) {
    const h = previewHousehold.safeParse(preview);
    if (!h.success) return { ok: false, message: "Your preview profile couldn't be read." };
    return draftUseUpForHousehold(input, { preview: { household: h.data as DraftHousehold } });
  }
  const s = await signedIn();
  return s ? draftUseUpForHousehold(input, { db: s.db, householdKey: s.userId }) : EXPIRED;
}
