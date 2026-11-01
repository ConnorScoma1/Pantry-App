import Ionicons from "@expo/vector-icons/Ionicons";
import {
  formatIngredientLine,
  formatMinutes,
  formatTemperature,
  groupByComponent,
  rankRecipe,
} from "@kitchen-pantry/recipe-engine";
import { allergens, cuisines, equipment, labelFor, skillLevels } from "@kitchen-pantry/shared-types";
import { router, useLocalSearchParams } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { Button, Notice } from "@/components/controls";
import { PushedPage } from "@/components/recipes/page";
import { RateSheet } from "@/components/recipes/rate-sheet";
import { RecipeArt, ratingText, SkillDots } from "@/components/recipes/recipe-card";
import { useRecipes } from "@/lib/use-recipes";
import { useThemeColors } from "@/lib/theme";

export default function RecipeRoute() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  return (
    <PushedPage backLabel="Recipes">
      <RecipeDetail slug={slug ?? ""} />
    </PushedPage>
  );
}

function StepChip({ icon, tone = "plain", children }: { icon: ComponentProps<typeof Ionicons>["name"]; tone?: "plain" | "safe"; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${tone === "safe" ? "bg-accent-soft" : "bg-surface"}`}>
      <Ionicons name={icon} size={14} color={tone === "safe" ? c.accent : c.muted} />
      <Text className={`text-[14px] text-foreground ${tone === "safe" ? "font-semibold" : ""}`}>{children}</Text>
    </View>
  );
}

function RecipeDetail({ slug }: { slug: string }) {
  const c = useThemeColors();
  const data = useRecipes();
  const recipe = data.recipes.find((r) => r.slug === slug) ?? null;
  const ranked = useMemo(() => (recipe ? rankRecipe(recipe, data.context) : null), [recipe, data.context]);
  const [servings, setServings] = useState<number | null>(null);
  const [rating, setRating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (data.loading) {
    return (
      <View className="items-center py-16">
        <ActivityIndicator color={c.muted} accessibilityLabel="Loading recipe" />
      </View>
    );
  }
  if (!recipe || !ranked) {
    return (
      <View className="items-center rounded-card bg-surface px-5 py-10">
        <Text className="text-xl font-bold text-foreground">We couldn&apos;t find that recipe</Text>
        <Pressable accessibilityRole="link" onPress={() => router.replace("/recipes")} className="mt-3 min-h-10 justify-center">
          <Text className="text-[16px] font-semibold text-accent">Back to recipes</Text>
        </Pressable>
      </View>
    );
  }

  const serves = servings ?? recipe.servings;
  const factor = serves / recipe.servings;
  const owned = new Set(ranked.coverage.owned.map((i) => i.position));
  const mine = data.myRatings.get(recipe.id);
  const { conflicts, warnings } = ranked.eligibility.allergens;
  const skillLabel = skillLevels.find((s) => s.level === recipe.skillLevel)?.label;

  return (
    <View>
      <RecipeArt recipe={recipe} size="lg" />

      <Text className="mt-5 text-[13px] font-semibold uppercase tracking-widest text-muted">
        {recipe.cuisine ? labelFor(cuisines, recipe.cuisine) : "Recipe"}
      </Text>
      <Text accessibilityRole="header" className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-foreground">
        {recipe.title}
      </Text>
      <Text className="mt-2 text-[17px] leading-6 text-muted">{recipe.description}</Text>

      <View className="mt-4 gap-2">
        <View className="flex-row items-center gap-2">
          <Ionicons name="time-outline" size={16} color={c.muted} />
          <Text className="text-[15px] text-foreground">
            {formatMinutes(recipe.totalMinutes)}{" "}
            <Text className="text-muted">
              ({recipe.prepMinutes} prep · {formatMinutes(recipe.cookMinutes)} cook)
            </Text>
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Ionicons name="school-outline" size={16} color={c.muted} />
          <SkillDots level={recipe.skillLevel} />
          <Text className="text-[15px] text-foreground">{skillLabel}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Ionicons name="star-outline" size={16} color={c.muted} />
          <Text className="text-[15px] text-muted">{ratingText(ranked)}</Text>
        </View>
      </View>

      <View className="mt-5 flex-row gap-2">
        <Button
          className="flex-1"
          variant={ranked.favorite ? "secondary" : "primary"}
          icon={ranked.favorite ? "heart" : "heart-outline"}
          label={ranked.favorite ? "Saved" : "Save"}
          onPress={() => void data.toggleFavorite(recipe.id)}
        />
        <Button
          className="flex-1"
          variant="secondary"
          icon="star-outline"
          label={mine ? "Rate again" : "I cooked this"}
          onPress={() => setRating(true)}
        />
      </View>
      {mine ? (
        <Text className="mt-2 text-[14px] text-muted">
          You rated it {mine.overall}★{mine.wouldCookAgain === false ? " and wouldn't cook it again" : ""}.
        </Text>
      ) : null}
      {notice ? (
        <View className="mt-3">
          <Notice>{notice}</Notice>
        </View>
      ) : null}

      {conflicts.length > 0 ? (
        <View accessibilityRole="alert" className="mt-5 flex-row gap-3 rounded-card border border-danger/30 bg-danger/5 p-5">
          <Ionicons name="alert-circle-outline" size={22} color={c.danger} />
          <View className="flex-1">
            <Text className="text-[16px] font-semibold text-danger">
              Contains {[...new Set(conflicts.map((x) => labelFor(allergens, x.allergen)))].join(", ").toLowerCase()} — not
              recommended for your household
            </Text>
            <Text className="mt-1 text-[15px] text-muted">
              Found in: {[...new Set(conflicts.map((x) => x.ingredient))].join("; ")}.
            </Text>
          </View>
        </View>
      ) : null}
      {warnings.length > 0 || ranked.cautions.length > 0 ? (
        <View className="mt-4 flex-row gap-3 rounded-card bg-warning/10 p-5">
          <Ionicons name="warning-outline" size={20} color={c.warning} />
          <View className="flex-1 gap-1">
            {[...warnings.map((w) => w.note), ...ranked.cautions].map((t) => (
              <Text key={t} className="text-[15px] leading-5 text-foreground">
                {t}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {ranked.reasons.length > 0 ? (
        <View className="mt-4 rounded-card bg-surface p-5">
          <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">Why it&apos;s here</Text>
          <View className="mt-2 gap-1.5">
            {ranked.reasons.map((r) => (
              <View key={r} className="flex-row gap-2">
                <Ionicons name="checkmark" size={16} color={c.accent} style={{ marginTop: 3 }} />
                <Text className="flex-1 text-[16px] leading-6 text-foreground">{r}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Ingredients */}
      <View className="mt-8 flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="text-2xl font-bold tracking-tight text-foreground">
          Ingredients
        </Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fewer servings"
            accessibilityState={{ disabled: serves <= 1 }}
            disabled={serves <= 1}
            onPress={() => setServings(Math.max(1, serves - 1))}
            className={`size-10 items-center justify-center rounded-full border border-border ${serves <= 1 ? "opacity-35" : ""}`}
          >
            <Ionicons name="remove" size={18} color={c.foreground} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" className="min-w-[88px] text-center text-[15px] font-semibold text-foreground">
            {serves} {serves === 1 ? "serving" : "servings"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More servings"
            accessibilityState={{ disabled: serves >= 24 }}
            disabled={serves >= 24}
            onPress={() => setServings(Math.min(24, serves + 1))}
            className={`size-10 items-center justify-center rounded-full border border-border ${serves >= 24 ? "opacity-35" : ""}`}
          >
            <Ionicons name="add" size={18} color={c.foreground} />
          </Pressable>
        </View>
      </View>
      {ranked.coverage.requiredCount > 0 ? (
        <Text className="mt-2 text-[15px] text-muted">
          {ranked.coverage.owned.length > 0
            ? `You have ${ranked.coverage.owned.length} of ${ranked.coverage.requiredCount} · ${ranked.coverage.missing.length} to buy`
            : "Add what you have in My Kitchen to see what you'd need to buy."}
        </Text>
      ) : null}
      <View className="mt-3 gap-5">
        {groupByComponent(recipe.ingredients).map((group) => (
          <View key={group.component ?? "main"}>
            {group.component ? <Text className="mb-2 text-[15px] font-semibold text-foreground">{group.component}</Text> : null}
            <View className="overflow-hidden rounded-card bg-surface">
              {group.items.map((i, index) => {
                const have = owned.has(i.position);
                return (
                  <View
                    key={i.position}
                    accessible
                    accessibilityLabel={`${formatIngredientLine(i, factor)}${i.optional ? ", optional" : ""}${have ? ", in your kitchen" : ""}`}
                    className={`flex-row items-start gap-3 px-4 py-3 ${index < group.items.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <View
                      className={`mt-0.5 size-5 items-center justify-center rounded-full ${have ? "bg-accent" : "border-2 border-border"}`}
                    >
                      {have ? <Ionicons name="checkmark" size={12} color={c["accent-foreground"]} /> : null}
                    </View>
                    <Text className="flex-1 text-[16px] leading-6 text-foreground">
                      {formatIngredientLine(i, factor)}
                      {i.optional ? <Text className="text-muted"> (optional)</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
      <Text className="mt-3 text-[14px] text-muted">
        Equipment: {recipe.requiredEquipment.map((e) => labelFor(equipment, e)).join(", ")}
      </Text>

      {/* Method */}
      <Text accessibilityRole="header" className="mt-8 text-2xl font-bold tracking-tight text-foreground">
        Method
      </Text>
      <View className="mt-3 gap-6">
        {groupByComponent(recipe.steps).map((group) => (
          <View key={group.component ?? "main"} className="gap-4">
            {group.component ? <Text className="text-[15px] font-semibold text-accent">{group.component}</Text> : null}
            {group.items.map((s) => (
              <View key={s.position} className="flex-row gap-4">
                <View className="size-8 items-center justify-center rounded-full bg-surface-strong">
                  <Text className="text-[15px] font-bold text-foreground">{s.position}</Text>
                </View>
                <View className="flex-1 pt-0.5">
                  <Text className="text-[17px] leading-7 text-foreground">{s.body}</Text>
                  {s.timerSeconds || s.temperatureC !== null || s.safeInternalTempC !== null ? (
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      {s.timerSeconds ? <StepChip icon="timer-outline">{formatMinutes(Math.round(s.timerSeconds / 60))}</StepChip> : null}
                      {s.temperatureC !== null ? <StepChip icon="thermometer-outline">{formatTemperature(s.temperatureC)}</StepChip> : null}
                      {s.safeInternalTempC !== null ? (
                        <StepChip icon="shield-checkmark-outline" tone="safe">
                          Safe at {formatTemperature(s.safeInternalTempC)} inside
                        </StepChip>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      {recipe.tips.length > 0 ? (
        <View className="mt-8 rounded-card bg-surface p-5">
          <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">Chef&apos;s tips</Text>
          <View className="mt-2 gap-1.5">
            {recipe.tips.map((t) => (
              <Text key={t} className="text-[16px] leading-6 text-foreground">
                • {t}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <Text className="mt-10 border-t border-border pt-4 text-[14px] leading-5 text-muted">
        {recipe.source.kind === "original" ? "Original recipe by " : "Source: "}
        {recipe.source.url ? (
          <Text accessibilityRole="link" className="underline" onPress={() => void Linking.openURL(recipe.source.url!)}>
            {recipe.source.name}
          </Text>
        ) : (
          recipe.source.name
        )}
        . Food-safety temperatures follow USDA guidance. Always check product labels for allergens.
      </Text>

      <RateSheet
        visible={rating}
        recipe={recipe}
        onClose={() => setRating(false)}
        onSubmit={async (input) => {
          const result = await data.rate(input);
          if (result.ok) setNotice("Thanks — your rating will shape what we suggest next.");
          return result;
        }}
      />
    </View>
  );
}
