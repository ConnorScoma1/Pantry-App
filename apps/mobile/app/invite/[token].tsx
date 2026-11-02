import type { InviteDetails } from "@kitchen-pantry/database";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Notice } from "@/components/controls";
import { Body, Card } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { useHousehold } from "@/lib/use-household";

const PROBLEMS: Record<Exclude<InviteDetails["status"], "valid" | "already_member">, [string, string]> = {
  invalid: ["This invite doesn't work", "Check you copied the whole link or code, or ask for a new one."],
  expired: ["This invite has expired", "Ask the household owner for a new one."],
  used: ["This invite has already been used", "Each invite works once. Ask for a new one."],
  revoked: ["This invite was cancelled", "Ask the household owner for a new one."],
  wrong_account: ["This invite is for a different email", "Sign in with the email address the invite was sent to."],
  full: ["This household is full", "A household can have up to 6 people."],
};

/**
 * Opened from kitchenpantry://invite/<token> or "Join a household". Requires
 * sign-in; the database checks expiry, single use and email match.
 */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { loading, signedIn, mode, profile, email } = useApp();
  const h = useHousehold();
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn || mode === "preview") return;
    void h.inviteDetails(String(token ?? "")).then((r) => setDetails(r.ok ? r.data : { householdName: null, invitedBy: null, expiresAt: null, status: "invalid" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, mode, token]);

  if (loading) return <ActivityIndicator className="flex-1" accessibilityLabel="Loading" />;
  if (mode === "supabase" && !signedIn) return <Redirect href="/sign-in" />;

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <SafeAreaView className="flex-1 bg-background px-5" edges={["top", "bottom"]}>
      <View className="flex-1 justify-center gap-4">
        {mode === "preview" ? (
          <Card>
            <Text className="text-2xl font-bold text-foreground">Invites need accounts</Text>
            <Body>This copy of Kitchen Pantry runs in preview mode, without accounts.</Body>
          </Card>
        ) : !details ? (
          <ActivityIndicator accessibilityLabel="Checking the invite" />
        ) : details.status !== "valid" && details.status !== "already_member" ? (
          <View>
            <Text accessibilityRole="header" className="text-[30px] font-bold leading-tight text-foreground">
              {PROBLEMS[details.status][0]}
            </Text>
            <Body>{PROBLEMS[details.status][1]}</Body>
            {details.status === "wrong_account" && email ? <Body>You&apos;re signed in as {email}.</Body> : null}
          </View>
        ) : (
          <View className="gap-3">
            <Text accessibilityRole="header" className="text-[30px] font-bold leading-tight text-foreground">
              {details.status === "already_member" ? `You're already in ${details.householdName ?? "this household"}` : `Join ${details.householdName ?? "this household"}?`}
            </Text>
            {details.status === "valid" ? (
              <>
                <Body>
                  {details.invitedBy ? `${details.invitedBy} invited you` : "You've been invited"} to share the kitchen inventory, meal plans and grocery list.
                </Body>
                <Card>
                  <Text className="text-[16px] leading-6 text-foreground">
                    Your cooking skill, goals, allergies and diet stay yours. Meal plans will avoid your allergies for everyone. You can switch or leave any time.
                  </Text>
                </Card>
              </>
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button
              size="lg"
              label={busy ? "Joining…" : details.status === "already_member" ? "Open it" : "Join household"}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                const r = await h.acceptInvite(String(token ?? ""));
                setBusy(false);
                if (!r.ok) {
                  setError(r.message);
                  return;
                }
                router.replace(profile ? "/grocery" : "/onboarding");
              }}
            />
          </View>
        )}
        <Button variant="ghost" label="Not now" onPress={leave} />
      </View>
    </SafeAreaView>
  );
}
