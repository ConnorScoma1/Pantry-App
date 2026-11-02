import { accessSummary } from "@kitchen-pantry/database";
import { brand } from "@kitchen-pantry/ui-tokens";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Notice } from "@/components/controls";
import { useApp } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";
import { buy, inAppPurchasesAvailable, restore, yearlyPackage } from "@/lib/purchases";

type Pkg = Awaited<ReturnType<typeof yearlyPackage>>;

/**
 * The paywall: shown when the free trial or subscription has ended (and
 * billing is switched on). Profile stays reachable from here, so people can
 * still export their data or delete their account.
 */
export default function SubscribeScreen() {
  const { access, refreshAccess, userId, signedIn } = useApp();
  const [pkg, setPkg] = useState<Pkg>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const iap = inAppPurchasesAvailable();

  useEffect(() => {
    if (iap && userId) void yearlyPackage(userId).then(setPkg);
  }, [iap, userId]);

  if (!signedIn) return <Redirect href="/sign-in" />;
  if (access.reason === "subscribed" || access.reason === "household" || !access.enforced) return <Redirect href="/" />;

  // The store confirms through RevenueCat → our server; check a few times.
  async function waitForAccess() {
    for (let i = 0; i < 8; i++) {
      const a = await refreshAccess();
      if (a.access) return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }

  async function purchase() {
    if (!userId || !pkg) return;
    setBusy(true);
    setMessage(null);
    const r = await buy(userId, pkg);
    if (r.ok) {
      setMessage({ tone: "info", text: "Thanks! Confirming your subscription…" });
      if (!(await waitForAccess())) setMessage({ tone: "info", text: "Your purchase went through. It can take a minute to show up — pull down or reopen the app." });
    } else if (!r.cancelled) setMessage({ tone: "error", text: r.message });
    setBusy(false);
  }

  async function restorePurchases() {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    const r = await restore(userId);
    if (!r.ok) setMessage({ tone: "error", text: r.message });
    else if (!(await waitForAccess())) setMessage({ tone: "info", text: "No active subscription found for this Apple or Google account." });
    setBusy(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 py-8 gap-4">
        <Text accessibilityRole="header" className="text-[32px] font-bold leading-tight tracking-tight text-foreground">
          {access.reason === "trial" ? `Subscribe to ${brand.name}` : access.subscription && !access.subscription.active ? "Your subscription has ended" : "Your free trial has ended"}
        </Text>
        <Text className="text-[17px] leading-6 text-muted">
          {accessSummary(access)} {access.reason === "trial" ? "Everything stays included after the trial." : `Keep planning with ${brand.name} — everything you've saved is still here.`}
        </Text>
        <View className="gap-1.5">
          {[
            "Weekly meal plans that fit your household, allergies and budget",
            "My Kitchen with use-by reminders, and recipes that use it up",
            "A shared grocery list, store prices and Smart Cart",
            "Cooking mode and the AI cooking assistant",
            "One subscription covers everyone in your household",
          ].map((t) => (
            <Text key={t} className="text-[16px] leading-6 text-foreground">• {t}</Text>
          ))}
        </View>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {iap && pkg ? (
          <View className="gap-2">
            <Button size="lg" label={busy ? "One moment…" : `Subscribe — ${pkg.product.priceString} a year`} onPress={() => void purchase()} disabled={busy} />
            <Button variant="ghost" label="Restore purchases" onPress={() => void restorePurchases()} disabled={busy} />
            <Text className="text-[13px] leading-5 text-muted">
              Billed yearly through your {Platform.OS === "ios" ? "Apple" : "Google Play"} account. Renews automatically unless you cancel at least 24 hours before it renews; manage it in your store account settings.
            </Text>
          </View>
        ) : null}
        {apiUrl ? (
          <Button
            variant={iap && pkg ? "secondary" : "primary"}
            size={iap && pkg ? "md" : "lg"}
            label="Subscribe on the website"
            onPress={() => void Linking.openURL(`${apiUrl}/profile#subscription`)}
          />
        ) : null}
        <Button variant="ghost" label="I've subscribed — check again" onPress={() => void refreshAccess()} disabled={busy} />
        <Button variant="ghost" icon="person-circle-outline" label="Profile (download your data or delete your account)" onPress={() => router.push("/profile")} />
        {apiUrl ? (
          <Text className="text-center text-[13px] text-muted">
            <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(`${apiUrl}/terms`)}>Terms of use</Text>
            {"  ·  "}
            <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(`${apiUrl}/privacy`)}>Privacy policy</Text>
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
