import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { useApp } from "@/lib/app-state";
import { useThemeColors } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Same five destinations, in the same order, as the web app. */
const tabs: Array<{ name: string; title: string; icon: IconName; activeIcon: IconName }> = [
  { name: "index", title: "Home", icon: "home-outline", activeIcon: "home" },
  { name: "kitchen", title: "Kitchen", icon: "file-tray-stacked-outline", activeIcon: "file-tray-stacked" },
  { name: "plan", title: "Plan", icon: "calendar-outline", activeIcon: "calendar" },
  { name: "grocery", title: "Grocery", icon: "cart-outline", activeIcon: "cart" },
  { name: "profile", title: "Profile", icon: "person-circle-outline", activeIcon: "person-circle" },
];

export default function TabsLayout() {
  const c = useThemeColors();
  const { loading, signedIn, profile } = useApp();

  // Gate the app: sign in (Supabase mode) → finish onboarding → tabs.
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={c.muted} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!signedIn) return <Redirect href="/sign-in" />;
  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.foreground,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.background, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? tab.activeIcon : tab.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
