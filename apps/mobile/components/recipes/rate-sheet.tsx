import Ionicons from "@expo/vector-icons/Ionicons";
import type { Result } from "@kitchen-pantry/database";
import type { Recipe, RecipeRating } from "@kitchen-pantry/shared-types";
import { recipeRatingInputSchema } from "@kitchen-pantry/validation";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, ChipRow, Field, Input, Segmented } from "@/components/controls";
import { Sheet } from "@/components/kitchen/sheet";
import { useThemeColors } from "@/lib/theme";

function Stars({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const c = useThemeColors();
  return (
    <View>
      <Text className="mb-1 text-[15px] font-semibold text-foreground">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== null && n <= value;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
              accessibilityState={{ checked: value === n }}
              onPress={() => onChange(value === n ? null : n)}
              className="size-11 items-center justify-center rounded-full"
            >
              <Ionicons name={filled ? "star" : "star-outline"} size={28} color={filled ? c.warning : c.border} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const DIFFICULTY = [
  { value: "1", label: "Easy" },
  { value: "3", label: "As expected" },
  { value: "5", label: "Hard" },
] as const;

/** "How was it?" — the same real feedback form as the web app. */
export function RateSheet({
  visible,
  recipe,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  recipe: Recipe;
  onClose: () => void;
  onSubmit: (input: unknown) => Promise<Result<RecipeRating>>;
}) {
  const [overall, setOverall] = useState<number | null>(null);
  const [flavor, setFlavor] = useState<number | null>(null);
  const [family, setFamily] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<"1" | "3" | "5" | "">("");
  const [again, setAgain] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setOverall(null);
    setFlavor(null);
    setFamily(null);
    setDifficulty("");
    setAgain(null);
    setMinutes("");
    setNotes("");
    setError(null);
  }, [visible]);

  async function submit() {
    const parsed = recipeRatingInputSchema.safeParse({
      recipeId: recipe.id,
      overall,
      flavor,
      difficulty: difficulty ? Number(difficulty) : null,
      wouldCookAgain: again,
      actualMinutes: minutes ? Number(minutes) : null,
      familyApproval: family,
      notes: notes.trim() || null,
    });
    if (!parsed.success) {
      setError(overall === null ? "Give it an overall rating first." : "Please check your answers.");
      return;
    }
    setBusy(true);
    const result = await onSubmit(parsed.data);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.message);
  }

  return (
    <Sheet
      visible={visible}
      title="How was it?"
      description={recipe.title}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <Text accessibilityRole="alert" className="text-center text-[15px] font-medium text-danger">
              {error}
            </Text>
          ) : null}
          <Button size="lg" label={busy ? "Saving…" : "Save rating"} onPress={submit} disabled={busy} />
        </>
      }
    >
      <View className="gap-5">
        <Stars
          label="Overall"
          value={overall}
          onChange={(v) => {
            setOverall(v);
            setError(null);
          }}
        />
        <View>
          <Text className="mb-1.5 text-[15px] font-semibold text-foreground">Would you cook it again?</Text>
          <ChipRow>
            <Chip label="Yes" selected={again === true} onPress={() => setAgain(again === true ? null : true)} />
            <Chip label="No" selected={again === false} onPress={() => setAgain(again === false ? null : false)} />
          </ChipRow>
        </View>
        <Stars label="Flavour" value={flavor} onChange={setFlavor} />
        <Stars label="Family approval" value={family} onChange={setFamily} />
        <View>
          <Text className="mb-1.5 text-[15px] font-semibold text-foreground">Difficulty</Text>
          <Segmented<"1" | "3" | "5" | ""> options={DIFFICULTY} value={difficulty} onChange={setDifficulty} />
        </View>
        <Field label="How long did it actually take? (minutes)">
          <Input
            keyboardType="number-pad"
            value={minutes}
            onChangeText={(t: string) => setMinutes(t.replace(/\D/g, "").slice(0, 4))}
            placeholder={String(recipe.totalMinutes)}
            accessibilityLabel="Actual minutes"
          />
        </Field>
        <Field label="Notes for next time (optional)">
          <Input
            multiline
            value={notes}
            onChangeText={(t: string) => setNotes(t.slice(0, 2000))}
            placeholder="e.g. halve the chili flakes"
            className="min-h-24 py-3"
            textAlignVertical="top"
            accessibilityLabel="Notes for next time"
          />
        </Field>
      </View>
    </Sheet>
  );
}
