import Ionicons from "@expo/vector-icons/Ionicons";
import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { formatMinutes } from "@kitchen-pantry/recipe-engine";
import { surpriseKinds } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, ChipRow } from "@/components/controls";
import { Body, Card, CardTitle, Eyebrow } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import type { useRecipes } from "@/lib/use-recipes";
import { useSurprise } from "@/lib/use-surprise";
import { RecipeArt } from "./recipe-card";

/** Surprise Me (spec 02 §5) — three fresh ideas with a plain "why". */
export function SurpriseMe({ data }: { data: ReturnType<typeof useRecipes> }) {
  const c = useThemeColors();
  const s = useSurprise(data);
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <Ionicons name="dice-outline" size={18} color={c.accent} />
        <Eyebrow>Surprise me</Eyebrow>
      </View>
      <CardTitle>Fresh ideas, explained</CardTitle>
      <View className="mt-3">
        <ChipRow>
          {surpriseKinds.map((k) => (
            <Chip key={k.code} label={k.short} selected={s.kind === k.code} onPress={() => !s.busy && void s.run(k.code)} />
          ))}
        </ChipRow>
      </View>
      {s.busy ? <Body>Finding ideas…</Body> : null}
      {s.error ? <Text className="mt-2 text-[14px] text-danger">{s.error}</Text> : null}
      {s.result && !s.busy ? (
        <View className="mt-3 gap-3">
          {s.result.picks.map((p) => (
            <Pressable
              key={p.ranked.recipe.id}
              accessibilityRole="link"
              onPress={() => router.push(`/recipes/${p.ranked.recipe.slug}`)}
              className="flex-row gap-3 overflow-hidden rounded-2xl bg-background active:opacity-80"
            >
              <View className="w-24">
                <RecipeArt recipe={p.ranked.recipe} />
              </View>
              <View className="flex-1 py-3 pr-3">
                <Text className="text-[16px] font-semibold text-foreground">{p.ranked.recipe.title}</Text>
                <Text className="text-[13px] text-muted">
                  {formatMinutes(p.ranked.recipe.totalMinutes)} · skill {p.ranked.recipe.skillLevel}
                  {p.costPerServingCents !== null ? ` · about ${formatCents(p.costPerServingCents)}/serving` : ""}
                </Text>
                <Text className="mt-1 text-[14px] leading-5 text-foreground">{p.why}</Text>
              </View>
            </Pressable>
          ))}
          {s.result.note ? <Text className="text-[14px] text-muted">{s.result.note}</Text> : null}
          {s.kind && (s.result.picks.length > 0 || (s.kind === "under_5" && !s.result.needs)) ? (
            <Button variant="secondary" icon="refresh" label={s.result.picks.length > 0 ? "Show me others" : "Check more recipes"} onPress={() => void s.run(s.kind!, true)} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
