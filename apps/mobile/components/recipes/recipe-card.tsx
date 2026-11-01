import Ionicons from "@expo/vector-icons/Ionicons";
import { formatMinutes, recipeArt, recipeArtColors, type RankedRecipe, type RecipeArtKind } from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { useThemeColors } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const ART_ICONS: Record<RecipeArtKind, IconName> = {
  fish: "fish-outline",
  poultry: "restaurant-outline",
  meat: "flame-outline",
  soup: "restaurant-outline",
  pot: "restaurant-outline",
  grain: "restaurant-outline",
  veg: "leaf-outline",
};

/**
 * Typographic tile (cuisine colour + icon). We never show stock or
 * AI-generated "photos" of a dish; licensed images can replace this later.
 */
export function RecipeArt({ recipe, size = "md" }: { recipe: Recipe; size?: "md" | "lg" }) {
  const c = useThemeColors();
  const { hue, kind } = recipeArt(recipe);
  const colors = recipeArtColors(hue, c.isDark);
  const lg = size === "lg";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: colors.background }}
      className={`items-center justify-center overflow-hidden ${lg ? "h-52 w-full rounded-card" : "w-28 self-stretch"}`}
    >
      <View
        style={{ backgroundColor: colors.ring }}
        className={`items-center justify-center rounded-full ${lg ? "size-40" : "size-20"}`}
      >
        <Ionicons name={ART_ICONS[kind]} size={lg ? 56 : 32} color={colors.foreground} />
      </View>
    </View>
  );
}

/** Never invented: real household ratings, otherwise "Editorial". */
export function ratingText(ranked: RankedRecipe): string {
  const { rating, label } = ranked;
  if (rating && rating.count > 0) {
    return `★ ${rating.average.toFixed(1)} (${rating.count} ${rating.count === 1 ? "rating" : "ratings"})`;
  }
  return label === "ai_suggestion" ? "AI suggestion" : label === "your_recipe" ? "Your recipe" : "Editorial";
}

export function SkillDots({ level }: { level: number }) {
  return (
    <View accessible accessibilityLabel={`Skill level ${level} of 5`} className="flex-row items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} className={`size-1.5 rounded-full ${n <= level ? "bg-foreground" : "bg-border"}`} />
      ))}
    </View>
  );
}

export function RecipeCard({ ranked, onToggleFavorite }: { ranked: RankedRecipe; onToggleFavorite: () => void }) {
  const c = useThemeColors();
  const { recipe, coverage, reasons, cautions, favorite } = ranked;
  const have = coverage.owned.length;
  const total = coverage.requiredCount;

  return (
    <View className="flex-row overflow-hidden rounded-card bg-surface">
      <RecipeArt recipe={recipe} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${recipe.title}, ${formatMinutes(recipe.totalMinutes)}`}
        accessibilityHint="Opens the recipe"
        onPress={() => router.push(`/recipes/${recipe.slug}`)}
        className="flex-1 p-4 pr-12 active:opacity-80"
      >
        <Text className="text-[17px] font-semibold leading-snug text-foreground">{recipe.title}</Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
          <View className="flex-row items-center gap-1">
            <Ionicons name="time-outline" size={14} color={c.muted} />
            <Text className="text-[14px] text-muted">{formatMinutes(recipe.totalMinutes)}</Text>
          </View>
          <SkillDots level={recipe.skillLevel} />
          <Text className="text-[14px] text-muted">{ratingText(ranked)}</Text>
        </View>

        {total > 0 && have > 0 ? (
          <View className="mt-3">
            <View className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
              <View className="h-full rounded-full bg-accent" style={{ width: `${Math.round((have / total) * 100)}%` }} />
            </View>
            <Text className="mt-1 text-[13px] text-muted">
              You have {have} of {total} ingredients
            </Text>
          </View>
        ) : null}

        {reasons[0] ? (
          <View className="mt-2.5 flex-row gap-1.5">
            <Ionicons name="sparkles-outline" size={14} color={c.accent} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[14px] leading-5 text-foreground">{reasons[0]}</Text>
          </View>
        ) : null}
        {cautions[0] ? (
          <View className="mt-1.5 flex-row gap-1.5">
            <Ionicons name="warning-outline" size={14} color={c.warning} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[13px] leading-5 text-warning">{cautions[0]}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? `Remove ${recipe.title} from favourites` : `Save ${recipe.title} to favourites`}
        accessibilityState={{ selected: favorite }}
        onPress={onToggleFavorite}
        hitSlop={6}
        className="absolute right-2 top-2 size-10 items-center justify-center rounded-full bg-background"
      >
        <Ionicons name={favorite ? "heart" : "heart-outline"} size={20} color={favorite ? c.danger : c.muted} />
      </Pressable>
    </View>
  );
}
