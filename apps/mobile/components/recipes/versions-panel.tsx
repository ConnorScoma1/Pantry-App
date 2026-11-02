import { isCookable, libraryOf } from "@kitchen-pantry/recipe-engine";
import { labelFor, recipeVariants, type Recipe } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Chip, Notice } from "@/components/controls";
import { useRecipeDraft, type DraftVersion } from "@/lib/use-library";
import type { useRecipes } from "@/lib/use-recipes";
import { useThemeColors } from "@/lib/theme";

const VERSIONS: Array<{ code: Exclude<DraftVersion, "full">; label: string }> = [
  { code: "simplified", label: "Simpler" },
  { code: "budget", label: "Budget-friendly" },
  { code: "elevated", label: "Elevated" },
  { code: "traditional", label: "Traditional" },
];

type Made = { recipe: Recipe; changes: string[]; cached: boolean };

function Ready({ made }: { made: Made }) {
  return (
    <View accessibilityLiveRegion="polite" className="mt-3 rounded-2xl bg-accent-soft px-4 py-3">
      <Text className="text-[15px] font-semibold text-foreground">
        {made.cached ? "You already have this version: " : "Your version is ready: "}
        {made.recipe.title}
      </Text>
      {made.changes.map((c) => (
        <Text key={c} className="text-[15px] text-foreground">
          • {c}
        </Text>
      ))}
      <Pressable accessibilityRole="link" onPress={() => router.push(`/recipes/${made.recipe.slug}`)} className="mt-1 min-h-10 justify-center">
        <Text className="text-[15px] font-semibold text-accent underline">Open it · AI draft, not yet reviewed</Text>
      </Pressable>
    </View>
  );
}

/** Other versions of the dish, and AI versions saved just for this household. */
export function VersionsPanel({ recipe, data }: { recipe: Recipe; data: ReturnType<typeof useRecipes> }) {
  const c = useThemeColors();
  const draft = useRecipeDraft(data);
  const [made, setMade] = useState<Made | null>(null);
  const lib = libraryOf(recipe);
  const others = data.recipes.filter((r) => r.id !== recipe.id && r.cuisine === recipe.cuisine && libraryOf(r).dishKey === lib.dishKey && isCookable(r));
  return (
    <View className="mt-8 rounded-card bg-surface p-5">
      <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">Other versions</Text>
      {others.length ? (
        others.map((o) => (
          <Pressable key={o.id} accessibilityRole="link" onPress={() => router.push(`/recipes/${o.slug}`)} className="mt-2 min-h-10 justify-center">
            <Text className="text-[16px] font-semibold text-foreground">
              {o.title} <Text className="font-normal text-muted">· {labelFor(recipeVariants, libraryOf(o).variant)}</Text>
            </Text>
          </Pressable>
        ))
      ) : (
        <Text className="mt-1 text-[15px] text-muted">No other versions in the library yet.</Text>
      )}
      <Text className="mt-3 text-[15px] leading-5 text-foreground">Ask our AI for a version that suits you — checked for food safety, your allergies and your equipment, and saved just for your household.</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {VERSIONS.filter((v) => v.code !== lib.variant && !(v.code === "traditional" && lib.authenticity === "traditional")).map((v) => (
          <Chip
            key={v.code}
            label={draft.busy === v.code ? "Writing…" : v.label}
            selected={false}
            onPress={async () => {
              if (draft.busy) return;
              const r = await draft.request(recipe, v.code);
              if (r.ok) setMade(r.data);
            }}
          />
        ))}
      </View>
      {draft.busy ? <ActivityIndicator className="mt-3" color={c.muted} accessibilityLabel="Writing your version" /> : null}
      {draft.error ? <View className="mt-3"><Notice tone="error">{draft.error}</Notice></View> : null}
      {made ? <Ready made={made} /> : null}
    </View>
  );
}

export function IdeaPanel({ recipe, data }: { recipe: Recipe; data: ReturnType<typeof useRecipes> }) {
  const draft = useRecipeDraft(data);
  const [made, setMade] = useState<Made | null>(null);
  return (
    <View className="mt-6 rounded-card bg-surface p-5">
      <Text className="text-[17px] font-semibold text-foreground">This is a dish idea</Text>
      <Text className="mt-1 text-[15px] leading-5 text-muted">The library doesn&apos;t have a full recipe for it yet, so there&apos;s nothing to cook from here. It still shows up in menus as an idea.</Text>
      <Button
        className="mt-4"
        icon="sparkles-outline"
        label={draft.busy ? "Writing the recipe…" : "Draft the full recipe with AI"}
        disabled={draft.busy !== null}
        onPress={async () => {
          const r = await draft.request(recipe, "full");
          if (r.ok) setMade(r.data);
        }}
      />
      <Text className="mt-2 text-[14px] leading-5 text-muted">Checked automatically for food safety, your allergies and your equipment, and labelled as an AI draft until a person reviews it.</Text>
      {draft.error ? <View className="mt-3"><Notice tone="error">{draft.error}</Notice></View> : null}
      {made ? <Ready made={made} /> : null}
    </View>
  );
}
