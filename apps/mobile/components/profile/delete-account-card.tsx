import { useState } from "react";
import { Linking, View } from "react-native";
import { Button, Field, Input, Notice } from "@/components/controls";
import { Body, Card, Eyebrow } from "@/components/ui";
import { accessSummary } from "@kitchen-pantry/database";
import { router } from "expo-router";
import { useApp } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";

/** Profile → Delete account (App Store / Google Play requirement). Two steps: open, then type DELETE. */
export function DeleteAccountCard({ shared }: { shared: boolean }) {
  const { deleteAccount, access } = useApp();
  const websiteSub = access.subscription?.source === "stripe" && access.subscription.active && access.subscription.willRenew;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (websiteSub) {
      setError("You have a website subscription. Cancel it in Profile on the Kitchen Pantry website first (or delete your account there, which cancels it for you).");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await deleteAccount(typed.trim());
    setBusy(false);
    // Signed out on success: the app returns to the sign-in screen by itself.
    if (!r.ok) setError(r.message);
  }

  return (
    <Card>
      <Eyebrow>Delete account</Eyebrow>
      <Body>
        Permanently deletes your account, your allergies and preferences, ratings, cooking history and notifications.{" "}
        {shared
          ? "Your shared household stays with the other members, along with what's in it. If you're the owner, the longest-standing member becomes the owner."
          : "Your household and everything in it (kitchen, meal plans, grocery lists, saved recipes) are deleted too."}{" "}
        Deleting your account doesn&apos;t cancel an App Store or Google Play subscription; cancel that in your store account
        first. This can&apos;t be undone.
      </Body>
      {!open ? (
        <View className="mt-4 gap-2">
          <Button variant="danger" icon="trash-outline" label="Delete my account…" onPress={() => setOpen(true)} />
        </View>
      ) : (
        <View className="mt-4 gap-3">
          <Field label="Type DELETE to confirm" error={error ?? undefined}>
            <Input
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              invalid={Boolean(error)}
              accessibilityLabel="Type DELETE to confirm"
            />
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="danger"
            label={busy ? "Deleting…" : "Permanently delete my account"}
            onPress={() => void confirm()}
            disabled={busy || typed.trim() !== "DELETE"}
          />
          <Button
            variant="ghost"
            label="Cancel"
            onPress={() => {
              setOpen(false);
              setTyped("");
              setError(null);
            }}
            disabled={busy}
          />
        </View>
      )}
    </Card>
  );
}

/** Profile → Your data. The download itself happens on the website (a file is easier to keep there). */
export function YourDataCard() {
  return (
    <Card>
      <Eyebrow>Your data</Eyebrow>
      <Body>
        Download a copy of everything your account can see (profile, allergies, kitchen, plans, lists, ratings and cooking
        history) from Profile on the Kitchen Pantry website.
      </Body>
      {apiUrl ? (
        <View className="mt-4 gap-2">
          <Button variant="secondary" icon="download-outline" label="Open on the website" onPress={() => void Linking.openURL(`${apiUrl}/profile#your-data`)} />
          <Button variant="ghost" label="Privacy policy" onPress={() => void Linking.openURL(`${apiUrl}/privacy`)} />
        </View>
      ) : null}
    </Card>
  );
}

/** Profile → Subscription (only once billing is switched on). */
export function SubscriptionCard() {
  const { access } = useApp();
  if (!access.enforced) return null;
  const store = access.subscription?.source === "app_store" ? "iPhone Settings → your name → Subscriptions" : access.subscription?.source === "play_store" ? "Play Store → Payments & subscriptions" : access.subscription?.source === "stripe" ? "Profile on the Kitchen Pantry website" : null;
  return (
    <Card>
      <Eyebrow>Subscription</Eyebrow>
      <Body>{accessSummary(access)}</Body>
      {access.reason === "household" ? <Body>Someone in your household subscribes, so you&apos;re covered too.</Body> : null}
      {access.reason === "subscribed" && store ? <Body>Manage or cancel it in {store}.</Body> : null}
      {access.reason === "trial" || access.reason === "expired" ? (
        <View className="mt-4">
          <Button label="Subscribe" icon="star-outline" onPress={() => router.push("/subscribe")} />
        </View>
      ) : null}
    </Card>
  );
}
