import { skillLevels } from "@kitchen-pantry/shared-types";
import { Text, View } from "react-native";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";

export default function PlanScreen() {
  return (
    <Screen title="Meal Plan" subtitle="These settings apply to every week you plan.">
      <Card>
        <Eyebrow>This week</Eyebrow>
        <CardTitle>Nothing planned yet</CardTitle>
        <Body>Your plan will appear here once meal planning is live.</Body>
      </Card>
      <Card>
        <Eyebrow>Cooking skill levels</Eyebrow>
        <View className="mt-3 gap-3">
          {skillLevels.map((s) => (
            <View key={s.level} className="flex-row gap-3">
              <Text className="w-6 text-[17px] font-bold text-foreground">{s.level}</Text>
              <View className="flex-1">
                <Text className="text-[16px] font-semibold text-foreground">{s.label}</Text>
                <Text className="text-[15px] leading-5 text-muted">{s.summary}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
