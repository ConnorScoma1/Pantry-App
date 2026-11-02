import Ionicons from "@expo/vector-icons/Ionicons";
import { worldCuisines } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Chip, Notice } from "@/components/controls";
import { RecipeCard } from "@/components/recipes/recipe-card";
import type { useLibrary } from "@/lib/use-library";
import type { useRecipes } from "@/lib/use-recipes";
import { useThemeColors } from "@/lib/theme";

const EXAMPLES = ["Authentic Thai dinner for four under $50", "Five cheap dinners using chicken thighs", "Build a seafood tower for six people", "Something completely different"];

/** "Explore the library" on the phone: natural-language search and a few filters over every recipe. */
export function LibraryExplorer({ data, library }: { data: ReturnType<typeof useRecipes>; library: ReturnType<typeof useLibrary> }) {
  const c = useThemeColors();
  const counts = library.facets?.cuisines ?? {};
  const cuisines = worldCuisines.filter((w) => (counts[w.code] ?? 0) > 0).sort((a, b) => (counts[b.code] ?? 0) - (counts[a.code] ?? 0));
  const p = library.parsed;
  const menuParams = p?.wantsMenu ? new URLSearchParams({ ...(p.menuTemplate ? { template: p.menuTemplate } : {}), ...(p.servings ? { guests: String(p.servings) } : {}), ...(p.budgetCents ? { budget: String(p.budgetCents) } : {}) }).toString() : null;

  return (
    <View className="gap-4">
      <View className="h-12 flex-row items-center gap-3 rounded-full bg-surface px-5">
        <Ionicons name="search" size={18} color={c.subtle} />
        <TextInput
          value={library.text}
          onChangeText={library.setText}
          placeholder="Try “Thai dinner for four under $50”"
          placeholderTextColor={c.subtle}
          accessibilityLabel="Search the recipe library"
          returnKeyType="search"
          className="h-full flex-1 text-[17px] text-foreground"
        />
      </View>
      {!library.text ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Example searches" className="-mx-4" contentContainerClassName="gap-2 px-4">
          {EXAMPLES.map((e) => (
            <Pressable key={e} accessibilityRole="button" onPress={() => library.setText(e)} className="min-h-9 justify-center rounded-full bg-surface px-3">
              <Text className="text-[14px] text-muted">{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : p && p.understood.length > 0 ? (
        <View accessibilityLiveRegion="polite" className="flex-row flex-wrap items-center gap-1.5">
          <Text className="text-[14px] text-muted">Looking for</Text>
          {p.understood.map((u) => (
            <View key={u} className="rounded-full bg-accent-soft px-2.5 py-0.5">
              <Text className="text-[14px] font-medium text-foreground">{u}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {menuParams !== null ? (
        <View className="gap-3 rounded-card bg-surface p-4">
          <Text className="text-[16px] leading-6 text-foreground">
            <Text className="font-semibold">Want the whole meal? </Text>We can put the courses together{p?.servings ? ` for ${p.servings}` : ""}.
          </Text>
          <Button label="Build the menu" icon="restaurant-outline" onPress={() => router.push(`/menus?${menuParams}`)} />
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Cuisine" className="-mx-4" contentContainerClassName="gap-2 px-4">
        <Chip label="Dish ideas" selected={library.includeIdeas} onPress={() => library.setIncludeIdeas(!library.includeIdeas)} />
        {cuisines.map((x) => (
          <Chip key={x.code} label={`${x.label} (${counts[x.code]})`} selected={library.cuisine === x.code} onPress={() => library.setCuisine(library.cuisine === x.code ? "" : x.code)} />
        ))}
      </ScrollView>

      {library.error ? <Notice tone="error">{library.error}</Notice> : null}
      <Text accessibilityLiveRegion="polite" className="text-[14px] text-muted">
        {library.loading && library.results.length === 0 ? "Searching…" : `${library.total} ${library.total === 1 ? "match" : "matches"} · allergens your household avoids are never shown`}
      </Text>
      {library.loading && library.results.length === 0 ? (
        <ActivityIndicator color={c.muted} accessibilityLabel="Searching" />
      ) : library.results.length === 0 ? (
        <View className="items-center rounded-card bg-surface px-5 py-10">
          <Text className="text-center text-xl font-bold text-foreground">Nothing matches that yet</Text>
          <Text className="mt-1 text-center text-[15px] text-muted">Try fewer words{library.includeIdeas ? "" : ", or include dish ideas"}.</Text>
        </View>
      ) : (
        <View className="gap-3">
          {library.results.map((r) => (
            <RecipeCard key={r.ranked.recipe.id} ranked={r.ranked} otherVersions={r.otherVersions.length} onToggleFavorite={() => void data.toggleFavorite(r.ranked.recipe.id)} />
          ))}
        </View>
      )}
      {library.canLoadMore ? <Button label={library.loading ? "Loading…" : "Show more"} variant="secondary" disabled={library.loading} onPress={() => void library.loadMore()} /> : null}
      {library.facets ? (
        <Text className="text-center text-[13px] leading-5 text-muted">
          The library has {library.facets.complete} complete recipes and {library.facets.ideas} dish ideas. Dish ideas don&apos;t have full instructions yet.
        </Text>
      ) : null}
    </View>
  );
}
