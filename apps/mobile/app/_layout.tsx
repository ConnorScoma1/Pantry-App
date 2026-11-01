import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { cssInterop } from "nativewind";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppProvider } from "@/lib/app-state";
import { useThemeColors } from "@/lib/theme";

// Let NativeWind className styles reach the third-party SafeAreaView.
cssInterop(SafeAreaView, { className: "style" });

export default function RootLayout() {
  const colors = useThemeColors();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style={colors.isDark ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
