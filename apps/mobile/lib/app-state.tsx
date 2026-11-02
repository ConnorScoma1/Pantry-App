import {
  createLocalGroceryRepository,
  createLocalSavedListRepository,
  createPreviewHouseholdRepository,
  createSupabaseGroceryRepository,
  createSupabaseSavedListRepository,
  createSupabaseHouseholdRepository,
  createSupabaseStoreRepository,
  createSupabaseCartRepository,
  createLocalCartRepository,
  createLocalWeeklyPlanningRepository,
  createLocalSavingsRepository,
  createLocalHouseholdLifeRepository,
  createSupabaseHouseholdLifeRepository,
  type HouseholdLifeRepository,
  createSupabaseSavingsRepository,
  type SavingsRepository,
  createSupabaseWeeklyPlanningRepository,
  type WeeklyPlanningRepository,
  type CartRepository,
  createLocalStoreRepository,
  LOCAL_STORE_KEY,
  type StoreRepository,
  joinDraftProfile,
  LOCAL_GROCERY_KEY,
  rpc,
  type GroceryRepository,
  type SavedListRepository,
  type HouseholdRepository,
  type RealtimeClientLike,
  createLocalKitchenRepository,
  createLocalMealPlanRepository,
  createLocalProfileStore,
  createLocalRecipeRepository,
  createSupabaseKitchenRepository,
  createSupabaseMealPlanRepository,
  createSupabaseProfileStore,
  createSupabaseRecipeRepository,
  createLocalMenuRepository,
  createSupabaseMenuRepository,
  LOCAL_DRAFTS_KEY,
  LOCAL_MENUS_KEY,
  LOCAL_SHOPPING_KEY,
  LOCAL_TRIP_KEY,
  createLocalShoppingRepository,
  createSupabaseShoppingRepository,
  type ShoppingRepository,
  type MenuRepository,
  LOCAL_EVENTS_KEY,
  LOCAL_FAVORITES_KEY,
  LOCAL_MEAL_PLANS_KEY,
  LOCAL_PANTRY_KEY,
  LOCAL_RATINGS_KEY,
  type KitchenRepository,
  type MealPlanRepository,
  type ProfileStore,
  type RecipeRepository,
  type Result, loadAccess, OPEN_ACCESS } from "@kitchen-pantry/database";
