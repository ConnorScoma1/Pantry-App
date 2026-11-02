import { useState } from "react";
import { Linking, View } from "react-native";
import { Button, Field, Input, Notice } from "@/components/controls";
import { Body, Card, Eyebrow } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { apiUrl } from "@/lib/config";

/** Profile → Delete account (App Store / Google Play requirement). Two steps: open, then type DELETE. */
export function DeleteAccountCard({ shared }: { shared: boolean }) {
  const { deleteAccount } = useApp();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
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
        This can&apos;t be undone.
      </Body>
      {!open ? (
        <View className="mt-4 gap-2">
          <Button variant="danger" icon="trash-outline" label="Delete my account…" onPress={() => setOpen(true)} />
          {apiUrl ? (
            <Button variant="ghost" label="Privacy policy" onPress={() => void Linking.openURL(`${apiUrl}/privacy`)} />
          ) : null}
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
