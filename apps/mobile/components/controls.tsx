import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { useThemeColors } from "@/lib/theme";

/**
 * Mobile counterparts of the web controls (apps/web/src/components/ui).
 * Same names, same look, 44pt+ touch targets and screen-reader roles.
 */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
  size = "md",
  className = "",
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  size?: "md" | "lg";
  className?: string;
}) {
  const c = useThemeColors();
  const styles: Record<ButtonVariant, [string, string, string]> = {
    primary: ["bg-foreground", "text-background", c.background],
    secondary: ["border border-border bg-background", "text-foreground", c.foreground],
    danger: ["border border-danger/30 bg-background", "text-danger", c.danger],
    ghost: ["bg-transparent", "text-foreground", c.foreground],
  };
  const [box, text, iconColor] = styles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center justify-center gap-2 rounded-full px-5 active:opacity-80 ${size === "lg" ? "min-h-14" : "min-h-12"} ${box} ${disabled ? "opacity-40" : ""} ${className}`}
    >
      {icon ? <Ionicons name={icon} size={20} color={iconColor} /> : null}
      <Text className={`font-semibold ${size === "lg" ? "text-[17px]" : "text-[15px]"} ${text}`}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-11 max-w-full flex-row items-center gap-1.5 rounded-full border bg-background px-4 py-2 ${selected ? "border-2 border-foreground" : "border-border"}`}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={c.foreground} /> : null}
      {/* Long labels wrap on narrow phones instead of running off the screen. */}
      <Text className="shrink text-[16px] font-medium text-foreground">{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2.5">{children}</View>;
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 20,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const c = useThemeColors();
  const round = "size-11 items-center justify-center rounded-full border border-border bg-background";
  return (
    <View className="flex-row items-center justify-between gap-4" accessible={false}>
      <Text className="flex-1 text-[17px] text-foreground">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          className={`${round} ${value <= min ? "opacity-35" : ""}`}
        >
          <Ionicons name="remove" size={20} color={c.foreground} />
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${label}: ${value}`}
          className="min-w-8 text-center text-2xl font-bold text-foreground"
        >
          {value}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          className={`${round} ${value >= max ? "opacity-35" : ""}`}
        >
          <Ionicons name="add" size={20} color={c.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const wrap = options.length > 3;
  return (
    <View accessibilityRole="radiogroup" className={`flex-row rounded-[22px] bg-surface-strong p-1 ${wrap ? "flex-wrap" : ""}`}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            onPress={() => onChange(o.value)}
            className={`min-h-10 items-center justify-center rounded-full px-2 ${wrap ? "w-1/2" : "flex-1"} ${checked ? "bg-background shadow-sm" : ""}`}
          >
            <Text numberOfLines={1} className={`text-[15px] ${checked ? "font-semibold text-foreground" : "font-medium text-muted"}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceCard({
  title,
  description,
  selected,
  onPress,
  leading,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`flex-row items-start gap-3 rounded-control bg-background p-4 ${selected ? "border-2 border-foreground" : "border border-border"}`}
    >
      {leading}
      <View className="flex-1">
        <Text className="text-[17px] font-semibold text-foreground">{title}</Text>
        {description ? <Text className="mt-0.5 text-[15px] leading-5 text-muted">{description}</Text> : null}
      </View>
      <View
        className={`mt-0.5 size-6 items-center justify-center rounded-full border-2 ${selected ? "border-foreground bg-foreground" : "border-border"}`}
      >
        {selected ? <Ionicons name="checkmark" size={14} color={c.background} /> : null}
      </View>
    </Pressable>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const c = useThemeColors();
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text className="text-[17px] font-medium text-foreground">{label}</Text>
        {description ? <Text className="text-[15px] text-muted">{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.accent, false: c["surface-strong"] }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View>
      <Text className="mb-1.5 text-[15px] font-semibold text-foreground">{label}</Text>
      {children}
      {error ? (
        <Text accessibilityRole="alert" className="mt-1.5 text-[15px] font-medium text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1.5 text-[14px] text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input({ invalid, className = "", ...props }: TextInputProps & { invalid?: boolean }) {
  const c = useThemeColors();
  return (
    <TextInput
      placeholderTextColor={c.subtle}
      className={`min-h-[52px] rounded-control border bg-background px-4 text-[17px] text-foreground ${invalid ? "border-danger" : "border-border"} ${className}`}
      {...props}
    />
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <View className="rounded-card bg-surface p-5">
      <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{title}</Text>
      {description ? <Text className="mt-1.5 text-[15px] leading-5 text-muted">{description}</Text> : null}
      <View className="mt-4">{children}</View>
    </View>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "warning"; children: ReactNode }) {
  const box = tone === "error" ? "bg-danger/10" : tone === "warning" ? "bg-warning/10" : "bg-accent-soft";
  const text = tone === "error" ? "text-danger" : "text-foreground";
  return (
    <View accessibilityRole={tone === "error" ? "alert" : undefined} className={`rounded-2xl px-4 py-3 ${box}`}>
      <Text className={`text-[15px] leading-5 ${text}`}>{children}</Text>
    </View>
  );
}
