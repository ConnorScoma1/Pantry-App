import Ionicons from "@expo/vector-icons/Ionicons";
import type { CookingHistoryData } from "@kitchen-pantry/database";
import { cookingHistory, monthLabel, type CookEntry } from "@kitchen-pantry/recipe-engine";
import type { RecipeRating } from "@kitchen-pantry/shared-types";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Notice } from "@/components/controls";
import { RecipeArt } from "@/components/recipes/recipe-card";
import { Body, Card, CardTitle, Eyebrow, Screen } from "@/components/ui";
import { useApp } from "@/lib/app-state";
import { todayIso } from "@/lib/use-kitchen";
import { useThemeColors } from "@/lib/theme";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function ratingLine(r: RecipeRating): string {
  const bits = [`${r.overall}/5`];
  if (r.wouldCookAgain === true) bits.push("would cook again");
  if (r.wouldCookAgain === false) bits.push("wouldn't cook again");
  if (r.actualMinutes) bits.push(`took ${r.actualMinutes} min`);
  if (r.familyApproval) bits.push(`family ${r.familyApproval}/5`);
  return bits.join(" · ");
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 rounded-card bg-surface p-4">
      <Text className="text-[28px] font-bold text-foreground">{value}</Text>
      <Text className="text-[13px] text-muted">{label}</Text>
    </View>
  );
}

/** Cooking history on the phone — same records and rules as the web. */
export default function HistoryScreen() {
  const c = useThemeColors();
  const { mode, recipes: repo } = useApp();
  const [raw, setRaw] = useState<{ history: CookingHistoryData; ratings: RecipeRating[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([repo.history(), repo.myRatings()]).then(([h, r]) => {
      if (cancelled) return;
      if (!h.ok) return setError(h.message);
      if (!r.ok) return setError(r.message);
      setRaw({ history: h.data, ratings: r.data });
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const h = useMemo(() => (raw ? cookingHistory({ cooked: raw.history.cooked, ratings: raw.ratings, recipes: raw.history.recipes, today }) : null), [raw, today]);
  const months = useMemo(() => {
    const groups: Array<{ label: string; entries: CookEntry[] }> = [];
    for (const e of h?.entries ?? []) {
      const label = monthLabel(e.cookedAt);
      const g = groups.at(-1);
      if (g && g.label === label) g.entries.push(e);
      else groups.push({ label, entries: [e] });
    }
    return groups;
  }, [h]);

  return (
    <Screen title="Cooking history" subtitle="What your household has cooked, and what you thought of it.">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!h ? (
        !error ? <Body>Loading your history…</Body> : null
      ) : h.entries.length === 0 ? (
        <Card>
          <CardTitle>Nothing cooked yet</CardTitle>
          <Body>When you finish a recipe in cooking mode or rate it, it shows up here.</Body>
        </Card>
      ) : (
        <>
          <View className="flex-row gap-3">
            <Stat value={String(h.stats.last30)} label="meals in 30 days" />
            <Stat value={String(h.stats.different30)} label="different recipes" />
            <Stat value={h.stats.averageRating === null ? "–" : String(h.stats.averageRating)} label={h.stats.ratedCount ? "average rating" : "no ratings yet"} />
          </View>
          {h.stats.topCuisines.length > 0 ? <Body>You cook {h.stats.topCuisines.map((x) => x.label).join(", ")} most.</Body> : null}

          {h.comeBack.length > 0 ? (
            <Card>
              <Eyebrow>Worth making again</Eyebrow>
              <Body>You loved these but haven&apos;t made them for a while.</Body>
              <View className="mt-3 gap-2">
                {h.comeBack.map((x) => (
                  <Pressable key={x.recipe.id} accessibilityRole="link" onPress={() => router.push(`/recipes/${x.recipe.slug}`)} className="min-h-11 justify-center rounded-2xl bg-background px-4 py-2">
                    <Text className="text-[15px] font-medium text-foreground">
                      {x.recipe.title} <Text className="text-[13px] text-muted">· {x.daysAgo >= 60 ? `${Math.floor(x.daysAgo / 30)} months ago` : `${Math.floor(x.daysAgo / 7)} weeks ago`}</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {months.map((m) => (
            <View key={m.label} className="gap-2">
              <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">{m.label}</Text>
              {m.entries.map((e, i) => (
                <Pressable
                  key={`${e.recipeId}-${e.cookedAt}-${i}`}
                  accessibilityRole={e.recipe ? "link" : undefined}
                  disabled={!e.recipe}
                  onPress={() => e.recipe && router.push(`/recipes/${e.recipe.slug}`)}
                  className="flex-row gap-3 overflow-hidden rounded-2xl bg-surface active:opacity-80"
                >
                  <View className="w-20">{e.recipe ? <RecipeArt recipe={e.recipe} /> : <View className="h-full bg-surface-strong" />}</View>
                  <View className="flex-1 py-3 pr-3">
                    <Text className="text-[13px] text-muted">{day(e.cookedAt)}</Text>
                    <Text className="text-[16px] font-semibold text-foreground">{e.recipe ? e.recipe.title : "A recipe that's no longer available"}</Text>
                    {e.rating ? (
                      <View className="mt-1 flex-row items-center gap-1">
                        <Ionicons name="star" size={13} color={c.warning} />
                        <Text className="text-[14px] text-muted">{ratingLine(e.rating)}</Text>
                      </View>
                    ) : (
                      <Text className="mt-1 text-[14px] text-muted">Not rated</Text>
                    )}
                    {e.rating?.notes ? <Text className="mt-1 text-[15px] leading-5 text-foreground">“{e.rating.notes}”</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
          {mode === "preview" ? <Body>Preview mode keeps this history on this phone only.</Body> : null}
        </>
      )}
    </Screen>
  );
}
