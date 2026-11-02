import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { cssInterop } from "nativewind";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppProvider } from "@/lib/app-state";
import { usePushNavigation } from "@/lib/push";
import { useThemeColors } from "@/lib/theme";

// Let NativeWind className styles reach the third-party SafeAreaView.
cssInterop(SafeAreaView, { className: "style" });

export default function RootLayout() {
  const colors = useThemeColors();
  usePushNavigation();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style={colors.isDark ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" options={{ gestureEnabled: false }} />
          <Stack.Screen name="auth/callback" options={{ gestureEnabled: false }} />
          <Stack.Screen name="subscribe" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="household" />
          <Stack.Screen name="cart" />
          <Stack.Screen name="savings" />
          <Stack.Screen name="menus" />
          <Stack.Screen name="compare" />
          <Stack.Screen name="scan" />
          <Stack.Screen name="receipt" />
          <Stack.Screen name="use-it-up" />
          <Stack.Screen name="history" />
          <Stack.Screen name="invite/[token]" />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
