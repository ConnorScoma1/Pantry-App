import {
  createLocalKitchenRepository,
  createLocalProfileStore,
  createLocalRecipeRepository,
  createSupabaseKitchenRepository,
  createSupabaseProfileStore,
  createSupabaseRecipeRepository,
  LOCAL_FAVORITES_KEY,
  LOCAL_PANTRY_KEY,
  LOCAL_RATINGS_KEY,
  type KitchenRepository,
  type ProfileStore,
  type RecipeRepository,
  type Result,
} from "@kitchen-pantry/database";
import type { OnboardingProfile, SkillLevel } from "@kitchen-pantry/shared-types";
import { signInSchema, signUpSchema, issuesToFieldErrors } from "@kitchen-pantry/validation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { deviceStorage } from "./storage";
import { asSupabaseLike, supabase } from "./supabase";

export type DataMode = "preview" | "supabase";

interface AppState {
  mode: DataMode;
  /** True until the stored session and profile have been read. */
  loading: boolean;
  email: string | null;
  signedIn: boolean;
  profile: OnboardingProfile | null;
  kitchen: KitchenRepository;
  recipes: RecipeRepository;
  signIn(email: string, password: string): Promise<Result<null>>;
  signUp(email: string, password: string): Promise<Result<{ needsConfirmation: boolean }>>;
  signOut(): Promise<void>;
  saveProfile(profile: OnboardingProfile): Promise<Result<OnboardingProfile>>;
  setSkillLevel(level: SkillLevel): Promise<Result<SkillLevel>>;
  clearPreview(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const localKitchen = createLocalKitchenRepository(deviceStorage);
const localProfiles = createLocalProfileStore(deviceStorage);
const remoteKitchen = supabase ? createSupabaseKitchenRepository(asSupabaseLike(supabase)) : null;
const remoteProfiles = supabase ? createSupabaseProfileStore(asSupabaseLike(supabase)) : null;
const localRecipes = createLocalRecipeRepository(deviceStorage);
const remoteRecipes = supabase ? createSupabaseRecipeRepository(asSupabaseLike(supabase)) : null;

/**
 * Session, profile and data stores for the whole app. Screens read from
 * here; nothing else talks to Supabase or device storage directly.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const mode: DataMode = supabase ? "supabase" : "preview";
  const profiles: ProfileStore = remoteProfiles ?? localProfiles;
  const kitchen: KitchenRepository = remoteKitchen ?? localKitchen;
  const recipes: RecipeRepository = remoteRecipes ?? localRecipes;

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(mode === "preview");
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);

  const loadProfile = useCallback(async () => {
    const result = await profiles.load();
    setProfile(result.ok ? result.data : null);
  }, [profiles]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSignedIn(Boolean(data.session));
        setEmail(data.session?.user.email ?? null);
        if (data.session) await loadProfile();
      } else {
        await loadProfile();
      }
      if (!cancelled) setLoading(false);
    }
    void boot();

    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setEmail(session?.user.email ?? null);
      if (session) void loadProfile();
      else setProfile(null);
    });
    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (rawEmail: string, password: string): Promise<Result<null>> => {
    if (!supabase) return { ok: false, message: "Supabase isn't configured." };
    const parsed = signInSchema.safeParse({ email: rawEmail, password });
    if (!parsed.success) {
      return { ok: false, message: "Please check your details.", fieldErrors: issuesToFieldErrors(parsed.error) };
    }
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    // Same message for unknown email and wrong password (no account enumeration).
    if (error) return { ok: false, message: "That email and password don't match." };
    return { ok: true, data: null };
  }, []);

  const signUp = useCallback(
    async (rawEmail: string, password: string): Promise<Result<{ needsConfirmation: boolean }>> => {
      if (!supabase) return { ok: false, message: "Supabase isn't configured." };
      const parsed = signUpSchema.safeParse({ email: rawEmail, password });
      if (!parsed.success) {
        return { ok: false, message: "Please check your details.", fieldErrors: issuesToFieldErrors(parsed.error) };
      }
      const { data, error } = await supabase.auth.signUp(parsed.data);
      if (error) return { ok: false, message: "We couldn't create that account. Try a different email or sign in." };
      return { ok: true, data: { needsConfirmation: !data.session } };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const saveProfile = useCallback(
    async (next: OnboardingProfile) => {
      const result = await profiles.save(next);
      if (result.ok) setProfile(result.data);
      return result;
    },
    [profiles],
  );

  const setSkillLevel = useCallback(
    async (level: SkillLevel) => {
      const previous = profile;
      if (profile) setProfile({ ...profile, skillLevel: level }); // optimistic
      const result = await profiles.setSkillLevel(level);
      if (!result.ok) setProfile(previous);
      return result;
    },
    [profiles, profile],
  );

  const clearPreview = useCallback(async () => {
    await localProfiles.clear();
    await deviceStorage.removeItem(LOCAL_PANTRY_KEY);
    await deviceStorage.removeItem(LOCAL_FAVORITES_KEY);
    await deviceStorage.removeItem(LOCAL_RATINGS_KEY);
    setProfile(null);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      mode,
      loading,
      email,
      signedIn,
      profile,
      kitchen,
      recipes,
      signIn,
      signUp,
      signOut,
      saveProfile,
      setSkillLevel,
      clearPreview,
    }),
    [mode, loading, email, signedIn, profile, kitchen, recipes, signIn, signUp, signOut, saveProfile, setSkillLevel, clearPreview],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Profile for screens that only render once onboarding is complete. */
export function useProfile(): OnboardingProfile {
  const { profile } = useApp();
  if (!profile) throw new Error("useProfile called before onboarding finished");
  return profile;
}
