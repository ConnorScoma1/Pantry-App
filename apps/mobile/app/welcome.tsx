import { router } from "expo-router";
import { Text, View } from "react-native";
import { Body, PrimaryButton, Screen } from "@/components/ui";

const coming = [
  "Sign in with the same account as the web app",
  "The 7-step kitchen questionnaire",
  "My Kitchen inventory with use-by reminders",
  "Weekly meal plans and a shared grocery list",
];

export default function WelcomeScreen() {
  return (
    <Screen title="What's coming" subtitle="The mobile app shares its design, types and rules with the web app.">
      <View className="gap-3">
        {coming.map((item) => (
          <Text key={item} className="text-[17px] text-foreground">
            •  {item}
          </Text>
        ))}
      </View>
      <Body>Everything is built once in shared packages, so both apps stay in step.</Body>
      <PrimaryButton label="Close" onPress={() => router.back()} />
    </Screen>
  );
}
