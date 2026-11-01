import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/lib/app-state";
import { useThemeColors } from "@/lib/theme";

/**
 * Pushed (non-tab) page with a back button. Waits for the profile so
 * recipe screens opened from a link never render before onboarding.
 */
export function PushedPage({ backLabel, children }: { backLabel: string; children: ReactNode }) {
  const c = useThemeColors();
  const { loading, signedIn, profile } = useApp();
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={c.muted} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!signedIn || !profile) return <Redirect href="/" />;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="px-2 pb-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          className="min-h-11 flex-row items-center gap-1 self-start rounded-full px-2"
        >
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
          <Text className="text-[16px] font-semibold text-foreground">{backLabel}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="px-4 pb-12 pt-1" keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
