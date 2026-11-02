import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useApp } from "@/lib/app-state";
import { finishSignIn } from "@/lib/social-sign-in";

/**
 * kitchenpantry://auth/callback — where Google / Apple / Facebook (and email
 * confirmation links opened on the phone) send people back. Usually the
 * in-app browser hands the link straight to the sign-in screen; this screen
 * covers Android and email links, which open the app at this address.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { signedIn, profile } = useApp();
  const [done, setDone] = useState<"ok" | "failed" | null>(null);

  useEffect(() => {
    const code = typeof params.code === "string" ? params.code : null;
    if (!code || params.error) {
      setDone("failed");
      return;
    }
    let cancelled = false;
    void finishSignIn(code).then((r) => {
      if (!cancelled) setDone(r.ok ? "ok" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error]);

  if (signedIn) return <Redirect href={profile ? "/" : "/onboarding"} />;
  if (done === "failed") return <Redirect href="/sign-in" />;
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator accessibilityLabel="Signing you in" />
    </View>
  );
}
