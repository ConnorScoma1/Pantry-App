import Ionicons from "@expo/vector-icons/Ionicons";
import { filterItems, groupByCategory, summarizeKitchen } from "@kitchen-pantry/inventory-engine";
import { storageLocations, type PantryItem, type StorageLocation } from "@kitchen-pantry/shared-types";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Notice } from "@/components/controls";
import { router } from "expo-router";
import { ItemEditor } from "@/components/kitchen/item-editor";
import { ItemRow } from "@/components/kitchen/item-row";
import { StaplesSheet } from "@/components/kitchen/staples-sheet";
import { Card, Eyebrow, Screen } from "@/components/ui";
import { useKitchen } from "@/lib/use-kitchen";
import { useThemeColors } from "@/lib/theme";

type Editing = { item: PantryItem | null } | null;

export default function KitchenScreen() {
  const c = useThemeColors();
  const kitchen = useKitchen();
  const { items, loading, error, today } = kitchen;
  const [editing, setEditing] = useState<Editing>(null);
  const [staples, setStaples] = useState(false);
  const [location, setLocation] = useState<StorageLocation | "all">("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => summarizeKitchen(items, today), [items, today]);
  const groups = useMemo(() => groupByCategory(filterItems(items, { query, location }), today), [items, query, location, today]);
  const open = (item: PantryItem | null) => setEditing({ item });

  return (
    <Screen title="My Kitchen" subtitle="Tick what you already have. It comes straight off your grocery list — and stays off.">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <Card>
        <View className="flex-row gap-8">
          <View>
            <Text className="text-[40px] font-bold leading-[44px] text-foreground">{loading ? "–" : summary.total}</Text>
            <Text className="text-[15px] text-muted">{summary.total === 1 ? "item" : "items"} in your kitchen</Text>
          </View>
          {summary.useSoon.length > 0 ? (
            <View>
              <Text className="text-[40px] font-bold leading-[44px] text-warning">{summary.useSoon.length}</Text>
              <Text className="text-[15px] text-muted">to use soon</Text>
            </View>
          ) : null}
        </View>
        <View className="mt-5 flex-row gap-2">
          <View className="flex-1">
            <Button icon="add" label="Add an item" onPress={() => open(null)} />
          </View>
          <View className="flex-1">
            <Button variant="secondary" icon="checkbox-outline" label="Mark staples" onPress={() => setStaples(true)} />
          </View>
        </View>
        <View className="mt-2 flex-row gap-2">
          <View className="flex-1">
            <Button variant="secondary" icon="barcode-outline" label="Barcode" onPress={() => router.push("/scan")} />
          </View>
          <View className="flex-1">
            <Button variant="secondary" icon="receipt-outline" label="Receipt" onPress={() => router.push("/receipt")} />
          </View>
        </View>
      </Card>

      {summary.useSoon.length > 0 ? (
        <Card>
          <Eyebrow>Use it before you lose it</Eyebrow>
          <View className="-mx-4 mt-2">
            {summary.useSoon.slice(0, 4).map((v, i, arr) => (
              <ItemRow key={v.item.id} view={v} last={i === arr.length - 1} onPress={() => open(v.item)} />
            ))}
          </View>
        </Card>
      ) : null}

      {summary.pastDate.length > 0 ? (
        <View className="rounded-card border border-danger/20 bg-danger/5 p-5">
          <Text className="text-[13px] font-semibold uppercase tracking-widest text-danger">Past its use-by date</Text>
          <Text className="mt-1.5 text-[15px] text-muted">We won&apos;t plan meals around these. Tap one to remove it.</Text>
          <View className="-mx-4 mt-2">
            {summary.pastDate.map((v, i, arr) => (
              <ItemRow key={v.item.id} view={v} last={i === arr.length - 1} onPress={() => open(v.item)} />
            ))}
          </View>
        </View>
      ) : null}

      {items.length > 0 ? (
        <View className="gap-3">
          <View className="min-h-12 flex-row items-center gap-3 rounded-full bg-surface px-5">
            <Ionicons name="search" size={18} color={c.subtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your kitchen"
              placeholderTextColor={c.subtle}
              accessibilityLabel="Search your kitchen"
              className="h-12 flex-1 text-[17px] text-foreground"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {[{ code: "all" as const, label: "All" }, ...storageLocations].map((loc) => {
              const active = location === loc.code;
              const count = loc.code === "all" ? summary.total : summary.byLocation[loc.code];
              return (
                <Pressable
                  key={loc.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLocation(loc.code)}
                  className={`min-h-11 justify-center rounded-full bg-background px-4 ${active ? "border-2 border-foreground" : "border border-border"}`}
                >
                  <Text className="text-[15px] font-medium text-foreground">
                    {loc.label} <Text className="text-muted">{count}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={c.muted} accessibilityLabel="Loading your kitchen" />
      ) : items.length === 0 ? (
        <Card>
          <View className="items-center py-6">
            <Ionicons name="file-tray-stacked-outline" size={32} color={c.muted} />
            <Text className="mt-3 text-2xl font-bold text-foreground">Your kitchen is empty</Text>
            <Text className="mt-2 text-center text-[16px] leading-6 text-muted">
              Start with the staples you always have — they&apos;ll stay off every grocery list.
            </Text>
            <View className="mt-5">
              <Button icon="checkbox-outline" label="Mark staples" onPress={() => setStaples(true)} />
            </View>
          </View>
        </Card>
      ) : groups.length === 0 ? (
        <Text className="py-8 text-center text-[16px] text-muted">Nothing matches that search.</Text>
      ) : (
        groups.map((g) => (
          <View key={g.category}>
            <Text className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-widest text-muted">
              {g.label} · {g.items.length}
            </Text>
            <View className="overflow-hidden rounded-card bg-surface">
              {g.items.map((v, i) => (
                <ItemRow
                  key={v.item.id}
                  view={v}
                  last={i === g.items.length - 1}
                  showLocation={location === "all"}
                  onPress={() => open(v.item)}
                />
              ))}
            </View>
          </View>
        ))
      )}

      <ItemEditor
        visible={editing !== null}
        item={editing?.item ?? null}
        today={today}
        repository={kitchen.repository}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          const current = editing?.item;
          const r = current ? await kitchen.update(current.id, input) : await kitchen.add(input);
          if (r.ok) setNotice(current ? `Updated ${r.data.name}.` : `Added ${r.data.name}.`);
          return r;
        }}
        onRemove={async (reason) => {
          const current = editing?.item;
          if (!current) return { ok: true, data: null };
          const r = await kitchen.remove(current.id, reason);
          if (r.ok) setNotice(`Removed ${current.name}.`);
          return r;
        }}
      />

      <StaplesSheet
        visible={staples}
        items={items}
        onClose={() => setStaples(false)}
        onApply={async (toAdd, toRemove) => {
          if (toAdd.length > 0) {
            const r = await kitchen.addStaples(toAdd);
            if (!r.ok) return r;
          }
          for (const item of toRemove) {
            const r = await kitchen.remove(item.id, "consumed");
            if (!r.ok) return r;
          }
          setNotice(`Saved ${toAdd.length + toRemove.length} change${toAdd.length + toRemove.length === 1 ? "" : "s"}.`);
          return { ok: true, data: null };
        }}
      />
    </Screen>
  );
}
