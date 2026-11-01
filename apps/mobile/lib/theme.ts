import { darkColors, lightColors, type ColorScheme } from "@kitchen-pantry/ui-tokens";
import { useColorScheme } from "react-native";

/**
 * Raw token colours for places NativeWind classes can't reach
 * (navigation bars, icon tints). Everything else uses className.
 */
export function useThemeColors(): ColorScheme & { isDark: boolean } {
  const isDark = useColorScheme() === "dark";
  return { ...(isDark ? darkColors : lightColors), isDark };
}
