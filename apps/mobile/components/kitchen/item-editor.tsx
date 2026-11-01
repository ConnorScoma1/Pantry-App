import type { Result } from "@kitchen-pantry/database";
import { guessCategory } from "@kitchen-pantry/inventory-engine";
import { addDays } from "@kitchen-pantry/meal-planner";
import {
  pantryCategories,
  remainingLevels,
  storageLocations,
  type IngredientOption,
  type PantryItem,
  type RemovalReason,
} from "@kitchen-pantry/shared-types";
import {
  emptyPantryItemInput,
  issuesToFieldErrors,
  pantryItemInputSchema,
  type PantryItemInput,
} from "@kitchen-pantry/validation";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, ChipRow, Field, Input, Notice, Segmented } from "@/components/controls";
import type { KitchenRepository } from "@kitchen-pantry/database";
import { Sheet } from "./sheet";

const UNITS = ["each", "lb", "oz", "g", "kg", "cup", "tbsp", "tsp", "ml", "l", "can", "jar", "bag", "box", "bunch", "package"];

function toInput(item: PantryItem): PantryItemInput {
  return {
    ingredientId: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    storageLocation: item.storageLocation,
    purchasedOn: item.purchasedOn,
    useBy: item.useBy,
    openedOn: item.openedOn,
    estimatedRemainingPct: item.estimatedRemainingPct,
    pricePaidCents: item.pricePaidCents,
    isStaple: item.isStaple,
  };
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ItemEditor({
  visible,
  item,
  today,
  repository,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  item: PantryItem | null;
  today: string;
  repository: KitchenRepository;
  onClose: () => void;
  onSave: (input: PantryItemInput) => Promise<Result<unknown>>;
  onRemove: (reason: RemovalReason) => Promise<Result<unknown>>;
}) {
  const [form, setForm] = useState<PantryItemInput>(emptyPantryItemInput());
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [manual, setManual] = useState(false);
  const [suggestions, setSuggestions] = useState<IngredientOption[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const initial = item ? toInput(item) : emptyPantryItemInput();
    setForm(initial);
    setQty(initial.quantity === null ? "" : String(initial.quantity));
    setPrice(initial.pricePaidCents === null ? "" : (initial.pricePaidCents / 100).toFixed(2));
    setErrors({});
    setFormError(null);
    setSuggestions([]);
    setMore(Boolean(item && (item.purchasedOn || item.openedOn || item.pricePaidCents !== null)));
    setManual(item !== null);
  }, [visible, item]);

  const set = (patch: Partial<PantryItemInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setFormError(null);
  };

  async function onName(value: string) {
    const guess = manual ? null : guessCategory(value);
    set({ name: value, ingredientId: null, ...(guess ?? {}) });
    const n = ++seq.current;
    if (value.trim().length < 2) return setSuggestions([]);
    const r = await repository.searchIngredients(value);
    if (n === seq.current && r.ok) setSuggestions(r.data.filter((s) => s.name.toLowerCase() !== value.trim().toLowerCase()));
  }

  async function submit() {
    const quantity = qty.trim() === "" ? null : Number(qty);
    const cents = price.trim() === "" ? null : Math.round(Number(price) * 100);
    const parsed = pantryItemInputSchema.safeParse({
      ...form,
      quantity,
      unit: quantity === null ? null : (form.unit ?? "each"),
      pricePaidCents: cents,
    });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      setFormError("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    const r = await onSave(parsed.data);
    setBusy(false);
    if (r.ok) onClose();
    else {
      setFormError(r.message);
      setErrors(r.fieldErrors ?? {});
    }
  }

  async function remove(reason: RemovalReason) {
    setBusy(true);
    const r = await onRemove(reason);
    setBusy(false);
    if (r.ok) onClose();
    else setFormError(r.message);
  }

  const quick = [
    { label: "Today", value: today },
    { label: "In 3 days", value: addDays(today, 3) },
    { label: "In a week", value: addDays(today, 7) },
    { label: "In 2 weeks", value: addDays(today, 14) },
  ];

  return (
    <Sheet
      visible={visible}
      title={item ? "Edit item" : "Add to your kitchen"}
      onClose={onClose}
      footer={
        <>
          {formError ? <Notice tone="error">{formError}</Notice> : null}
          <Button size="lg" label={busy ? "Saving…" : item ? "Save changes" : "Add item"} onPress={submit} disabled={busy} />
          {item ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" label="Used it up" onPress={() => remove("consumed")} disabled={busy} />
              </View>
              <View className="flex-1">
                <Button variant="danger" label="Threw it out" onPress={() => remove("discarded")} disabled={busy} />
              </View>
            </View>
          ) : null}
        </>
      }
    >
      <View className="gap-5">
        <Field label="What is it?" error={errors.name}>
          <Input
            value={form.name}
            onChangeText={(v) => void onName(v)}
            placeholder="e.g. chicken thighs, spinach"
            autoCorrect={false}
            invalid={Boolean(errors.name)}
            accessibilityLabel="What is it?"
          />
          {suggestions.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap gap-2">
              {suggestions.slice(0, 6).map((s) => (
                <Pressable
                  key={s.name}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${s.name}`}
                  onPress={() => {
                    set({ name: s.name, ingredientId: s.id, category: s.category, storageLocation: s.storageLocation });
                    setSuggestions([]);
                  }}
                  className="min-h-10 justify-center rounded-full bg-surface px-4"
                >
                  <Text className="text-[15px] font-medium text-foreground">{s.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Field>

        <Field label="Where does it live?">
          <Segmented
            value={form.storageLocation}
            onChange={(storageLocation) => {
              setManual(true);
              set({ storageLocation });
            }}
            options={storageLocations.map((l) => ({ value: l.code, label: l.label }))}
          />
        </Field>

        <Field label="Amount (optional)" error={errors.quantity ?? errors.unit}>
          <Input
            value={qty}
            onChangeText={(v) => setQty(v.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="—"
            accessibilityLabel="Amount"
          />
          {qty.trim() !== "" ? (
            <View className="mt-3">
              <ChipRow>
                {UNITS.map((u) => (
                  <Chip key={u} label={u} selected={(form.unit ?? "each") === u} onPress={() => set({ unit: u })} />
                ))}
              </ChipRow>
            </View>
          ) : null}
        </Field>

        <Field label="How much is left? (optional)">
          <ChipRow>
            {remainingLevels.map((l) => (
              <Chip
                key={l.pct}
                label={l.label}
                selected={form.estimatedRemainingPct === l.pct}
                onPress={() => set({ estimatedRemainingPct: form.estimatedRemainingPct === l.pct ? null : l.pct })}
              />
            ))}
          </ChipRow>
        </Field>

        <Field
          label="Use by (optional)"
          error={errors.useBy}
          hint="Go by the date on the pack. We never suggest anything past its use-by date."
        >
          <ChipRow>
            {quick.map((d) => (
              <Chip key={d.label} label={d.label} selected={form.useBy === d.value} onPress={() => set({ useBy: form.useBy === d.value ? null : d.value })} />
            ))}
          </ChipRow>
          {form.useBy ? (
            <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-surface px-4 py-2">
              <Pressable accessibilityRole="button" accessibilityLabel="One day earlier" onPress={() => set({ useBy: addDays(form.useBy!, -1) })} className="size-10 items-center justify-center">
                <Text className="text-2xl text-foreground">−</Text>
              </Pressable>
              <Text className="text-[17px] font-semibold text-foreground">{formatDate(form.useBy)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="One day later" onPress={() => set({ useBy: addDays(form.useBy!, 1) })} className="size-10 items-center justify-center">
                <Text className="text-2xl text-foreground">+</Text>
              </Pressable>
            </View>
          ) : null}
        </Field>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore((v) => !v)}
          className="min-h-12 flex-row items-center justify-between rounded-2xl bg-surface px-4"
        >
          <Text className="text-[15px] font-semibold text-foreground">More details</Text>
          <Text className="text-[15px] text-muted">{more ? "Hide" : "Show"}</Text>
        </Pressable>

        {more ? (
          <View className="gap-5">
            <Field label="Category">
              <ChipRow>
                {pantryCategories.map((cat) => (
                  <Chip
                    key={cat.code}
                    label={cat.label}
                    selected={form.category === cat.code}
                    onPress={() => {
                      setManual(true);
                      set({ category: cat.code });
                    }}
                  />
                ))}
              </ChipRow>
            </Field>
            <Field label="Price paid (optional)" error={errors.pricePaidCents}>
              <Input
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="$0.00"
                accessibilityLabel="Price paid in dollars"
              />
            </Field>
            {form.openedOn ? null : (
              <Button variant="secondary" label="Opened today" onPress={() => set({ openedOn: today })} />
            )}
            {form.openedOn ? (
              <Text className="text-[15px] text-muted">Opened {formatDate(form.openedOn)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
