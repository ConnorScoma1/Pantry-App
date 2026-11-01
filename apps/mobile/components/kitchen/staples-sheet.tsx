import Ionicons from "@expo/vector-icons/Ionicons";
import type { Result } from "@kitchen-pantry/database";
import { stapleChecklist } from "@kitchen-pantry/inventory-engine";
import { pantryCategories, type PantryItem } from "@kitchen-pantry/shared-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Notice } from "@/components/controls";
import { useThemeColors } from "@/lib/theme";
import { Sheet } from "./sheet";

/** "Tick everything you already have" — same rules as the web checklist. */
export function StaplesSheet({
  visible,
  items,
  onClose,
  onApply,
}: {
  visible: boolean;
  items: PantryItem[];
  onClose: () => void;
  onApply: (toAdd: string[], toRemove: PantryItem[]) => Promise<Result<unknown>>;
}) {
  const c = useThemeColors();
  const staples = useMemo(() => stapleChecklist(), []);
  const owned = useMemo(() => new Map(items.map((i) => [i.name.toLowerCase(), i])), [items]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setChecked(new Set(staples.filter((s) => owned.has(s.name.toLowerCase())).map((s) => s.name)));
    setError(null);
  }, [visible, staples, owned]);

  const toAdd = staples.filter((s) => checked.has(s.name) && !owned.has(s.name.toLowerCase())).map((s) => s.name);
  const toRemove = staples
    .filter((s) => !checked.has(s.name))
    .map((s) => owned.get(s.name.toLowerCase()))
    .filter((i): i is PantryItem => Boolean(i && i.isStaple));
  const changes = toAdd.length + toRemove.length;

  const groups = pantryCategories
    .map((cat) => ({ ...cat, staples: staples.filter((s) => s.category === cat.code) }))
    .filter((g) => g.staples.length > 0);

  async function apply() {
    setBusy(true);
    const r = await onApply(toAdd, toRemove);
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.message);
  }

  return (
    <Sheet
      visible={visible}
      title="What do you already have?"
      description="Tick your staples. They come straight off future grocery lists."
      onClose={onClose}
      footer={
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            size="lg"
            label={busy ? "Saving…" : changes === 0 ? "No changes" : `Save ${changes} change${changes === 1 ? "" : "s"}`}
            onPress={apply}
            disabled={busy || changes === 0}
          />
        </>
      }
    >
      <View className="gap-5">
        {groups.map((g) => (
          <View key={g.code}>
            <Text className="mb-2 text-[13px] font-semibold uppercase tracking-widest text-muted">{g.label}</Text>
            <View className="overflow-hidden rounded-2xl bg-surface">
              {g.staples.map((s, i) => {
                const on = checked.has(s.name);
                return (
                  <Pressable
                    key={s.name}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={s.name}
                    onPress={() =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.name)) next.delete(s.name);
                        else next.add(s.name);
                        return next;
                      })
                    }
                    className={`min-h-[52px] flex-row items-center gap-3 px-4 ${i < g.staples.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <View
                      className={`size-7 items-center justify-center rounded-full border-2 ${on ? "border-accent bg-accent" : "border-border bg-background"}`}
                    >
                      {on ? <Ionicons name="checkmark" size={16} color={c["accent-foreground"]} /> : null}
                    </View>
                    <Text className={`text-[17px] text-foreground ${on ? "font-medium" : ""}`}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
