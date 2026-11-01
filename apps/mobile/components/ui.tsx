import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Scrollable page with the large title used across the app. */
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pb-10 pt-4" contentInsetAdjustmentBehavior="automatic">
        <Text accessibilityRole="header" className="text-[34px] font-bold tracking-tight text-foreground">
          {title}
        </Text>
        {subtitle ? <Text className="mt-1 text-[17px] leading-6 text-muted">{subtitle}</Text> : null}
        <View className="mt-6 gap-4">{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View className="rounded-card bg-surface p-5">{children}</View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{children}</Text>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text className="mt-2 text-[16px] leading-6 text-muted">{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`mt-5 min-h-14 items-center justify-center rounded-full bg-foreground px-6 active:opacity-80 ${disabled ? "opacity-40" : ""}`}
    >
      <Text className="text-[17px] font-semibold text-background">{label}</Text>
    </Pressable>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-full border border-border bg-background px-3.5 py-1.5">
      <Text className="text-[15px] text-foreground">{children}</Text>
    </View>
  );
}
