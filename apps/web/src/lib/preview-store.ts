"use client";

import type { OnboardingProfile } from "@kitchen-pantry/shared-types";
import { onboardingProfileSchema } from "@kitchen-pantry/validation";

/**
 * Browser-only persistence for PREVIEW MODE (no Supabase configured) and
 * for the in-progress onboarding draft. Every read is validated; storage
 * failures are swallowed so the UI still works in private browsing.
 */
const PROFILE_KEY = "kp-preview-profile-v1";
const DRAFT_KEY = "kp-onboarding-draft-v1";

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Unavailable storage — nothing to do.
  }
}

export function loadPreviewProfile(): OnboardingProfile | null {
  const parsed = onboardingProfileSchema.safeParse(read(PROFILE_KEY));
  return parsed.success ? parsed.data : null;
}

export function savePreviewProfile(profile: OnboardingProfile | null): void {
  write(PROFILE_KEY, profile);
}

export interface OnboardingDraft {
  profile: OnboardingProfile;
  stepIndex: number;
}

export function loadDraft(): OnboardingDraft | null {
  const value = read(DRAFT_KEY) as OnboardingDraft | null;
  if (!value || typeof value !== "object" || typeof value.stepIndex !== "number" || !value.profile) return null;
  return value;
}

export function saveDraft(draft: OnboardingDraft | null): void {
  write(DRAFT_KEY, draft);
}
