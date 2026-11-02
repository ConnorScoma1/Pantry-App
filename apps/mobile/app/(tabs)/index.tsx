import Ionicons from "@expo/vector-icons/Ionicons";
import { summarizeKitchen } from "@kitchen-pantry/inventory-engine";
import { budgetPeriods, dietStyles, labelFor, skillLevels } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Notice } from "@/components/controls";
import { UrgencyBadge } from "@/components/kitchen/urgency-badge";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { InSeasonCard } from "@/components/seasonal/in-season";
import { SurpriseMe } from "@/components/recipes/surprise-me";
import { PlanReadyCard } from "@/components/plan/weekly-drafts";
import { SavingsSnapshot } from "@/components/savings-snapshot";
import { TonightSection } from "@/components/household/who-is-eating";
import { seasonalContext } from "@kitchen-pantry/recipe-engine";
import { trialDaysLeft } from "@kitchen-pantry/database";
import { Body, Card, CardTitle, Eyebrow, PrimaryButton, Screen } from "@/components/ui";
import { dayLabel } from "@/components/plan/meal-card";
import { addDays, nightsLeft, startOfWeek } from "@kitchen-pantry/meal-planner";
import { todayIso } from "@/lib/use-kitchen";
import { useMealPlan } from "@/lib/use-meal-plan";
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
  const { mode, access } = useApp();
  const trialLeft = mode === "supabase" && access.enforced && access.reason === "trial" ? trialDaysLeft(access) : null;
  const profile = useProfile();
  const kitchen = useKitchen();
  const recipes = useRecipes();
  const forYou = useMemo(() => recipes.rank().recipes.slice(0, 3), [recipes.rank]);
  const seasonal = useMemo(() => seasonalContext(profile, kitchen.today), [profile, kitchen.today]);
  const everything = useMemo(() => recipes.rank({ course: "any" }).recipes, [recipes.rank]);
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

      {trialLeft !== null && trialLeft <= 3 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/subscribe")} className="rounded-card bg-accent-soft px-5 py-4">
          <Text className="text-[15px] leading-5 text-foreground">
            <Text className="font-bold">{trialLeft <= 1 ? "Your free trial ends today." : `Your free trial ends in ${trialLeft} days.`}</Text> Tap to subscribe and keep everything going.
          </Text>
        </Pressable>
      ) : null}

      <PlanReadyCard />

      <ThisWeekCard dinners={dinners} cookingFor={h.cookingFor} />

      <TonightSection today={kitchen.today} titleFor={(id) => everything.find((r) => r.recipe.id === id)?.recipe.title ?? null} />
      <SavingsSnapshot />

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
            <RecipeCard
              key={r.recipe.id}
              ranked={r}
              onToggleFavorite={() => void recipes.toggleFavorite(r.recipe.id)}
              onDismiss={() => void recipes.dismiss(r.recipe.id, "home")}
            />
          ))}
        </View>
      ) : null}

      {!recipes.loading ? <SurpriseMe data={recipes} /> : null}
      {seasonal && !recipes.loading ? <InSeasonCard seasonal={seasonal} ranked={everything} /> : null}

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
        {useSoon.length > 0 ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/use-it-up?items=${useSoon.slice(0, 3).map((u) => u.item.id).join(",")}`)}
            className="mt-4 min-h-10 justify-center"
          >
            <Text className="text-[16px] font-semibold text-accent">Find recipes to use them →</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => router.navigate("/kitchen")} className={`${useSoon.length > 0 ? "mt-1" : "mt-4"} min-h-10 justify-center`}>
          <Text className="text-[16px] font-semibold text-accent">Go to My Kitchen →</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

/** This week's dinners (next week's late in the week), or a one-tap build. */
function ThisWeekCard({ dinners, cookingFor }: { dinners: number; cookingFor: number }) {
  const today = todayIso();
  const thisWeek = startOfWeek(today);
  const upcoming = nightsLeft(thisWeek, today) < 2;
  const p = useMealPlan(upcoming ? addDays(thisWeek, 7) : thisWeek);
  const label = upcoming ? "Next week" : "This week";
  const meals = p.draft.meals;

  if (meals.length === 0) {
    return (
      <Card>
        <Eyebrow>{label}&apos;s dinners</Eyebrow>
        <CardTitle>Nothing planned yet</CardTitle>
        <Body>
          We&apos;ll plan {dinners} dinner{dinners === 1 ? "" : "s"} for {cookingFor} {cookingFor === 1 ? "person" : "people"}, matched to
          your skill level and what&apos;s already in your kitchen.
        </Body>
        <PrimaryButton
          label={p.busy === "building" ? "Planning your week…" : "Build my week"}
          disabled={p.loading || p.busy !== null || dinners === 0}
          onPress={() => void p.build("balanced")}
        />
        <Pressable accessibilityRole="link" onPress={() => router.navigate("/plan")} className="mt-2 min-h-10 items-center justify-center">
          <Text className="text-[15px] font-semibold text-accent">Choose how to plan</Text>
        </Pressable>
        {p.message ? <Text className="mt-1 text-center text-[14px] text-muted">{p.message.text}</Text> : null}
      </Card>
    );
  }

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Eyebrow>{label}&apos;s dinners</Eyebrow>
        <Text className={`text-[13px] font-semibold ${p.draft.confirmedAt ? "text-accent" : "text-muted"}`}>{p.draft.confirmedAt ? "Confirmed" : "Draft"}</Text>
      </View>
      <View className="mt-2">
        {meals.map((m, i) => {
          const ranked = m.recipeId ? p.byId.get(m.recipeId) : undefined;
          return (
            <Pressable
              key={m.date}
              accessibilityRole={ranked ? "link" : undefined}
              disabled={!ranked}
              onPress={() => ranked && router.push(`/recipes/${ranked.recipe.slug}`)}
              className={`flex-row items-baseline gap-3 py-2.5 ${i < meals.length - 1 ? "border-b border-border" : ""}`}
            >
              <Text className="w-10 text-[14px] font-semibold text-muted">{dayLabel(m.date).weekday}</Text>
              <Text numberOfLines={1} className="flex-1 text-[16px] text-foreground">
                {ranked?.recipe.title ?? m.customTitle ?? "Recipe unavailable"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.navigate("/plan")} className="mt-3 min-h-10 justify-center">
        <Text className="text-[16px] font-semibold text-accent">Open meal plan →</Text>
      </Pressable>
    </Card>
  );
}
