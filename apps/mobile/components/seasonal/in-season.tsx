import Ionicons from "@expo/vector-icons/Ionicons";
import { formatCents } from "@kitchen-pantry/grocery-pricing";
import { seasonalPicks, type RankedRecipe, type SeasonalContext } from "@kitchen-pantry/recipe-engine";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/controls";
import { Body, Card, CardTitle, Eyebrow } from "@/components/ui";
import { useThemeColors } from "@/lib/theme";
import { useSeasonalDeals } from "@/lib/use-seasonal-deals";

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const produceLabel = (n: string) => n.replace(/\s*&.*$/, "");

/** Home → "In season this week" (same picks as the web). Suggestions only, never a filter. */
export function InSeasonCard({ seasonal, ranked }: { seasonal: SeasonalContext; ranked: readonly RankedRecipe[] }) {
  const c = useThemeColors();
  const picks = useMemo(() => seasonalPicks(ranked, seasonal), [ranked, seasonal]);
  const { settings } = seasonal;
  const produce = useMemo(() => (settings.produce ? seasonal.produce.map((p) => p.name) : []), [settings.produce, seasonal.produce]);
  const deals = useSeasonalDeals(produce, settings.deals);

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <Ionicons name="leaf-outline" size={18} color={c.accent} />
        <Eyebrow>In season this week</Eyebrow>
      </View>
      <CardTitle>{cap(seasonal.season)} where you are</CardTitle>
      <Text className="text-[14px] text-muted">Based on {seasonal.region.basis} and today&apos;s date.</Text>

      {produce.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2" accessibilityLabel="In-season produce">
          {produce.slice(0, 10).map((n) => (
            <View key={n} className="rounded-full bg-background px-3.5 py-1.5">
              <Text className="text-[15px] font-medium text-foreground">{produceLabel(n)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {picks.meals.length > 0 || picks.dessert ? (
        <View className="mt-3">
          {[...picks.meals, ...(picks.dessert ? [picks.dessert] : [])].map((r) => {
            const why = r.inSeason && r.inSeason.length > 0 ? `Uses ${r.inSeason.slice(0, 2).map((n) => produceLabel(n).toLowerCase()).join(" and ")}` : (r.reasons.find((x) => /favourite|For /.test(x)) ?? null);
            return (
              <Pressable
                key={r.recipe.id}
                accessibilityRole="link"
                onPress={() => router.push(`/recipes/${r.recipe.slug}`)}
                className="flex-row items-baseline gap-3 border-b border-border py-2.5 active:opacity-70"
              >
                <Text className="w-14 text-[12px] font-semibold uppercase tracking-widest text-muted">{r.recipe.course === "dessert" ? "Treat" : "Dinner"}</Text>
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-[16px] font-medium text-foreground">{r.recipe.title}</Text>
                  {why ? <Text className="text-[14px] text-muted">{why}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : settings.meals || settings.desserts ? (
        <Body>No seasonal recipes fit your kitchen right now — every recipe is still on the Recipes tab.</Body>
      ) : null}

      {picks.holidays.map((h) => (
        <View key={h.code} className="mt-3 rounded-2xl bg-background px-4 py-3">
          <Text className="text-[15px] font-semibold text-foreground">
            {h.label} · <Text className="font-normal text-muted">{h.when}</Text>
          </Text>
          {h.recipes.length > 0 ? (
            h.recipes.map((r) => (
              <Pressable key={r.recipe.id} accessibilityRole="link" onPress={() => router.push(`/recipes/${r.recipe.slug}`)} className="min-h-9 justify-center">
                <Text className="text-[15px] text-foreground underline">{r.recipe.title}</Text>
              </Pressable>
            ))
          ) : (
            <Text className="mt-1 text-[14px] text-muted">No recipes for it in your collection yet.</Text>
          )}
        </View>
      ))}

      {settings.deals && produce.length > 0 ? (
        <View className="mt-3 rounded-2xl border border-border px-4 py-3">
          <Text className="text-[15px] font-semibold text-foreground">Seasonal deals</Text>
          {deals.blocker === "checking" ? (
            <Text className="mt-1 text-[14px] text-muted">Checking your store…</Text>
          ) : deals.blocker !== null ? (
            <Text className="mt-1 text-[14px] text-muted">
              {deals.blocker === "preview" ? "Sign in to see sale prices from your store." : "Store prices aren't connected yet, so we can't show sale prices."}
            </Text>
          ) : !deals.store ? (
            <Text className="mt-1 text-[14px] text-muted">Choose your store on the Grocery tab to see what&apos;s on sale.</Text>
          ) : deals.deals === null ? (
            <View className="mt-2 gap-1.5">
              <Button variant="secondary" label={deals.busy ? "Checking prices…" : `Check sale prices at ${deals.store.name}`} disabled={deals.busy} onPress={() => void deals.check()} />
              <Text className="text-[13px] text-muted">Real store prices — in season doesn&apos;t always mean cheaper.</Text>
            </View>
          ) : deals.deals.length === 0 ? (
            <Text className="mt-1 text-[14px] text-muted">None of this week&apos;s in-season produce is on sale at {deals.store.name} right now.</Text>
          ) : (
            <View className="mt-2 gap-1.5">
              {deals.deals.map(({ produce: name, line }) => (
                <View key={line.id} className="flex-row items-baseline justify-between gap-3">
                  <Text className="flex-1 text-[15px] text-foreground" numberOfLines={2}>
                    <Text className="font-medium">{produceLabel(name)}</Text>
                    {line.product ? <Text className="text-muted"> · {line.product.name}</Text> : null}
                  </Text>
                  <Text className="text-[15px] font-semibold text-accent">
                    {formatCents(line.saleCents!)}
                    {line.packages === null ? "/lb" : ""} <Text className="text-[13px] font-normal text-muted line-through">{formatCents(line.regularCents!)}</Text>
                  </Text>
                </View>
              ))}
              <Text className="text-[13px] text-muted">Sale prices reported by {deals.store.name}. Prices can change at the store.</Text>
            </View>
          )}
          {deals.error ? <Text className="mt-2 text-[14px] text-danger">{deals.error}</Text> : null}
        </View>
      ) : null}

      <Pressable accessibilityRole="link" onPress={() => router.push("/profile")} className="mt-3 min-h-10 justify-center">
        <Text className="text-[16px] font-semibold text-accent">Seasonal settings →</Text>
      </Pressable>
    </Card>
  );
}
