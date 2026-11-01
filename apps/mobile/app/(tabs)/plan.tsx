import {
  allergens,
  budgetIncludes,
  budgetPeriods,
  budgetPriorities,
  cookingGoals,
  cuisines,
  dietStyles,
  equipment,
  labelFor,
  mealTypes,
  skillLevels,
} from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Card, Eyebrow, Screen } from "@/components/ui";
import { useProfile } from "@/lib/app-state";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-4 border-b border-border py-2.5">
      <Text className="w-28 text-[16px] text-muted">{label}</Text>
      <Text className="flex-1 text-[16px] text-foreground">{value}</Text>
    </View>
  );
}

function Settings({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <View className="mb-2 flex-row items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change ${title}`}
          onPress={() => router.push("/onboarding")}
          className="min-h-9 justify-center rounded-full border border-border bg-background px-4"
        >
          <Text className="text-[15px] font-semibold text-foreground">Change</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}

export default function PlanScreen() {
  const p = useProfile();
  const list = (items: string[], empty = "None") => (items.length ? items.join(", ") : empty);
  const amount =
    p.budget.amountCents === null
      ? "No limit"
      : `$${(p.budget.amountCents / 100).toFixed(p.budget.amountCents % 100 ? 2 : 0)} ${labelFor(budgetPeriods, p.budget.period)}`;

  return (
    <Screen title="Meal Plan" subtitle="These settings apply to every week you plan.">
      <Settings title="Household">
        <Row label="Cooking for" value={`${p.household.cookingFor}`} />
        <Row label="Meals" value={list(p.household.mealsIncluded.map((m) => labelFor(mealTypes, m)))} />
        <Row label="Dinners" value={`${p.household.dinnersPerWeek} a week`} />
      </Settings>
      <Settings title="Budget">
        <Row label="Budget" value={amount} />
        <Row label="Covers" value={list(p.budget.includes.map((b) => labelFor(budgetIncludes, b)))} />
        <Row label="Priority" value={labelFor(budgetPriorities, p.budget.priority)} />
      </Settings>
      <Settings title="Diet & allergies">
        <Row label="Diet" value={labelFor(dietStyles, p.diet.style)} />
        <Row label="Allergies" value={list(p.diet.allergies.map((a) => labelFor(allergens, a)))} />
        <Row label="Won't eat" value={list([...p.diet.dislikes, ...p.diet.neverRecommend])} />
        <Row label="Cuisines" value={list(p.diet.cuisines.map((c) => labelFor(cuisines, c)), "Any")} />
      </Settings>
      <Settings title="Cooking">
        <Row label="Skill" value={`Level ${p.skillLevel} · ${skillLevels.find((s) => s.level === p.skillLevel)?.label}`} />
        <Row label="Equipment" value={list(p.equipment.map((e) => labelFor(equipment, e)))} />
        <Row label="Top goals" value={list(p.goals.ranked.slice(0, 3).map((g) => labelFor(cookingGoals, g)))} />
      </Settings>
    </Screen>
  );
}
