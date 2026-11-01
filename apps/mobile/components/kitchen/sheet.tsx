import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "@/lib/theme";

/** Full-height modal sheet with a title bar, scrolling body and pinned footer. */
export function Sheet({
  visible,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const c = useThemeColors();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <SafeAreaView className="flex-1 bg-background" edges={Platform.OS === "ios" ? ["bottom"] : ["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <View className="flex-row items-start justify-between gap-4 px-5 pb-3 pt-5">
            <View className="flex-1">
              <Text accessibilityRole="header" className="text-2xl font-bold tracking-tight text-foreground">
                {title}
              </Text>
              {description ? <Text className="mt-1 text-[15px] text-muted">{description}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="size-10 items-center justify-center rounded-full bg-surface"
            >
              <Ionicons name="close" size={20} color={c.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="px-5 pb-6" keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View className="gap-2 border-t border-border px-5 pb-2 pt-3">{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
