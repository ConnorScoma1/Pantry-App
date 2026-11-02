import Ionicons from "@expo/vector-icons/Ionicons";
import type { KitchenUpdate } from "@kitchen-pantry/recipe-engine";
import { pantryItemToInput } from "@kitchen-pantry/validation";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Notice } from "@/components/controls";
import { Sheet } from "@/components/kitchen/sheet";
import type { useKitchen } from "@/lib/use-kitchen";
import { useThemeColors } from "@/lib/theme";

const amount = (n: number, unit: string | null) => `${n} ${unit ?? ""}`.trim();

/** After cooking: "Update My Kitchen?" — same rules as the web (recipe-engine/after-cooking.ts). */
export function AfterCookingSheet({ visible, updates, kitchen, onClose }: { visible: boolean; updates: KitchenUpdate[]; kitchen: ReturnType<typeof useKitchen>; onClose: (message: string | null) => void }) {
  const c = useThemeColors();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPicked(Object.fromEntries(updates.map((u) => [u.item.id, u.selected])));
      setError(null);
    }
  }, [visible, updates]);

  async function apply() {
    setBusy(true);
    let changed = 0;
    for (const u of updates) {
      if (!picked[u.item.id]) continue;
      const r =
        u.kind === "reduce" && u.remaining !== null
          ? await kitchen.update(u.item.id, { ...pantryItemToInput(u.item), quantity: u.remaining, estimatedRemainingPct: null })
          : await kitchen.remove(u.item.id, "consumed");
      if (!r.ok) {
        setBusy(false);
        setError(`${u.item.name}: ${r.message}`);
        return;
      }
      changed++;
    }
    setBusy(false);
    onClose(changed ? `Updated ${changed} item${changed === 1 ? "" : "s"} in My Kitchen.` : null);
  }

  return (
    <Sheet
      visible={visible}
      title="Update My Kitchen?"
      description="Here's what this recipe used from your kitchen. Untick anything you didn't use — nothing changes until you tap Update."
      onClose={() => onClose(null)}
      footer={
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button size="lg" label={busy ? "Updating…" : "Update My Kitchen"} disabled={busy} onPress={() => void apply()} />
          <Button variant="ghost" label="Not now" disabled={busy} onPress={() => onClose(null)} />
        </>
      }
    >
      <View className="gap-2">
        {updates.map((u) => {
          const on = Boolean(picked[u.item.id]);
          const what = u.kind === "reduce" ? `${amount(u.item.quantity!, u.item.unit)} → ${amount(u.remaining!, u.item.unit)} left` : u.kind === "use_up" ? "All used up — remove it" : "Used it all? (we can't tell from the amounts)";
          return (
            <Pressable
              key={u.item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${u.item.name}: ${what}`}
              onPress={() => setPicked((p) => ({ ...p, [u.item.id]: !on }))}
              className={`flex-row items-start gap-3 rounded-2xl bg-surface px-4 py-3 ${on ? "" : "opacity-70"}`}
            >
              <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={c.foreground} />
              <View className="flex-1">
                <Text className="font-semibold text-foreground">{u.item.name}</Text>
                <Text className="text-[14px] text-muted">{what}</Text>
                <Text className="text-[13px] text-subtle">Recipe: {u.lines.join("; ")}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
