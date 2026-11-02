import type { DessertSettings, OnboardingProfile, SeasonalSettings, SkillLevel } from "@kitchen-pantry/shared-types";
import {
  budgetStepSchema,
  dessertSettingsSchema,
  dietStepSchema,
  equipmentStepSchema,
  householdDietSchema,
  householdStepSchema,
  issuesToFieldErrors,
  onboardingProfileSchema,
  seasonalSettingsSchema,
  skillStepSchema,
  storeStepSchema,
} from "@kitchen-pantry/validation";
import { dbFailure, type KeyValueStorage, type Result, type SupabaseLike } from "./client";
import { parseStoredProfile, rpc } from "./rpc";

/**
 * Onboarding profile persistence, shared by web and mobile. Supabase stores
 * it across the household tables via RPC (atomic, under RLS); preview mode
 * keeps it on the device.
 */
export interface ProfileStore {
  load(): Promise<Result<OnboardingProfile | null>>;
  save(profile: unknown): Promise<Result<OnboardingProfile>>;
  setSkillLevel(level: unknown): Promise<Result<SkillLevel>>;
  /** Dessert frequency/categories (household) and dessert skill (personal). */
  setDesserts(settings: unknown): Promise<Result<DessertSettings>>;
  /** Seasonal cooking: personal toggles and holidays, plus the household region override. */
  setSeasonal(settings: unknown): Promise<Result<SeasonalSettings>>;
  /** Preview only: forget everything on this device. */
  clear(): Promise<void>;
}

function validate(profile: unknown): Result<OnboardingProfile> {
  const parsed = onboardingProfileSchema.safeParse(profile);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, message: "Some answers need another look.", fieldErrors: issuesToFieldErrors(parsed.error) };
}

export function createSupabaseProfileStore(db: SupabaseLike): ProfileStore {
  return {
    async load() {
      const { data, error } = await db.rpc(rpc.getOnboardingProfile);
      if (error) return dbFailure("profile load", error, "We couldn't load your profile.");
      return { ok: true, data: parseStoredProfile(data) };
    },
    async save(profile) {
      const valid = validate(profile);
      if (!valid.ok) return valid;
      const { error } = await db.rpc(rpc.saveOnboardingProfile, { profile: valid.data });
      if (error) return dbFailure("profile save", error, "We couldn't save your answers. Please try again.");
      // Read it back: the household's combined allergy list may have changed.
      const fresh = await db.rpc(rpc.getOnboardingProfile);
      const stored = fresh.error ? null : parseStoredProfile(fresh.data);
      return stored ? { ok: true, data: stored } : valid;
    },
    async setSkillLevel(level) {
      const parsed = skillStepSchema.safeParse({ skillLevel: level });
      if (!parsed.success) return { ok: false, message: "Choose a level from 1 to 5." };
      const { error } = await db.rpc(rpc.setSkillLevel, { level: parsed.data.skillLevel });
      if (error) return dbFailure("skill level", error, "Couldn't save your skill level. Please try again.");
      return { ok: true, data: parsed.data.skillLevel };
    },
    async setDesserts(settings) {
      const parsed = dessertSettingsSchema.safeParse(settings);
      if (!parsed.success) return { ok: false, message: "Check the dessert settings." };
      const { error } = await db.rpc("save_dessert_preferences", { prefs: parsed.data });
      if (error) return dbFailure("dessert settings", error, "Couldn't save your dessert settings. Please try again.");
      return { ok: true, data: parsed.data as DessertSettings };
    },
    async setSeasonal(settings) {
      const parsed = seasonalSettingsSchema.safeParse(settings);
      if (!parsed.success) return { ok: false, message: "Check the seasonal settings." };
      const { error } = await db.rpc("save_seasonal_preferences", { prefs: parsed.data });
      if (error) return dbFailure("seasonal settings", error, "Couldn't save your seasonal settings. Please try again.");
      return { ok: true, data: parsed.data as SeasonalSettings };
    },
    async clear() {
      // Nothing local to clear: Supabase data is removed from account settings.
    },
  };
}

export const LOCAL_PROFILE_KEY = "kp-preview-profile-v1";

export function createLocalProfileStore(storage: KeyValueStorage): ProfileStore {
  async function read(): Promise<OnboardingProfile | null> {
    try {
      const raw = await storage.getItem(LOCAL_PROFILE_KEY);
      return raw ? parseStoredProfile(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  async function write(profile: OnboardingProfile): Promise<void> {
    try {
      await storage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // Storage unavailable.
    }
  }
  return {
    async load() {
      return { ok: true, data: await read() };
    },
    async save(profile) {
      const valid = validate(profile);
      if (valid.ok) await write(valid.data);
      return valid;
    },
    async setSkillLevel(level) {
      const parsed = skillStepSchema.safeParse({ skillLevel: level });
      if (!parsed.success) return { ok: false, message: "Choose a level from 1 to 5." };
      const current = await read();
      if (!current) return { ok: false, message: "Finish setting up your kitchen first." };
      await write({ ...current, skillLevel: parsed.data.skillLevel });
      return { ok: true, data: parsed.data.skillLevel };
    },
    async setDesserts(settings) {
      const parsed = dessertSettingsSchema.safeParse(settings);
      if (!parsed.success) return { ok: false, message: "Check the dessert settings." };
      const current = await read();
      if (!current) return { ok: false, message: "Finish setting up your kitchen first." };
      await write({ ...current, desserts: parsed.data as DessertSettings });
      return { ok: true, data: parsed.data as DessertSettings };
    },
    async setSeasonal(settings) {
      const parsed = seasonalSettingsSchema.safeParse(settings);
      if (!parsed.success) return { ok: false, message: "Check the seasonal settings." };
      const current = await read();
      if (!current) return { ok: false, message: "Finish setting up your kitchen first." };
      await write({ ...current, seasonal: parsed.data as SeasonalSettings });
      return { ok: true, data: parsed.data as SeasonalSettings };
    },
    async clear() {
      try {
        await storage.removeItem(LOCAL_PROFILE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

/**
 * For someone who joined a household before onboarding: the household's
 * shared answers (size, budget, diet style, equipment, store) on top of the
 * defaults. Personal answers (allergies, skill, goals) start fresh. Each
 * section is checked on its own so one odd value doesn't discard the rest.
 */
export function joinDraftProfile(value: unknown, defaults: OnboardingProfile): { profile: OnboardingProfile; memberCount: number } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const hd = householdDietSchema.safeParse(v.householdDiet);
  const memberCount = hd.success ? hd.data.memberCount : 1;
  if (memberCount < 2) return null;
  const household = householdStepSchema.safeParse(v.household);
  const budget = budgetStepSchema.safeParse(v.budget);
  const equipment = equipmentStepSchema.safeParse({ equipment: v.equipment });
  const store = storeStepSchema.safeParse(v.store);
  const style = dietStepSchema.shape.style.safeParse((v.diet as Record<string, unknown> | undefined)?.style);
  return {
    memberCount,
    profile: {
      ...defaults,
      household: household.success ? household.data : defaults.household,
      budget: budget.success ? budget.data : defaults.budget,
      equipment: equipment.success ? equipment.data.equipment : defaults.equipment,
      store: store.success ? store.data : defaults.store,
      diet: { ...defaults.diet, style: style.success ? style.data : defaults.diet.style },
      householdDiet: hd.success ? hd.data : undefined,
    },
  };
}
