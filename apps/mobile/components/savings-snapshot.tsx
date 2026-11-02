import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useThemeColors } from "@/lib/theme";
import { useSavings } from "@/lib/use-savings";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

/** Home: this week's savings in one line, opening the Savings screen. Only real numbers. */
export function SavingsSnapshot() {
  const c = useThemeColors();
  const s = useSavings();
  if (!s.summary) return null;
  const week = s.summary.byWeek[s.summary.byWeek.length - 1]!;
  const parts = [
    s.summary.carts.verifiedCents > 0 ? `${money(s.summary.carts.verifiedCents)} verified sale savings` : null,
    s.summary.pantry.rescuedCount > 0 ? `${s.summary.pantry.rescuedCount} item${s.summary.pantry.rescuedCount === 1 ? "" : "s"} used before going off` : null,
    week.shops > 0 ? `${money(week.spentCents)} spent${s.budget !== null ? ` of ${money(s.budget)}` : ""}` : null,
  ].filter(Boolean);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Savings this week" onPress={() => router.push("/savings")} className="flex-row items-center gap-4 rounded-card bg-surface p-5 active:opacity-80">
      <Ionicons name="wallet-outline" size={26} color={c.accent} />
      <View className="flex-1">
        <Text className="text-[17px] font-semibold text-foreground">Savings this week</Text>
        <Text className="text-[15px] leading-5 text-muted">{parts.length > 0 ? parts.join(" · ") : "Log a shop or use up what's in your kitchen to see it here."}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}
