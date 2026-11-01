import { pantryCategories } from "@kitchen-pantry/shared-types";
import { View } from "react-native";
import { Body, Card, CardTitle, Eyebrow, Pill, Screen } from "@/components/ui";

export default function KitchenScreen() {
  return (
    <Screen title="My Kitchen" subtitle="Tick what you already have. It comes straight off your grocery list.">
      <Card>
        <Eyebrow>Inventory</Eyebrow>
        <CardTitle>Your kitchen is empty</CardTitle>
        <Body>Pantry, fridge and freezer tracking is the next build phase.</Body>
      </Card>
      <Card>
        <Eyebrow>Categories</Eyebrow>
        <View className="mt-4 flex-row flex-wrap gap-2">
          {pantryCategories.map((c) => (
            <Pill key={c.code}>{c.label}</Pill>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
