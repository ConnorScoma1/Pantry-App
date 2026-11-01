import { brand } from "@kitchen-pantry/ui-tokens";
import { Link } from "expo-router";
import { Text } from "react-native";
import { Body, Card, CardTitle, Eyebrow, PrimaryButton, Screen } from "@/components/ui";

export default function HomeScreen() {
  return (
    <Screen title="Your week" subtitle={brand.tagline}>
      <Card>
        <Eyebrow>Dinners</Eyebrow>
        <CardTitle>Nothing planned yet</CardTitle>
        <Body>
          Your week will be planned around your budget, skill level and what&apos;s already in your kitchen.
        </Body>
        <PrimaryButton label="Build my week" disabled />
        <Text className="mt-2 text-center text-[14px] text-muted">Meal planning is the next feature we&apos;re building.</Text>
      </Card>
      <Card>
        <Eyebrow>Get started</Eyebrow>
        <CardTitle>Set up your kitchen</CardTitle>
        <Body>Mobile sign-in and the questionnaire arrive next. For now, set up your profile on the web app.</Body>
        <Link href="/welcome" className="mt-4 text-[16px] font-semibold text-accent">
          What&apos;s coming →
        </Link>
      </Card>
    </Screen>
  );
}
