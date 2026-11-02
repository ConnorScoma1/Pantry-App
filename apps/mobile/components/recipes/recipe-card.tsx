import Ionicons from "@expo/vector-icons/Ionicons";
import {
  creditHref,
  formatMinutes,
  imageLibraryName,
  recipeArt,
  recipeArtColors,
  recipeImageSrc,
  type RankedRecipe,
  type RecipeArtKind,
} from "@kitchen-pantry/recipe-engine";
import type { Recipe } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { useThemeColors } from "@/lib/theme";
import { AuthenticityBadge, StatusBadge, statusLabel } from "./library-badges";

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

/** Typographic tile (cuisine colour + icon): no photo, or the photo failed to load. */
function ArtTile({ recipe, lg }: { recipe: Recipe; lg: boolean }) {
  const c = useThemeColors();
  const { hue, kind } = recipeArt(recipe);
  const colors = recipeArtColors(hue, c.isDark);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: colors.background }}
      className={`items-center justify-center overflow-hidden ${lg ? "h-56 w-full rounded-card" : "w-28 self-stretch"}`}
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

/**
 * Recipe picture: only credited, openly licensed photos (recipe-engine
 * catalog/photos.ts). A photo of a similar dish is labelled "Similar dish".
 */
export function RecipeArt({ recipe, size = "md" }: { recipe: Recipe; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const lg = size === "lg";
  const image = recipe.image;
  if (!image || failed) return <ArtTile recipe={recipe} lg={lg} />;
  return (
    <View className={`overflow-hidden bg-surface-strong ${lg ? "h-56 w-full rounded-card" : "w-28 self-stretch"}`}>
      <Image
        source={{ uri: recipeImageSrc(image, lg ? 1200 : 400) }}
        accessibilityLabel={image.alt}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        onError={() => setFailed(true)}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      {image.representative ? (
        <View className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5">
          <Text className="text-[11px] font-medium text-white">Similar dish</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Similar dish · Photo by Name on Unsplash", linked as the licence asks. */
export function PhotoCredit({ recipe }: { recipe: Recipe }) {
  const image = recipe.image;
  if (!image) return null;
  const library = imageLibraryName(image.license);
  const author = creditHref(image.creditUrl, image.license);
  const source = creditHref(image.sourceUrl, image.license) ?? image.sourceUrl;
  return (
    <Text className="mt-2 px-1 text-[13px] leading-5 text-muted">
      {image.representative ? "Similar dish, not this exact recipe · " : ""}Photo by{" "}
      {author ? (
        <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(author)}>
          {image.creditName}
        </Text>
      ) : (
        image.creditName
      )}
      {library ? (
        <>
          {" "}on{" "}
          <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(source)}>
            {library}
          </Text>
        </>
      ) : null}
    </Text>
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

export function RecipeCard({
  ranked,
  onToggleFavorite,
  onDismiss,
  otherVersions = 0,
}: {
  ranked: RankedRecipe;
  otherVersions?: number;
  onToggleFavorite: () => void;
  /** "Not for us": hides the recipe from suggestions (undoable). */
  onDismiss?: () => void;
}) {
  const c = useThemeColors();
  const { recipe, coverage, reasons, cautions, favorite } = ranked;
  const have = coverage.owned.length;
  const total = coverage.requiredCount;
  const status = statusLabel(recipe);
  const idea = status.tone === "idea";

  return (
    <View className="flex-row overflow-hidden rounded-card bg-surface">
      <RecipeArt recipe={recipe} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={idea ? `${recipe.title}, dish idea` : `${recipe.title}, ${formatMinutes(recipe.totalMinutes)}`}
        accessibilityHint="Opens the recipe"
        onPress={() => router.push(`/recipes/${recipe.slug}`)}
        className="flex-1 p-4 pr-12 active:opacity-80"
      >
        <Text className="text-[17px] font-semibold leading-snug text-foreground">{recipe.title}</Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
          {!idea ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name="time-outline" size={14} color={c.muted} />
              <Text className="text-[14px] text-muted">{formatMinutes(recipe.totalMinutes)}</Text>
            </View>
          ) : null}
          <SkillDots level={recipe.skillLevel} />
          {!idea ? <Text className="text-[14px] text-muted">{ratingText(ranked)}</Text> : null}
          {ranked.inSeason && ranked.inSeason.length > 0 ? (
            <View className="flex-row items-center gap-1" accessibilityLabel={`In season: ${ranked.inSeason.join(", ")}`}>
              <Ionicons name="leaf-outline" size={14} color={c.accent} />
              <Text className="text-[14px] font-medium text-accent">In season</Text>
            </View>
          ) : null}
        </View>

        {status.tone !== "neutral" || otherVersions > 0 || recipe.library?.authenticity ? (
          <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
            {status.tone !== "neutral" ? <StatusBadge recipe={recipe} /> : null}
            <AuthenticityBadge recipe={recipe} />
            {otherVersions > 0 ? <Text className="text-[13px] font-medium text-muted">+{otherVersions} {otherVersions === 1 ? "version" : "versions"}</Text> : null}
          </View>
        ) : null}

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
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Not for us: hide ${recipe.title} from suggestions`}
          onPress={onDismiss}
          hitSlop={6}
          className="absolute bottom-2 right-2 size-10 items-center justify-center rounded-full bg-background"
        >
          <Ionicons name="eye-off-outline" size={18} color={c.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
