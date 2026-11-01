import type { OnboardingProfile, SkillLevel } from "@kitchen-pantry/shared-types";
import { issuesToFieldErrors, onboardingProfileSchema, skillStepSchema } from "@kitchen-pantry/validation";
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
      return valid;
    },
    async setSkillLevel(level) {
      const parsed = skillStepSchema.safeParse({ skillLevel: level });
      if (!parsed.success) return { ok: false, message: "Choose a level from 1 to 5." };
      const { error } = await db.rpc(rpc.setSkillLevel, { level: parsed.data.skillLevel });
      if (error) return dbFailure("skill level", error, "Couldn't save your skill level. Please try again.");
      return { ok: true, data: parsed.data.skillLevel };
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
    async clear() {
      try {
        await storage.removeItem(LOCAL_PROFILE_KEY);
      } catch {
        // ignore
      }
    },
  };
}
