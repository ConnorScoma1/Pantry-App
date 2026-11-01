import Ionicons from "@expo/vector-icons/Ionicons";
import { summarizeKitchen } from "@kitchen-pantry/inventory-engine";
import { budgetPeriods, dietStyles, labelFor, skillLevels } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Notice } from "@/components/controls";
import { UrgencyBadge } from "@/components/kitchen/urgency-badge";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Body, Card, CardTitle, Eyebrow, PrimaryButton, Screen } from "@/components/ui";
import { useApp, useProfile } from "@/lib/app-state";
import { useKitchen } from "@/lib/use-kitchen";
import { useRecipes } from "@/lib/use-recipes";
import { useThemeColors } from "@/lib/theme";

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const c = useThemeColors();
  const { mode } = useApp();
  const profile = useProfile();
  const kitchen = useKitchen();
  const recipes = useRecipes();
  const forYou = useMemo(() => recipes.rank().recipes.slice(0, 3), [recipes.rank]);
  const useSoon = useMemo(() => summarizeKitchen(kitchen.items, kitchen.today).useSoon, [kitchen.items, kitchen.today]);

  const h = profile.household;
  const dinners = h.mealsIncluded.includes("dinner") ? h.dinnersPerWeek : 0;
  const budget =
    profile.budget.amountCents === null
      ? "No strict budget"
      : `$${(profile.budget.amountCents / 100).toFixed(profile.budget.amountCents % 100 ? 2 : 0)} ${labelFor(budgetPeriods, profile.budget.period)}`;

  return (
    <Screen title="Your week" subtitle={greeting()}>
      {mode === "preview" ? (
        <Notice tone="warning">Preview mode — Supabase isn&apos;t connected, so everything is saved on this device only.</Notice>
      ) : null}

      <Card>
        <Eyebrow>Dinners</Eyebrow>
        <CardTitle>Nothing planned yet</CardTitle>
        <Body>
          We&apos;ll plan {dinners} dinner{dinners === 1 ? "" : "s"} for {h.cookingFor} {h.cookingFor === 1 ? "person" : "people"},
          matched to your budget, skill level and what&apos;s already in your kitchen.
        </Body>
        <PrimaryButton label="Build my week" disabled />
        <Text className="mt-2 text-center text-[14px] text-muted">Meal planning is coming soon.</Text>
      </Card>

      <Card>
        <Eyebrow>Planning around</Eyebrow>
        <View className="mt-3 gap-3">
          {[
            ["people-outline", `${h.cookingFor} ${h.cookingFor === 1 ? "person" : "people"} · ${dinners} dinners a week`],
            ["wallet-outline", budget],
            ["leaf-outline", `${labelFor(dietStyles, profile.diet.style)}${profile.diet.allergies.length ? ` · ${profile.diet.allergies.length} allerg${profile.diet.allergies.length === 1 ? "y" : "ies"} excluded` : ""}`],
            ["time-outline", skillLevels.find((s) => s.level === profile.skillLevel)?.label ?? ""],
          ].map(([icon, text]) => (
            <View key={icon} className="flex-row items-center gap-3">
              <Ionicons name={icon as "leaf-outline"} size={20} color={c.muted} />
              <Text className="text-[16px] text-foreground">{text}</Text>
            </View>
          ))}
        </View>
      </Card>

      {forYou.length > 0 ? (
        <View className="gap-3">
          <View className="flex-row items-end justify-between gap-3 pt-2">
            <View className="flex-1">
              <Text accessibilityRole="header" className="text-2xl font-bold tracking-tight text-foreground">
                Recipes for you
              </Text>
              <Text className="mt-0.5 text-[15px] text-muted">Matched to your skills, kitchen and what needs using up.</Text>
            </View>
            <Pressable accessibilityRole="link" onPress={() => router.push("/recipes")} className="min-h-10 justify-center">
              <Text className="text-[16px] font-semibold text-accent">See all →</Text>
            </Pressable>
          </View>
          {forYou.map((r) => (
            <RecipeCard key={r.recipe.id} ranked={r} onToggleFavorite={() => void recipes.toggleFavorite(r.recipe.id)} />
          ))}
        </View>
      ) : null}

      <Card>
        <Eyebrow>Use it before you lose it</Eyebrow>
        {useSoon.length === 0 ? (
          <>
            <CardTitle>Nothing needs using up</CardTitle>
            <Body>Add what&apos;s in your fridge with use-by dates and the most urgent ingredients show up here first.</Body>
          </>
        ) : (
          <>
            <CardTitle>
              {useSoon.length} ingredient{useSoon.length === 1 ? "" : "s"} to use soon
            </CardTitle>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {useSoon.slice(0, 6).map(({ item, urgency }) => (
                <View key={item.id} className="flex-row items-center gap-2 rounded-full bg-background py-1.5 pl-4 pr-1.5">
                  <Text className="text-[15px] font-medium text-foreground">{item.name}</Text>
                  <UrgencyBadge urgency={urgency} />
                </View>
              ))}
            </View>
          </>
        )}
        <Pressable accessibilityRole="link" onPress={() => router.navigate("/kitchen")} className="mt-4 min-h-10 justify-center">
          <Text className="text-[16px] font-semibold text-accent">Go to My Kitchen →</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}