import type { AccessStatus, DessertSettings, OnboardingProfile, SeasonalSettings, SkillLevel } from "@kitchen-pantry/shared-types";
import { authErrorMessage, defaultOnboardingProfile, signInSchema, signUpSchema, issuesToFieldErrors } from "@kitchen-pantry/validation";
import { AppState as RNAppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { unregisterPush } from "./push";
import { deviceStorage } from "./storage";
import { asSupabaseLike, supabase } from "./supabase";

export type DataMode = "preview" | "supabase";

interface AppState {
  mode: DataMode;
  /** True until the stored session and profile have been read. */
  loading: boolean;
  email: string | null;
  /** The signed-in account id (for the store's purchase records); null in preview mode. */
  userId: string | null;
  signedIn: boolean;
  profile: OnboardingProfile | null;
  kitchen: KitchenRepository;
  recipes: RecipeRepository;
  menus: MenuRepository;
  /** One Store vs. Best Deals: this person's settings and the household's chosen trip. */
  shopping: ShoppingRepository;
  mealPlans: MealPlanRepository;
  households: HouseholdRepository;
  grocery: GroceryRepository;
  /** Saved lists ("Weekly basics"), shared with the household. */
  savedLists: SavedListRepository;
  /** The household's store for live prices. */
  stores: StoreRepository;
  /** Smart Cart drafts (shared with the household in Supabase mode). */
  carts: CartRepository;
  /** Weekly drafts settings (household), notices and notification choices (this person). */
  weekly: WeeklyPlanningRepository;
  /** Smart Savings: pantry log, logged shops and sent carts (household). */
  savings: SavingsRepository;
  /** Who's eating, portions and the activity feed. */
  life: HouseholdLifeRepository;
  /** Supabase Realtime for the live grocery list; null in preview mode. */
  realtime: RealtimeClientLike | null;
  /** Re-read the profile (after joining, leaving or switching households). */
  refreshProfile(): Promise<void>;
  /** Joined a household before onboarding: its shared answers, for the questionnaire. */
  joinDraft(): Promise<OnboardingProfile | null>;
  /** Access token for calling the Kitchen Pantry server (AI planning); null in preview mode. */
  accessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<Result<null>>;
  signUp(email: string, password: string): Promise<Result<{ needsConfirmation: boolean }>>;
  signOut(): Promise<void>;
  /** Subscription access (always open in preview mode or while billing is off). */
  access: AccessStatus;
  refreshAccess(): Promise<AccessStatus>;
  /** Permanently delete this account (type DELETE to confirm); signs out on success. */
  deleteAccount(confirm: string): Promise<Result<null>>;
  saveProfile(profile: OnboardingProfile): Promise<Result<OnboardingProfile>>;
  setSkillLevel(level: SkillLevel): Promise<Result<SkillLevel>>;
  setDesserts(settings: DessertSettings): Promise<Result<DessertSettings>>;
  setSeasonal(settings: SeasonalSettings): Promise<Result<SeasonalSettings>>;
  clearPreview(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const localKitchen = createLocalKitchenRepository(deviceStorage);
const localProfiles = createLocalProfileStore(deviceStorage);
const remoteKitchen = supabase ? createSupabaseKitchenRepository(asSupabaseLike(supabase)) : null;
const remoteProfiles = supabase ? createSupabaseProfileStore(asSupabaseLike(supabase)) : null;
const localRecipes = createLocalRecipeRepository(deviceStorage);
const remoteRecipes = supabase ? createSupabaseRecipeRepository(asSupabaseLike(supabase)) : null;
const localMealPlans = createLocalMealPlanRepository(deviceStorage);
const remoteMealPlans = supabase ? createSupabaseMealPlanRepository(asSupabaseLike(supabase)) : null;
const households: HouseholdRepository = supabase ? createSupabaseHouseholdRepository(asSupabaseLike(supabase)) : createPreviewHouseholdRepository();
const grocery: GroceryRepository = supabase ? createSupabaseGroceryRepository(asSupabaseLike(supabase)) : createLocalGroceryRepository(deviceStorage);
const savedLists: SavedListRepository = supabase ? createSupabaseSavedListRepository(asSupabaseLike(supabase)) : createLocalSavedListRepository(deviceStorage);
const realtime = supabase ? (supabase as unknown as RealtimeClientLike) : null;
const stores: StoreRepository = supabase ? createSupabaseStoreRepository(asSupabaseLike(supabase)) : createLocalStoreRepository(deviceStorage);
const carts: CartRepository = supabase ? createSupabaseCartRepository(asSupabaseLike(supabase)) : createLocalCartRepository(deviceStorage);
const weekly: WeeklyPlanningRepository = supabase
  ? createSupabaseWeeklyPlanningRepository(asSupabaseLike(supabase), async () => (await supabase!.auth.getSession()).data.session?.user.id ?? null)
  : createLocalWeeklyPlanningRepository(deviceStorage);
const savings: SavingsRepository = supabase ? createSupabaseSavingsRepository(asSupabaseLike(supabase)) : createLocalSavingsRepository(deviceStorage);
const menus: MenuRepository = supabase ? createSupabaseMenuRepository(asSupabaseLike(supabase)) : createLocalMenuRepository(deviceStorage);
const shopping: ShoppingRepository = supabase ? createSupabaseShoppingRepository(asSupabaseLike(supabase)) : createLocalShoppingRepository(deviceStorage);
const life: HouseholdLifeRepository = supabase ? createSupabaseHouseholdLifeRepository(asSupabaseLike(supabase)) : createLocalHouseholdLifeRepository(deviceStorage);

async function joinDraft(): Promise<OnboardingProfile | null> {
  if (!supabase) return null;
  const { data, error } = await asSupabaseLike(supabase).rpc(rpc.getHouseholdOnboardingDraft);
  if (error) return null;
  return joinDraftProfile(data, defaultOnboardingProfile())?.profile ?? null;
}

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Session, profile and data stores for the whole app. Screens read from
 * here; nothing else talks to Supabase or device storage directly.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const mode: DataMode = supabase ? "supabase" : "preview";
  const profiles: ProfileStore = remoteProfiles ?? localProfiles;
  const kitchen: KitchenRepository = remoteKitchen ?? localKitchen;
  const recipes: RecipeRepository = remoteRecipes ?? localRecipes;
  const mealPlans: MealPlanRepository = remoteMealPlans ?? localMealPlans;

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(mode === "preview");
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);

  const [access, setAccess] = useState<AccessStatus>(OPEN_ACCESS);
  const refreshAccess = useCallback(async () => {
    const next = supabase ? await loadAccess(asSupabaseLike(supabase)) : OPEN_ACCESS;
    setAccess(next);
    return next;
  }, []);

  const loadProfile = useCallback(async () => {
    const result = await profiles.load();
    setProfile(result.ok ? result.data : null);
    if (supabase) await refreshAccess();
  }, [profiles, refreshAccess]);

  // Re-check when the app comes back to the foreground (a purchase or a trial ending).
  useEffect(() => {
    if (!supabase) return;
    const sub = RNAppState.addEventListener("change", (state: string) => {
      if (state === "active") void supabase!.auth.getSession().then(({ data }) => data.session && refreshAccess());
    });
    return () => sub.remove();
  }, [refreshAccess]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSignedIn(Boolean(data.session));
        setEmail(data.session?.user.email ?? null);
        setUserId(data.session?.user.id ?? null);
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
      setUserId(session?.user.id ?? null);
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
    if (error) return { ok: false, message: authErrorMessage(error.code, "sign-in") };
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
      if (error) return { ok: false, message: authErrorMessage(error.code, "sign-up") };
      return { ok: true, data: { needsConfirmation: !data.session } };
    },
    [],
  );

  const signOut = useCallback(async () => {
    // This phone stops receiving this person's notices.
    await unregisterPush(weekly).catch(() => undefined);
    await supabase?.auth.signOut();
  }, []);

  const deleteAccount = useCallback(async (confirm: string): Promise<Result<null>> => {
    if (!supabase) return { ok: false, message: "Supabase isn't configured." };
    if (confirm !== "DELETE") return { ok: false, message: "Type DELETE in capitals to confirm." };
    // Stop this phone's notices first, while the account still exists.
    await unregisterPush(weekly).catch(() => undefined);
    const { error } = await supabase.rpc("delete_my_account", { confirm });
    if (error) {
      return {
        ok: false,
        message:
          error.code === "PGRST202"
            ? "Account deletion isn't set up on the server yet."
            : (error as { hint?: string }).hint === "cancel_subscription_first"
              ? "You have a website subscription that still renews. Delete your account on the Kitchen Pantry website (it turns renewal off for you), or cancel it there first."
              : "We couldn't delete your account. Please try again, or contact us.",
      };
    }
    await supabase.auth.signOut().catch(() => undefined);
    return { ok: true, data: null };
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

  const setDesserts = useCallback(
    async (settings: DessertSettings) => {
      const previous = profile;
      if (profile) setProfile({ ...profile, desserts: settings }); // optimistic
      const result = await profiles.setDesserts(settings);
      if (!result.ok) setProfile(previous);
      return result;
    },
    [profiles, profile],
  );

  const setSeasonal = useCallback(
    async (settings: SeasonalSettings) => {
      const previous = profile;
      if (profile) setProfile({ ...profile, seasonal: settings }); // optimistic
      const result = await profiles.setSeasonal(settings);
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
    await deviceStorage.removeItem(LOCAL_EVENTS_KEY);
    await deviceStorage.removeItem(LOCAL_MEAL_PLANS_KEY);
    await deviceStorage.removeItem(LOCAL_GROCERY_KEY);
    await deviceStorage.removeItem(LOCAL_STORE_KEY);
    await deviceStorage.removeItem(LOCAL_MENUS_KEY);
    await deviceStorage.removeItem(LOCAL_SHOPPING_KEY);
    await deviceStorage.removeItem(LOCAL_TRIP_KEY);
    await deviceStorage.removeItem(LOCAL_DRAFTS_KEY);
    setProfile(null);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      mode,
      loading,
      email,
      userId,
      signedIn,
      profile,
      kitchen,
      recipes,
      menus,
      shopping,
      mealPlans,
      households,
      grocery,
      savedLists,
      stores,
      carts,
      weekly,
      savings,
      life,
      realtime,
      refreshProfile: loadProfile,
      joinDraft,
      accessToken,
      signIn,
      signUp,
      signOut,
      access,
      refreshAccess,
      deleteAccount,
      saveProfile,
      setSkillLevel,
      setDesserts,
      setSeasonal,
      clearPreview,
    }),
    [mode, loading, email, userId, signedIn, profile, kitchen, recipes, mealPlans, loadProfile, signIn, signUp, signOut, access, refreshAccess, deleteAccount, saveProfile, setSkillLevel, setDesserts, setSeasonal, clearPreview],
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
