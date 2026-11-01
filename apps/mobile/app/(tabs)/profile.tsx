import { brand } from "@kitchen-pantry/ui-tokens";
import Constants from "expo-constants";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";

export default function ProfileScreen() {
  return (
    <Screen title="Profile">
      <Card>
        <Eyebrow>Account</Eyebrow>
        <CardTitle>Not signed in</CardTitle>
        <Body>Sign-in on mobile uses the same Supabase account as the web app and is coming next.</Body>
      </Card>
      <Card>
        <Eyebrow>About</Eyebrow>
        <CardTitle>{brand.name}</CardTitle>
        <Body>Version {Constants.expoConfig?.version ?? "dev"} · Appearance follows your device setting.</Body>
      </Card>
    </Screen>
  );
}
