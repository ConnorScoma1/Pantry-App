import Ionicons from "@expo/vector-icons/Ionicons";
import { cuisines, skillLevels } from "@kitchen-pantry/shared-types";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Chip, Notice, Toggle } from "@/components/controls";
import { PushedPage } from "@/components/recipes/page";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { useProfile } from "@/lib/app-state";
import { useRecipes } from "@/lib/use-recipes";
import { useThemeColors } from "@/lib/theme";

export default function RecipesRoute() {
  return (
    <PushedPage backLabel="Back">
      <RecipesScreen />
    </PushedPage>
  );
}

function RecipesScreen() {
  const c = useThemeColors();
  const profile = useProfile();
  const data = useRecipes();
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState(false);
  const [haveMost, setHaveMost] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [stretch, setStretch] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [lastDismissed, setLastDismissed] = useState<{ id: string; title: string } | null>(null);

  const { recipes, hidden, dismissed } = useMemo(
    () =>
      data.rank({
        query,
        maxMinutes: quick ? 30 : null,
        maxMissing: haveMost ? 3 : null,
        favoritesOnly,
        cuisine,
        includeAboveSkill: stretch,
      }),
    [data, query, quick, haveMost, favoritesOnly, cuisine, stretch],
  );
  const availableCuisines = useMemo(
    () => cuisines.filter((x) => data.recipes.some((r) => r.cuisine === x.code)),
    [data.recipes],
  );
  const levelLabel = skillLevels.find((s) => s.level === profile.skillLevel)?.label;

  return (
    <View className="gap-4">
      <View>
        <Text accessibilityRole="header" className="text-[34px] font-bold tracking-tight text-foreground">
          Recipes
        </Text>
        <Text className="mt-1 text-[17px] leading-6 text-muted">
          Picked for your household — your skills, your kitchen and what needs using up first.
        </Text>
      </View>

      <View className="h-12 flex-row items-center gap-3 rounded-full bg-surface px-5">
        <Ionicons name="search" size={18} color={c.subtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search recipes or ingredients"
          placeholderTextColor={c.subtle}
          accessibilityLabel="Search recipes"
          returnKeyType="search"
          className="h-full flex-1 text-[17px] text-foreground"
        />
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Chip label="30 min or less" selected={quick} onPress={() => setQuick((v) => !v)} />
        <Chip label="Uses what I have" selected={haveMost} onPress={() => setHaveMost((v) => !v)} />
        <Chip label="Favourites" selected={favoritesOnly} onPress={() => setFavoritesOnly((v) => !v)} />
      </View>
      {availableCuisines.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Cuisine"
          className="-mx-4"
          contentContainerClassName="gap-2 px-4"
        >
          {availableCuisines.map((x) => (
            <Chip
              key={x.code}
              label={x.label}
              selected={cuisine === x.code}
              onPress={() => setCuisine((v) => (v === x.code ? null : x.code))}
            />
          ))}
        </ScrollView>
      ) : null}
      {profile.skillLevel < 5 ? (
        <Toggle
          label="Include harder recipes"
          description={`You're set to ${levelLabel}.`}
          value={stretch}
          onChange={setStretch}
        />
      ) : null}

      {data.error ? <Notice tone="error">{data.error}</Notice> : null}

      {data.loading ? (
        <View className="items-center py-10">
          <ActivityIndicator color={c.muted} accessibilityLabel="Loading recipes" />
        </View>
      ) : recipes.length === 0 ? (
        <View className="items-center rounded-card bg-surface px-5 py-10">
          <Text className="text-center text-xl font-bold text-foreground">No recipes match those filters</Text>
          <Text className="mt-1 text-center text-[15px] text-muted">
            Try clearing a filter{profile.skillLevel < 5 ? " or including harder recipes" : ""}.
          </Text>
        </View>
      ) : (
        <>
          {lastDismissed && data.dismissed.has(lastDismissed.id) ? (
            <View accessibilityLiveRegion="polite" className="flex-row items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-2">
              <Text numberOfLines={1} className="flex-1 text-[15px] text-background">
                Hidden {lastDismissed.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void data.undismiss(lastDismissed.id, "recipes");
                  setLastDismissed(null);
                }}
                className="min-h-10 justify-center px-2"
              >
                <Text className="text-[15px] font-semibold text-background">Undo</Text>
              </Pressable>
            </View>
          ) : null}
          <Text accessibilityLiveRegion="polite" className="text-[14px] text-muted">
            {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"} · best match first
          </Text>
          <View className="gap-3">
            {recipes.map((r) => (
              <RecipeCard
                key={r.recipe.id}
                ranked={r}
                onToggleFavorite={() => void data.toggleFavorite(r.recipe.id)}
                onDismiss={() => {
                  setLastDismissed({ id: r.recipe.id, title: r.recipe.title });
                  void data.dismiss(r.recipe.id, "recipes");
                }}
              />
            ))}
          </View>
        </>
      )}

      {!data.loading && dismissed.length > 0 ? (
        <View className="rounded-card bg-surface p-5">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDismissed }}
            onPress={() => setShowDismissed((v) => !v)}
            className="min-h-10 flex-row items-center gap-2.5"
          >
            <Ionicons name="eye-off-outline" size={20} color={c.muted} />
            <Text className="flex-1 text-[16px] font-semibold text-foreground">
              {dismissed.length} {dismissed.length === 1 ? "recipe" : "recipes"} you said &ldquo;Not for us&rdquo; to
            </Text>
            <Ionicons name={showDismissed ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
          </Pressable>
          {showDismissed ? (
            <View className="mt-3 gap-2">
              {dismissed.map((d) => (
                <View key={d.recipe.id} className="flex-row items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3">
                  <Text className="flex-1 text-[15px] font-medium text-foreground">{d.recipe.title}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${d.recipe.title} again`}
                    onPress={() => void data.undismiss(d.recipe.id, "recipes")}
                    className="min-h-9 justify-center rounded-full border border-border px-3"
                  >
                    <Text className="text-[14px] font-semibold text-foreground">Show again</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {!data.loading && hidden.length > 0 ? (
        <View className="rounded-card bg-surface p-5">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showHidden }}
            onPress={() => setShowHidden((v) => !v)}
            className="min-h-10 flex-row items-center gap-2.5"
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={c.muted} />
            <Text className="flex-1 text-[16px] font-semibold text-foreground">
              {hidden.length} {hidden.length === 1 ? "recipe" : "recipes"} hidden for your allergies, diet or kitchen
            </Text>
            <Ionicons name={showHidden ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
          </Pressable>
          {showHidden ? (
            <View className="mt-3 gap-2">
              {hidden.map((h) => (
                <View key={h.recipe.id} className="rounded-2xl bg-background px-4 py-3">
                  <Text className="text-[15px] font-medium text-foreground">{h.recipe.title}</Text>
                  <Text className="text-[15px] text-muted">{h.eligibility.reasons.join(" · ")}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text className="mt-4 text-center text-[13px] leading-5 text-muted">
        Recipes are original Kitchen Pantry Test Kitchen recipes. Ratings appear once households rate them — we never
        invent ratings.
      </Text>
    </View>
  );
}
