import { Platform } from "react-native";

/**
 * In-app subscriptions through RevenueCat (App Store / Google Play).
 *
 * Optional: it needs `npx expo install react-native-purchases` and a
 * development build (Expo Go only runs RevenueCat's preview mode, with no
 * real purchases), plus EXPO_PUBLIC_REVENUECAT_IOS_KEY /
 * EXPO_PUBLIC_REVENUECAT_ANDROID_KEY (RevenueCat's public SDK keys — safe in
 * the app). Without them the paywall offers the website instead.
 *
 * People are logged in to RevenueCat with their Kitchen Pantry account id,
 * so the server's webhook knows whose subscription it is. Prices always come
 * from the store (priceString), never from us.
 */
interface StorePackage {
  identifier: string;
  packageType?: string;
  product: { priceString: string; title?: string };
}
interface PurchasesModule {
  configure(options: { apiKey: string; appUserID?: string }): void;
  logIn(appUserID: string): Promise<unknown>;
  getOfferings(): Promise<{ current: { availablePackages: StorePackage[]; annual?: StorePackage | null } | null }>;
  purchasePackage(pkg: StorePackage): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
}

// Metro's CommonJS require (module-scoped type so this file doesn't depend on Node types).
declare const require: (id: string) => unknown;

let mod: PurchasesModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = (require("react-native-purchases") as { default: PurchasesModule }).default ?? null;
} catch {
  mod = null;
}

const key =
  Platform.OS === "ios" ? (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "") : Platform.OS === "android" ? (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "") : "";

export function inAppPurchasesAvailable(): boolean {
  return Boolean(mod && key);
}

let configuredFor: string | null = null;

async function ready(userId: string): Promise<PurchasesModule | null> {
  if (!mod || !key) return null;
  if (configuredFor === null) {
    mod.configure({ apiKey: key, appUserID: userId });
    configuredFor = userId;
  } else if (configuredFor !== userId) {
    await mod.logIn(userId);
    configuredFor = userId;
  }
  return mod;
}

/** The yearly plan from the store's current offering (with the store's own price), or null. */
export async function yearlyPackage(userId: string): Promise<StorePackage | null> {
  try {
    const p = await ready(userId);
    if (!p) return null;
    const offerings = await p.getOfferings();
    const current = offerings.current;
    return current?.annual ?? current?.availablePackages.find((x) => x.packageType === "ANNUAL") ?? current?.availablePackages[0] ?? null;
  } catch {
    return null;
  }
}

export type PurchaseResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

export async function buy(userId: string, pkg: StorePackage): Promise<PurchaseResult> {
  try {
    const p = await ready(userId);
    if (!p) return { ok: false, cancelled: false, message: "In-app purchases aren't set up in this build." };
    await p.purchasePackage(pkg);
    return { ok: true };
  } catch (err) {
    const cancelled = Boolean((err as { userCancelled?: boolean } | null)?.userCancelled);
    return { ok: false, cancelled, message: cancelled ? "" : "The purchase didn't go through. You haven't been charged." };
  }
}

export async function restore(userId: string): Promise<PurchaseResult> {
  try {
    const p = await ready(userId);
    if (!p) return { ok: false, cancelled: false, message: "In-app purchases aren't set up in this build." };
    await p.restorePurchases();
    return { ok: true };
  } catch {
    return { ok: false, cancelled: false, message: "We couldn't restore purchases. Please try again." };
  }
}
