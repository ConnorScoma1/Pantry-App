import Ionicons from "@expo/vector-icons/Ionicons";
import { formatQuantity, remainingLabel, type KitchenItemView } from "@kitchen-pantry/inventory-engine";
import { labelFor, storageLocations } from "@kitchen-pantry/shared-types";
import { Pressable, Text, View } from "react-native";
import { useThemeColors } from "@/lib/theme";
import { UrgencyBadge } from "./urgency-badge";

export function ItemRow({
  view,
  onPress,
  showLocation = true,
  last = false,
}: {
  view: KitchenItemView;
  onPress: () => void;
  showLocation?: boolean;
  last?: boolean;
}) {
  const c = useThemeColors();
  const { item, urgency } = view;
  const details = [
    formatQuantity(item.quantity, item.unit),
    remainingLabel(item.estimatedRemainingPct),
    showLocation ? labelFor(storageLocations, item.storageLocation) : null,
    item.isStaple && item.quantity === null ? "In stock" : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
      onPress={onPress}
      className={`min-h-16 flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-strong ${last ? "" : "border-b border-border"}`}
    >
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[17px] font-medium text-foreground">
          {item.name}
        </Text>
        {details.length > 0 ? (
          <Text numberOfLines={1} className="text-[15px] text-muted">
            {details.join(" · ")}
          </Text>
        ) : null}
      </View>
      <UrgencyBadge urgency={urgency} />
      <Ionicons name="chevron-forward" size={18} color={c.subtle} />
    </Pressable>
  );
}
