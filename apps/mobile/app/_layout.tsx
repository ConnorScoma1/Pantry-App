import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useThemeColors } from "@/lib/theme";

export default function RootLayout() {
  const colors = useThemeColors();
  return (
    <SafeAreaProvider>
      <StatusBar style={colors.isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
