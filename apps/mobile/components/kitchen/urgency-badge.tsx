import type { UrgencyResult } from "@kitchen-pantry/inventory-engine";
import { Text, View } from "react-native";

/** Use-by status pill. The words carry the meaning; colour only reinforces it. */
export function UrgencyBadge({ urgency }: { urgency: UrgencyResult }) {
  const { urgency: level, daysLeft } = urgency;
  let label: string;
  let box: string;
  let text: string;
  switch (level) {
    case "past_date":
      [label, box, text] = ["Past date", "bg-danger/10", "text-danger"];
      break;
    case "today":
      [label, box, text] = ["Use today", "bg-warning/15", "text-warning"];
      break;
    case "soon":
      [label, box, text] = [daysLeft === 1 ? "1 day left" : `${daysLeft} days left`, "bg-warning/15", "text-warning"];
      break;
    case "this_week":
      [label, box, text] = [`${daysLeft} days left`, "bg-surface-strong", "text-muted"];
      break;
    default:
      return null;
  }
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${box}`}>
      <Text className={`text-[13px] font-semibold ${text}`}>{label}</Text>
    </View>
  );
}
