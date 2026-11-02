import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs, useSegments } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { useApp } from "@/lib/app-state";
import { useThemeColors } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Same five tabs, in the same order, as the web app on phones. Profile opens from the avatar at the top of each screen. */
const tabs: Array<{ name: string; title: string; icon: IconName; activeIcon: IconName; hidden?: boolean }> = [
  { name: "index", title: "Home", icon: "home-outline", activeIcon: "home" },
  { name: "kitchen", title: "Kitchen", icon: "file-tray-stacked-outline", activeIcon: "file-tray-stacked" },
  { name: "plan", title: "Plan", icon: "calendar-outline", activeIcon: "calendar" },
  { name: "specials", title: "Specials", icon: "pricetag-outline", activeIcon: "pricetag" },
  { name: "grocery", title: "Grocery", icon: "cart-outline", activeIcon: "cart" },
  { name: "profile", title: "Profile", icon: "person-circle-outline", activeIcon: "person-circle", hidden: true },
];

export default function TabsLayout() {
  const c = useThemeColors();
  const { loading, signedIn, profile, access } = useApp();
  const segments = useSegments();

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
  // Trial or subscription over (billing switched on): the paywall, but Profile stays open.
  if (access.enforced && !access.access && segments[segments.length - 1] !== "profile") return <Redirect href="/subscribe" />;

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
            ...(tab.hidden ? { href: null } : {}),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? tab.activeIcon : tab.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
