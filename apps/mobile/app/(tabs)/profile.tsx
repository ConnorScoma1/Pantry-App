import { skillLevels } from "@kitchen-pantry/shared-types";
import { brand } from "@kitchen-pantry/ui-tokens";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { Button, ChoiceCard, Notice } from "@/components/controls";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { useApp, useProfile } from "@/lib/app-state";

export default function ProfileScreen() {
  const { mode, email, setSkillLevel, signOut, clearPreview } = useApp();
  const profile = useProfile();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Screen title="Profile">
      {message ? <Notice tone="error">{message}</Notice> : null}

      <Card>
        <Eyebrow>Account</Eyebrow>
        {mode === "supabase" ? (
          <>
            <CardTitle>{email ?? "Signed in"}</CardTitle>
            <View className="mt-4">
              <Button variant="secondary" icon="log-out-outline" label="Sign out" onPress={() => void signOut()} />
            </View>
          </>
        ) : (
          <>
            <CardTitle>Preview mode</CardTitle>
            <Body>Accounts turn on once Supabase is connected (see the README). Until then everything stays on this device.</Body>
          </>
        )}
      </Card>

      <Card>
        <Eyebrow>Cooking skill</Eyebrow>
        <Body>Change this whenever you like. Advanced levels are never simplified automatically.</Body>
        <View className="mt-4 gap-2.5" accessibilityRole="radiogroup">
          {skillLevels.map((s) => (
            <ChoiceCard
              key={s.level}
              title={`${s.level} · ${s.label}`}
              description={s.summary}
              selected={profile.skillLevel === s.level}
              onPress={async () => {
                setMessage(null);
                const r = await setSkillLevel(s.level);
                if (!r.ok) setMessage(r.message);
              }}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Eyebrow>Preferences</Eyebrow>
        <View className="mt-3 gap-2">
          <Button variant="secondary" icon="create-outline" label="Edit questionnaire answers" onPress={() => router.push("/onboarding")} />
          {mode === "preview" ? (
            <Button
              variant="danger"
              label="Clear preview data"
              onPress={() =>
                Alert.alert("Clear preview data?", "Your answers and kitchen on this device will be deleted.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Clear", style: "destructive", onPress: () => void clearPreview() },
                ])
              }
            />
          ) : null}
        </View>
      </Card>

      <Card>
        <Eyebrow>About</Eyebrow>
        <CardTitle>{brand.name}</CardTitle>
        <Body>Version {Constants.expoConfig?.version ?? "dev"} · Appearance follows your device setting.</Body>
      </Card>
    </Screen>
  );
}
