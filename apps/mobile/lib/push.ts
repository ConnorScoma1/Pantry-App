import type { Result, WeeklyPlanningRepository } from "@kitchen-pantry/database";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { deviceStorage } from "./storage";

/**
 * Phone notifications ("Next week's plan is ready") through Expo's push
 * service. The phone asks permission, gets its Expo push address and saves
 * it for the signed-in person; the Kitchen Pantry server sends the notice.
 * Needs a development or store build with the EAS project ID configured
 * (README → Weekly drafts → Phone notifications).
 */
const TOKEN_KEY = "kp-push-token-v1";

function projectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? null;
}

export function pushSupport(mode: "preview" | "supabase"): { available: boolean; reason: string | null } {
  if (mode === "preview") return { available: false, reason: "Phone notifications need a signed-in account." };
  if (Platform.OS !== "ios" && Platform.OS !== "android") return { available: false, reason: "Phone notifications work in the iPhone and Android app." };
  if (!projectId()) return { available: false, reason: "This build of the app isn't set up for phone notifications yet (see the README)." };
  return { available: true, reason: null };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function registerForPush(repo: WeeklyPlanningRepository): Promise<Result<null>> {
  const id = projectId();
  if (!id || (Platform.OS !== "ios" && Platform.OS !== "android")) return { ok: false, message: "This build of the app isn't set up for phone notifications yet." };
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("plans", { name: "Meal plans", importance: Notifications.AndroidImportance.DEFAULT });
    }
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return { ok: false, message: "Notifications are turned off for Kitchen Pantry in your phone's Settings." };
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    const saved = await repo.registerPushToken({ token, platform: Platform.OS });
    if (saved.ok) await deviceStorage.setItem(TOKEN_KEY, token);
    return saved;
  } catch {
    return { ok: false, message: "Couldn't set up phone notifications on this device (simulators can't receive them)." };
  }
}

export async function unregisterPush(repo: WeeklyPlanningRepository): Promise<void> {
  const token = await deviceStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await repo.unregisterPushToken(token);
  await deviceStorage.removeItem(TOKEN_KEY);
}

/** Tapping a notice opens the week it's about (in-app paths only). */
export function usePushNavigation() {
  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const open = (url: unknown) => {
      if (typeof url === "string" && /^\/plan(\?week=\d{4}-\d{2}-\d{2})?$/.test(url)) router.push(url as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.url));
    void Notifications.getLastNotificationResponseAsync().then((r) => (r ? open(r.notification.request.content.data?.url) : undefined));
    return () => sub.remove();
  }, []);
}
