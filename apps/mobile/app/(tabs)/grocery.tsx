import { priceStatuses } from "@kitchen-pantry/shared-types";
import { Text, View } from "react-native";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";

const tone: Record<string, string> = {
  verified: "text-price-verified",
  cached: "text-price-cached",
  estimated: "text-price-estimated",
  unavailable: "text-muted",
};

export default function GroceryScreen() {
  return (
    <Screen title="Grocery List">
      <Card>
        <Eyebrow>This week</Eyebrow>
        <CardTitle>Your list is empty</CardTitle>
        <Body>Plan a week and every ingredient is combined into one list, grouped by aisle.</Body>
      </Card>
      <Card>
        <Eyebrow>How prices are labelled</Eyebrow>
        <View className="mt-3 gap-3">
          {priceStatuses.map((s) => (
            <View key={s.code}>
              <Text className={`text-[15px] font-bold ${tone[s.code] ?? ""}`}>{s.label}</Text>
              <Text className="text-[15px] leading-5 text-muted">{s.description}</Text>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
