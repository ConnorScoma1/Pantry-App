import { dessertCategories, dessertFrequencies, dessertSkillLevels, skillLevels, type DessertSettings, type SeasonalSettings, type SkillLevel } from "@kitchen-pantry/shared-types";
import { brand } from "@kitchen-pantry/ui-tokens";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button, Chip, ChipRow, ChoiceCard, Notice } from "@/components/controls";
import { SeasonalSettingsCard } from "@/components/seasonal/seasonal-settings";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { todayIso } from "@/lib/use-kitchen";
import { useApp, useProfile } from "@/lib/app-state";

export default function ProfileScreen() {
  const { mode, email, setSkillLevel, setDesserts, setSeasonal, signOut, clearPreview } = useApp();
  const profile = useProfile();
  const [message, setMessage] = useState<string | null>(null);
  const changeDesserts = async (patch: Partial<DessertSettings>) => {
    setMessage(null);
    const r = await setDesserts({ ...profile.desserts, ...patch });
    if (!r.ok) setMessage(r.message);
  };
  const changeSeasonal = async (next: SeasonalSettings) => {
    setMessage(null);
    const r = await setSeasonal(next);
    if (!r.ok) setMessage(r.message);
  };

  return (
    <Screen title="Profile" showProfile={false}>
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
        <Eyebrow>Desserts</Eyebrow>
        <Body>Optional. Never planned every day; &quot;Add dessert&quot; on the Meal Plan always works.</Body>
        <Text className="mb-2 mt-4 text-[15px] font-semibold text-foreground">How often to plan one automatically</Text>
        <ChipRow>
          {dessertFrequencies.map((f) => (
            <Chip key={f.code} label={f.label} selected={profile.desserts.frequency === f.code} onPress={() => void changeDesserts({ frequency: f.code })} />
          ))}
        </ChipRow>
        <Text className="mb-2 mt-4 text-[15px] font-semibold text-foreground">Dessert skill</Text>
        <ChipRow>
          <Chip label={`Same as cooking (${profile.skillLevel})`} selected={profile.desserts.skillLevel === null} onPress={() => void changeDesserts({ skillLevel: null })} />
          {dessertSkillLevels.map((s) => (
            <Chip key={s.level} label={`${s.level} · ${s.label}`} selected={profile.desserts.skillLevel === s.level} onPress={() => void changeDesserts({ skillLevel: s.level as SkillLevel })} />
          ))}
        </ChipRow>
        <Text className="mb-2 mt-4 text-[15px] font-semibold text-foreground">Kinds you like (none = any)</Text>
        <ChipRow>
          {dessertCategories.map((cat) => (
            <Chip
              key={cat.code}
              label={cat.label}
              selected={profile.desserts.categories.includes(cat.code)}
              onPress={() =>
                void changeDesserts({
                  categories: profile.desserts.categories.includes(cat.code)
                    ? profile.desserts.categories.filter((x) => x !== cat.code)
                    : [...profile.desserts.categories, cat.code],
                })
              }
            />
          ))}
        </ChipRow>
      </Card>

      <SeasonalSettingsCard profile={profile} today={todayIso()} onChange={(next) => void changeSeasonal(next)} />

      <Card>
        <Eyebrow>Household</Eyebrow>
        {profile.householdDiet && profile.householdDiet.memberCount > 1 ? (
          <Body>
            Shared with {profile.householdDiet.memberCount - 1} other{profile.householdDiet.memberCount === 2 ? "" : "s"}. Your allergies and diet stay
            yours; plans avoid everyone&apos;s.
          </Body>
        ) : null}
        <View className="mt-3">
          <Button
            variant="secondary"
            icon="people-outline"
            label={mode === "supabase" ? "People, invites and sharing" : "Sharing with your household"}
            onPress={() => router.push("/household")}
          />
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
