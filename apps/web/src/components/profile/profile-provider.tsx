"use client";

import type { AccessStatus, OnboardingProfile } from "@kitchen-pantry/shared-types";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadPreviewProfile, savePreviewProfile } from "@/lib/preview-store";

export type DataMode = "preview" | "supabase";

interface ProfileContextValue {
  mode: DataMode;
  email: string | null;
  profile: OnboardingProfile;
  /** Replace the profile in local state (and in browser storage in preview mode). */
  updateLocal: (profile: OnboardingProfile) => void;
  /** Subscription access; always open in preview mode or while billing is off. */
  access: AccessStatus;
}

const OPEN: AccessStatus = { enforced: false, access: true, reason: "trial", trialEndsAt: null, trialDays: 14, subscription: null };

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  mode,
  email,
  initialProfile,
  access = OPEN,
  children,
}: {
  mode: DataMode;
  email: string | null;
  initialProfile: OnboardingProfile | null;
  access?: AccessStatus;
  children: ReactNode;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [profile, setProfile] = useState<OnboardingProfile | null>(initialProfile);
  const [checked, setChecked] = useState(mode === "supabase");

  // Preview mode: load once from browser storage (or start onboarding).
  useEffect(() => {
    if (mode !== "preview") return;
    const stored = loadPreviewProfile();
    if (!stored) {
      routerRef.current.replace("/onboarding");
      return;
    }
    setProfile(stored);
    setChecked(true);
  }, [mode]);

  // Supabase mode: adopt fresh server data after a save + router.refresh().
  useEffect(() => {
    if (mode === "supabase" && initialProfile) setProfile(initialProfile);
  }, [mode, initialProfile]);

  const updateLocal = useCallback(
    (next: OnboardingProfile) => {
      setProfile(next);
      if (mode === "preview") savePreviewProfile(next);
    },
    [mode],
  );

  if (!checked || !profile) return <ShellSkeleton />;

  return (
    <ProfileContext.Provider value={{ mode, email, profile, updateLocal, access: mode === "supabase" ? access : OPEN }}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
}

function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-[1080px] px-4 pt-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-48 animate-pulse rounded-full bg-surface" />
      <div className="mt-6 h-40 animate-pulse rounded-card bg-surface" />
      <div className="mt-4 h-28 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
