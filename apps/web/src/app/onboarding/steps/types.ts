import type { OnboardingProfile } from "@kitchen-pantry/shared-types";

export interface StepProps {
  profile: OnboardingProfile;
  setProfile: (update: (current: OnboardingProfile) => OnboardingProfile) => void;
  /** Field errors keyed by path within the step's slice, e.g. "postalCode". */
  errors: Record<string, string>;
}

/** Add or remove a value from a list (immutable). */
export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
