import type { ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { PlanDraft } from "@kitchen-pantry/meal-planner";
import { formatMinutes, type RankedRecipe } from "@kitchen-pantry/recipe-engine";
import { router } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { RecipeArt, SkillDots } from "@/components/recipes/recipe-card";
import { useThemeColors } from "@/lib/theme";

type Meal = PlanDraft["meals"][number];
type IconName = ComponentProps<typeof Ionicons>["name"];

export function dayLabel(date: string, style: "short" | "long" = "short"): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" }),
    day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

function RoundButton({
  icon,
  label,
  onPress,
  pressed,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(pressed) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={`size-10 items-center justify-center rounded-full border ${pressed ? "border-foreground bg-foreground" : "border-border bg-background"} ${disabled ? "opacity-40" : ""}`}
    >
      <Ionicons name={icon} size={18} color={pressed ? c.background : c.foreground} />
    </Pressable>
  );
}

/** One night of the week: the planned dinner and its quick actions. */
export function MealCard({
  meal,
  ranked,
  busy,
  onSwap,
  onToggleLock,
  onServings,
  onMore,
  extra,
}: {
  meal: Meal;
  ranked: RankedRecipe | undefined;
  busy: boolean;
  onSwap: () => void;
  onToggleLock: () => void;
  onServings: (n: number) => void;
  onMore: () => void;
  /** Extra line under the dinner (who's eating). */
  extra?: ReactNode;
}) {
  const c = useThemeColors();
  const { weekday, day } = dayLabel(meal.date, "long");
  const recipe = ranked?.recipe;
  const title = recipe?.title ?? meal.customTitle ?? "Recipe unavailable";
  const toBuy = ranked?.coverage.missing.length ?? 0;
  const have = ranked?.coverage.owned.length ?? 0;

  return (
    <View className={`rounded-card bg-surface p-3 ${meal.locked ? "border-2 border-foreground" : ""}`}>
      <Pressable
        accessibilityRole={recipe ? "link" : undefined}
        accessibilityLabel={`${weekday}: ${title}`}
        disabled={!recipe}
        onPress={() => recipe && router.push(`/recipes/${recipe.slug}`)}
        className="flex-row gap-3 active:opacity-80"
      >
        {recipe ? (
          <View className="size-24 overflow-hidden rounded-2xl">
            <RecipeArt recipe={recipe} />
          </View>
        ) : (
          <View className="size-24 items-center justify-center rounded-2xl bg-surface-strong">
            <Ionicons name="restaurant-outline" size={30} color={c.muted} />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-[12px] font-semibold uppercase tracking-widest text-muted">
            {weekday} · {day}
            {meal.locked ? " · Locked" : ""}
          </Text>
          <Text className="mt-0.5 text-[17px] font-semibold leading-snug text-foreground">{title}</Text>
          {recipe ? (
            <View className="mt-1 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
              <Text className="text-[14px] text-muted">{formatMinutes(recipe.totalMinutes)}</Text>
              <SkillDots level={recipe.skillLevel} />
              <Text className="text-[14px] text-muted">
                {have > 0 ? `Have ${have} · ` : ""}
                {toBuy === 0 ? "Nothing to buy" : `${toBuy} to buy`}
              </Text>
            </View>
          ) : (
            <Text className="mt-1 text-[14px] text-muted">Your own meal</Text>
          )}
          {meal.note ? <Text className="mt-1.5 text-[14px] leading-5 text-foreground">✦ {meal.note}</Text> : null}
        </View>
      </Pressable>

      {extra}
      <View className="mt-3 flex-row items-center justify-between border-t border-border pt-3">
        <View className="flex-row items-center gap-1.5">
          <RoundButton icon="remove" label={`Fewer servings on ${weekday}`} onPress={() => onServings(meal.servings - 1)} disabled={busy || meal.servings <= 1} />
          <Text accessibilityLiveRegion="polite" className="min-w-[78px] text-center text-[15px] font-semibold text-foreground">
            {meal.servings} {meal.servings === 1 ? "serving" : "servings"}
          </Text>
          <RoundButton icon="add" label={`More servings on ${weekday}`} onPress={() => onServings(meal.servings + 1)} disabled={busy || meal.servings >= 24} />
        </View>
        <View className="flex-row items-center gap-1.5">
          <RoundButton
            icon={meal.locked ? "lock-closed" : "lock-open-outline"}
            label={meal.locked ? `Unlock ${weekday}` : `Lock ${weekday} so rebuilding keeps it`}
            onPress={onToggleLock}
            pressed={meal.locked}
            disabled={busy}
          />
          {recipe ? <RoundButton icon="refresh" label={`Swap ${weekday}'s dinner`} onPress={onSwap} disabled={busy || meal.locked} /> : null}
          <RoundButton icon="ellipsis-horizontal" label={`More options for ${weekday}`} onPress={onMore} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

/** A night with nothing planned. */
export function EmptyNight({ date, past, busy, onSuggest, onAddOwn }: { date: string; past: boolean; busy: boolean; onSuggest: () => void; onAddOwn: () => void }) {
  const { weekday, day } = dayLabel(date, "long");
  if (past) {
    return (
      <Text className="px-1 text-[14px] text-subtle">
        {weekday} · {day} · past
      </Text>
    );
  }
  return (
    <View className="gap-2 rounded-card border border-dashed border-border px-4 py-3">
      <Text className="text-[15px] text-foreground">
        <Text className="font-semibold">{weekday}</Text>
        <Text className="text-muted"> · {day} · No dinner planned</Text>
      </Text>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Suggest a dinner for ${weekday}`}
          onPress={onSuggest}
          disabled={busy}
          className="min-h-10 justify-center rounded-full border border-border bg-background px-4"
        >
          <Text className="text-[14px] font-semibold text-foreground">Suggest a dinner</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add your own meal for ${weekday}`}
          onPress={onAddOwn}
          disabled={busy}
          className="min-h-10 justify-center px-3"
        >
          <Text className="text-[14px] font-semibold text-muted">Add my own</Text>
        </Pressable>
      </View>
    </View>
  );
}
