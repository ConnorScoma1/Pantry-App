import Ionicons from "@expo/vector-icons/Ionicons";
import { formatAmount, formatMinutes } from "@kitchen-pantry/recipe-engine";
import { skillLevels } from "@kitchen-pantry/shared-types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Input, Notice, Stepper } from "@/components/controls";
import { StatusBadge } from "@/components/recipes/library-badges";
import { Card, Eyebrow, Screen } from "@/components/ui";
import { useMenus } from "@/lib/use-library";
import { useRecipes } from "@/lib/use-recipes";
import { useThemeColors } from "@/lib/theme";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Menus (spec 08 §4): whole meals scaled to guests, skill and — with real store prices — budget. */
export default function MenusScreen() {
  const c = useThemeColors();
  const data = useRecipes();
  const m = useMenus(data);
  const params = useLocalSearchParams<{ template?: string; guests?: string; budget?: string }>();
  const [showShopping, setShowShopping] = useState(false);
  const { choose, setGuests, setBudgetCents } = m;
  useEffect(() => {
    if (params.template) choose(String(params.template));
    const g = Number(params.guests);
    if (g >= 1 && g <= 50) setGuests(g);
    const b = Number(params.budget);
    if (b > 0) setBudgetCents(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.template]);
  const menu = m.menu;

  return (
    <Screen title="Menus" subtitle="Whole meals, course by course — scaled to your guests, your skill and your budget.">
      {!m.template ? (
        <View className="gap-3">
          {m.templates.map((t) => (
            <Pressable key={t.code} accessibilityRole="button" onPress={() => m.choose(t.code)} className="rounded-card bg-surface p-5 active:opacity-80">
              <Text className="text-[18px] font-semibold text-foreground">{t.title}</Text>
              <Text className="mt-1 text-[15px] leading-5 text-muted">{t.description}</Text>
              <Text className="mt-2 text-[13px] text-muted">
                {t.courses.length} courses · suits {skillLevels.find((s) => s.level === t.suggestedSkill)?.label.toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View className="gap-4">
          <Pressable accessibilityRole="button" onPress={() => m.choose(null)} className="min-h-10 flex-row items-center gap-1.5">
            <Ionicons name="chevron-back" size={18} color={c.muted} />
            <Text className="text-[15px] font-semibold text-muted">All menus</Text>
          </Pressable>
          <View>
            <Text accessibilityRole="header" className="text-[26px] font-bold tracking-tight text-foreground">
              {m.template.title}
            </Text>
            <Text className="mt-1 text-[16px] leading-6 text-muted">{m.template.description}</Text>
          </View>
          <Card>
            <Stepper label="Guests" value={m.guests} min={1} max={50} onChange={m.setGuests} />
            <Text className="mt-4 text-[16px] font-semibold text-foreground">Budget (optional)</Text>
            <Input
              keyboardType="decimal-pad"
              accessibilityLabel="Budget in dollars"
              placeholder="No limit"
              value={m.budgetCents ? String(m.budgetCents / 100) : ""}
              onChangeText={(v) => {
                const n = Number(v.replace(/[^0-9.]/g, ""));
                m.setBudgetCents(n > 0 ? Math.round(n * 100) : null);
              }}
            />
          </Card>

          {menu ? (
            <>
              {menu.courses.map((course, index) => (
                <View key={`${course.label}-${index}`} className="rounded-card bg-surface p-4">
                  <Text className="text-[13px] font-semibold uppercase tracking-widest text-muted">
                    {course.label}
                    {course.optional ? " · optional" : ""}
                  </Text>
                  {course.recipe ? (
                    <>
                      <Pressable accessibilityRole="link" onPress={() => router.push(`/recipes/${course.recipe!.slug}`)} className="mt-1 min-h-9 justify-center">
                        <Text className="text-[18px] font-semibold text-foreground">{course.recipe.title}</Text>
                      </Pressable>
                      <View className="flex-row flex-wrap items-center gap-2">
                        <StatusBadge recipe={course.recipe} />
                        {!course.idea ? (
                          <Text className="text-[14px] text-muted">
                            {formatMinutes(course.recipe.totalMinutes)} · serves {course.recipe.servings}
                            {course.factor !== 1 ? `, ×${formatAmount(course.factor)}` : ""}
                            {course.perServingCents !== null ? ` · ${money(course.perServingCents)}/serving` : ""}
                          </Text>
                        ) : null}
                      </View>
                    </>
                  ) : null}
                  {course.note ? <Text className="mt-1 text-[14px] leading-5 text-muted">{course.note}</Text> : null}
                  {course.alternatives.length > 0 ? (
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      <Text className="text-[14px] text-muted">Swap for:</Text>
                      {course.alternatives.slice(0, 2).map((a) => (
                        <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Swap ${course.label} for ${a.title}`} onPress={() => m.pin(index, a.id)} className="rounded-full border border-border px-3 py-1">
                          <Text className="text-[14px] font-medium text-foreground">{a.title}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}

              <Card>
                <Eyebrow>At a glance</Eyebrow>
                <Text className="mt-2 text-[16px] leading-6 text-foreground">
                  {menu.ready} of {menu.courses.length} courses have a full recipe
                  {menu.ready > 0 ? `. About ${formatMinutes(menu.activeMinutes)} hands-on; start ${formatMinutes(menu.startBefore)} before dinner.` : "."}
                </Text>
                <Text className="mt-1 text-[16px] leading-6 text-foreground">
                  {m.storeName
                    ? `${money(menu.cost.cents)} for ${menu.guests} at ${m.storeName}${menu.cost.unpriced ? ` — plus ${menu.cost.unpriced} course(s) we couldn't fully price` : ""}.`
                    : "Choose your store on the Grocery tab to see real prices. We never estimate prices."}
                </Text>
                {menu.warnings.map((w) => (
                  <Text key={w} className="mt-1 text-[15px] leading-5 text-warning">
                    • {w}
                  </Text>
                ))}
              </Card>

              {menu.schedule.length > 0 ? (
                <Card>
                  <Eyebrow>What to start when</Eyebrow>
                  {menu.schedule.map((s) => (
                    <Text key={s.recipeTitle} className="mt-1.5 text-[16px] text-foreground">
                      <Text className="font-semibold">{formatMinutes(s.startsBefore)} before</Text> — {s.recipeTitle}
                    </Text>
                  ))}
                </Card>
              ) : null}

              <Button icon="bookmark-outline" label="Save menu" onPress={() => void m.save()} />
              <Button variant="secondary" icon="cart-outline" label={`Add ${menu.shopping.length} items to grocery list`} disabled={menu.shopping.length === 0} onPress={() => void m.addToGrocery()} />
              <Button variant="secondary" icon="list-outline" label={showShopping ? "Hide shopping list" : "Show shopping list"} onPress={() => setShowShopping((v) => !v)} />
              {m.notice ? <Notice>{m.notice}</Notice> : null}
              {showShopping ? (
                <Card>
                  {menu.shopping.map((s) => (
                    <Text key={`${s.item}-${s.unit}`} className="mb-1 text-[15px] text-foreground">
                      {s.quantity !== null ? `${formatAmount(s.quantity)}${s.unit ? ` ${s.unit}` : ""} ` : ""}
                      {s.item}
                    </Text>
                  ))}
                </Card>
              ) : null}
            </>
          ) : null}
        </View>
      )}

      {m.saved.length > 0 ? (
        <View className="mt-8 gap-2">
          <Text accessibilityRole="header" className="text-xl font-bold text-foreground">
            Saved menus
          </Text>
          {m.saved.map((s) => (
            <View key={s.id} className="flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
              <Pressable accessibilityRole="button" onPress={() => m.open(s)} className="flex-1">
                <Text className="text-[16px] font-semibold text-foreground">{s.title}</Text>
                <Text className="text-[14px] text-muted">
                  {s.courses.length} courses · for {s.guests}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${s.title}`} onPress={() => void m.remove(s.id)} className="size-10 items-center justify-center">
                <Ionicons name="trash-outline" size={18} color={c.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
