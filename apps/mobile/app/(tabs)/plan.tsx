import Ionicons from "@expo/vector-icons/Ionicons";
import { formatCents } from "@kitchen-pantry/grocery-pricing";
import {
  addCustomMeal,
  addDessert,
  removeDessert,
  setDessertServings,
  addDays,
  moveMeal,
  nightsLeft,
  removeMeal,
  repeatWeek,
  replaceMeal,
  setServings,
  startOfWeek,
  toggleLock,
  weekDates,
  type PlanDraft,
} from "@kitchen-pantry/meal-planner";
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
  planningModes,
  skillLevels,
  type MealPlan,
  type PlanningMode,
} from "@kitchen-pantry/shared-types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, ChoiceCard, Field, Input, Notice } from "@/components/controls";
import { Sheet } from "@/components/kitchen/sheet";
import { DessertsSection } from "@/components/plan/desserts";
import { dayLabel, EmptyNight, MealCard } from "@/components/plan/meal-card";
import { WeeklyDraftBanner, WeeklyDraftsCard } from "@/components/plan/weekly-drafts";
import { EatingControls, EatingLine } from "@/components/household/who-is-eating";
import { useAttendance } from "@/lib/use-household-life";
import { Card, Eyebrow, Screen } from "@/components/ui";
import { useProfile } from "@/lib/app-state";
import { todayIso } from "@/lib/use-kitchen";
import { useMealPlan } from "@/lib/use-meal-plan";
import { useThemeColors } from "@/lib/theme";

export default function PlanScreen() {
  const today = todayIso();
  const thisWeek = startOfWeek(today);
  const weeks = [
    { weekStart: thisWeek, label: "This week" },
    { weekStart: addDays(thisWeek, 7), label: "Next week" },
    { weekStart: addDays(thisWeek, 14), label: dayLabel(addDays(thisWeek, 14)).day },
  ];
  const { week } = useLocalSearchParams<{ week?: string }>();
  // A notice opens ?week=…; otherwise, late in the week (e.g. Sunday), start on next week — that's the one to plan.
  const linked = weeks.find((w) => w.weekStart === week)?.weekStart;
  const [weekStart, setWeekStart] = useState(linked ?? weeks[nightsLeft(thisWeek, today) < 2 ? 1 : 0]!.weekStart);
  useEffect(() => {
    if (linked) setWeekStart(linked);
  }, [linked]);

  return (
    <Screen title="Meal Plan" subtitle="Dinners built around your household, your kitchen and what needs using up.">
      <View accessibilityRole="tablist" className="flex-row flex-wrap gap-2">
        {weeks.map((w) => {
          const selected = w.weekStart === weekStart;
          return (
            <Pressable
              key={w.weekStart}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setWeekStart(w.weekStart)}
              className={`min-h-11 justify-center rounded-full border bg-background px-5 ${selected ? "border-2 border-foreground" : "border-border"}`}
            >
              <Text className="text-[16px] font-medium text-foreground">{w.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <WeekPlanner key={weekStart} weekStart={weekStart} />
      <PlanningSettings />
    </Screen>
  );
}

type SheetState =
  | { kind: "none" }
  | { kind: "more"; date: string }
  | { kind: "custom"; date: string }
  | { kind: "rebuild"; regenerate: boolean }
  | { kind: "repeat"; weeks: MealPlan[] }
  | { kind: "eating"; date: string };

function WeekPlanner({ weekStart }: { weekStart: string }) {
  const c = useThemeColors();
  const profile = useProfile();
  const p = useMealPlan(weekStart);
  const eating = useAttendance(weekStart);
  const [mode, setMode] = useState<PlanningMode>("balanced");
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  const [skipped, setSkipped] = useState<Record<string, string[]>>({});
  const [customTitle, setCustomTitle] = useState("");

  useEffect(() => {
    if (p.plan) setMode(p.plan.mode);
  }, [p.plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = p.busy !== null;
  const days = weekDates(weekStart);
  const mealsByDate = new Map(p.draft.meals.map((m) => [m.date, m]));
  const hasMeals = p.draft.meals.length > 0;
  const confirmed = Boolean(p.draft.confirmedAt);
  const servings = profile.household.cookingFor;
  const close = () => setSheet({ kind: "none" });

  const edit = (next: PlanDraft) => p.save(next, true);

  function startBuild(regenerate: boolean) {
    if (confirmed) setSheet({ kind: "rebuild", regenerate });
    else void p.build(mode, { regenerate });
  }

  async function swap(date: string) {
    const skip = new Set(skipped[date] ?? []);
    const current = mealsByDate.get(date)?.recipeId;
    if (current) skip.add(current);
    const pick = p.proposeSwap(date, skip);
    if (!pick) {
      p.setMessage({ tone: "info", text: "No other suitable recipes for that night right now." });
      return;
    }
    setSkipped((s) => ({ ...s, [date]: [...skip] }));
    await edit(replaceMeal(p.draft, date, pick, servings));
  }

  if (p.loading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={c.muted} accessibilityLabel="Loading your plan" />
      </View>
    );
  }

  const sourceLabel =
    p.draft.generatedBy === "ai" ? "Planned with Claude" : p.draft.generatedBy === "rules" ? "Planned by Kitchen Pantry" : "Planned by you";
  const moreDate = sheet.kind === "more" ? sheet.date : null;

  return (
    <View className="gap-4">
      <WeeklyDraftBanner weekStart={weekStart} plan={p.plan} />
      <Card>
        <Eyebrow>How should we plan this week?</Eyebrow>
        <View accessibilityRole="radiogroup" className="mt-3 gap-2.5">
          {planningModes.map((m) =>
            m.available ? (
              <ChoiceCard key={m.code} selected={mode === m.code} onPress={() => setMode(m.code)} title={m.label} description={m.description} />
            ) : (
              <View key={m.code} className="rounded-control border border-dashed border-border p-4 opacity-70">
                <Text className="text-[17px] font-semibold text-foreground">{m.label} · Coming soon</Text>
                <Text className="mt-0.5 text-[15px] leading-5 text-muted">{m.description}</Text>
              </View>
            ),
          )}
        </View>
        <Button
          className="mt-4"
          size="lg"
          icon="sparkles"
          label={p.busy === "building" ? "Planning your week…" : hasMeals ? "Regenerate week" : "Build my week"}
          onPress={() => startBuild(hasMeals)}
          disabled={busy}
        />
        {!hasMeals ? (
          <Button
            className="mt-2"
            variant="ghost"
            icon="time-outline"
            label="Repeat a previous week"
            disabled={busy}
            onPress={async () => {
              const prev = await p.previous();
              if (prev.ok && prev.data.length > 0) setSheet({ kind: "repeat", weeks: prev.data });
              else p.setMessage({ tone: "info", text: "There's no earlier week to repeat yet." });
            }}
          />
        ) : null}
        <Text className="mt-3 text-[14px] leading-5 text-muted">
          {p.ai.enabled
            ? `Plans with Claude${p.ai.remaining !== null ? ` · ${p.ai.remaining} AI plan${p.ai.remaining === 1 ? "" : "s"} left today` : ""}. Locked meals and your own meals always stay.`
            : "Uses Kitchen Pantry's built-in planner. Connect the app to your Kitchen Pantry server to plan with Claude."}
        </Text>
      </Card>

      {p.message ? <Notice tone={p.message.tone === "error" ? "error" : p.message.tone === "warning" ? "warning" : "info"}>{p.message.text}</Notice> : null}

      {hasMeals ? (
        <Card>
          <Eyebrow>{sourceLabel}</Eyebrow>
          <Text className="mt-1.5 text-[17px] leading-6 text-foreground">{p.draft.summary ?? `${p.draft.meals.length} dinners planned.`}</Text>
          <View className="mt-4 flex-row gap-2">
            <Stat label="Dinners" value={p.draft.meals.length} />
            <Stat label="To buy" value={p.basket.toBuy.length} />
            <Stat label="From kitchen" value={p.basket.fromKitchen} />
          </View>
          <Text className="mt-3 text-[14px] leading-5 text-muted">
            Cost: see the Grocery List for prices from your store — we never estimate them.
          </Text>
          <View className="mt-3">
            <Button variant="secondary" icon="cart-outline" label="Build my cart" onPress={() => router.push("/cart")} />
          </View>
          {confirmed ? (
            <View className="mt-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5">
                <Ionicons name="checkmark-circle" size={16} color={c.accent} />
                <Text className="text-[14px] font-semibold text-accent">Confirmed</Text>
              </View>
              <Button variant="ghost" label="Edit" onPress={() => void p.unconfirm()} disabled={busy} />
            </View>
          ) : (
            <Button className="mt-4" icon="calendar-outline" label="Confirm this week" onPress={() => void p.confirm()} disabled={busy} />
          )}
        </Card>
      ) : null}

      <View className="gap-3">
        {days.map((date) => {
          const meal = mealsByDate.get(date);
          if (!meal) {
            return (
              <EmptyNight
                key={date}
                date={date}
                past={date < p.today}
                busy={busy}
                onSuggest={() => void swap(date)}
                onAddOwn={() => {
                  setCustomTitle("");
                  setSheet({ kind: "custom", date });
                }}
              />
            );
          }
          return (
            <MealCard
              key={date}
              meal={meal}
              ranked={meal.recipeId ? p.byId.get(meal.recipeId) : undefined}
              busy={busy}
              onSwap={() => void swap(date)}
              onToggleLock={() => void edit(toggleLock(p.draft, date))}
              onServings={(n) => void edit(setServings(p.draft, date, n))}
              onMore={() => setSheet({ kind: "more", date })}
              extra={(() => {
                const att = date >= todayIso() ? eating.forDay(date) : null;
                return att ? (
                  <EatingLine att={att} servings={meal.servings} busy={busy} onOpen={() => setSheet({ kind: "eating", date })} onUseServings={(n) => void edit(setServings(p.draft, date, n))} />
                ) : null;
              })()}
            />
          );
        })}
      </View>

      <DessertsSection
        desserts={p.draft.desserts}
        days={days}
        today={p.today}
        frequency={profile.desserts.frequency}
        byId={p.byId}
        candidates={p.allDesserts}
        preferred={profile.desserts.categories}
        favorites={p.recipesData.favorites}
        busy={busy}
        onAdd={(date, recipeId, note) => void edit(addDessert(p.draft, date, { recipeId, note }, servings))}
        onRemove={(date) => void edit(removeDessert(p.draft, date))}
        onServings={(date, n) => void edit(setDessertServings(p.draft, date, n))}
      />

      {p.draft.meals.some((m) => m.recipeId && !m.locked && !m.customTitle) ? (
        <Card>
          <Eyebrow>Is there a cheaper week?</Eyebrow>
          {!p.cheaper ? (
            <>
              <Text className="mt-2 text-[15px] leading-5 text-muted">Price this week&apos;s dinners and some alternatives at your store, and see swaps that cost less — only recipes that suit your household and match you as well. Locked nights and favourites stay.</Text>
              <View className="mt-3">
                <Button variant="secondary" label={p.busy === "pricing" ? "Checking prices…" : "Look for cheaper swaps"} disabled={p.busy !== null} onPress={() => void p.findCheaper()} />
              </View>
            </>
          ) : (
            <>
              {p.cheaper.swaps.map((sw) => (
                <View key={sw.date} className="mt-2 rounded-2xl bg-background px-4 py-3">
                  <Text className="font-semibold text-foreground">{dayLabel(sw.date, "long").weekday}</Text>
                  <Text className="text-[14px] text-muted">
                    {sw.from.recipe.title} ({formatCents(sw.fromPerServingCents)}/serving) → {sw.to.recipe.title} ({formatCents(sw.toPerServingCents)}/serving)
                  </Text>
                  <Text className="text-[14px] font-semibold text-success">
                    {sw.confidence === "estimate" ? `Estimated saving about ${formatCents(sw.savingCents)} this week` : `Saves ${sw.confidence === "at_least" ? "at least " : ""}${formatCents(sw.savingCents)} this week`}
                  </Text>
                  {sw.confidence === "estimate" ? <Text className="text-[13px] text-muted">Couldn&apos;t price {sw.toUnpriced.slice(0, 3).join(", ")} in the new recipe.</Text> : null}
                  <View className="mt-2">
                    <Button
                      variant="secondary"
                      label="Swap"
                      disabled={p.busy !== null}
                      onPress={async () => {
                        await edit(replaceMeal(p.draft, sw.date, { recipeId: sw.to.recipe.id, note: `Cheaper at ${p.cheaper!.storeName}` }, servings));
                        p.clearCheaper();
                      }}
                    />
                  </View>
                </View>
              ))}
              {p.cheaper.notice ? <Text className="mt-2 text-[15px] leading-5 text-muted">{p.cheaper.notice}</Text> : null}
              <Text className="mt-2 text-[13px] text-muted">Real store prices for the amounts each recipe uses; salt, oil and spices aren&apos;t counted. Nothing is guessed.</Text>
              <View className="mt-2">
                <Button variant="ghost" label="Done" onPress={p.clearCheaper} />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {p.basket.toBuy.length > 0 ? (
        <Card>
          <Eyebrow>What you&apos;ll need to buy</Eyebrow>
          {p.basket.usesUp.length > 0 ? (
            <Text className="mt-2 text-[15px] leading-5 text-muted">
              Uses up your {p.basket.usesUp.join(", ").toLowerCase()} before {p.basket.usesUp.length === 1 ? "it goes" : "they go"} off.
            </Text>
          ) : null}
          <View className="mt-2">
            {p.basket.toBuy.map((b) => (
              <View key={b.item} className="flex-row items-baseline justify-between gap-3 border-b border-border py-2">
                <Text className="flex-1 text-[15px] text-foreground">{b.item.charAt(0).toUpperCase() + b.item.slice(1)}</Text>
                {b.neededFor.length > 1 ? <Text className="text-[13px] text-accent">used in {b.neededFor.length} meals</Text> : null}
              </View>
            ))}
          </View>
          <Text className="mt-3 text-[13px] text-muted">Dinners only. The Grocery List adds amounts, desserts and store prices, with what you already have taken off.</Text>
        </Card>
      ) : null}

      <Sheet visible={sheet.kind === "more"} title={moreDate ? dayLabel(moreDate, "long").weekday : ""} description="Move this dinner, hide the recipe, or clear the night." onClose={close}>
        {moreDate ? (
          <View className="gap-5">
            <View>
              <Text className="mb-2 text-[15px] font-semibold text-foreground">Move to</Text>
              <View className="flex-row flex-wrap gap-2">
                {days.map((d) => {
                  const current = d === moreDate;
                  const occupied = mealsByDate.has(d) && !current;
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityLabel={`Move to ${dayLabel(d, "long").weekday}${occupied ? " (swaps with that dinner)" : ""}`}
                      accessibilityState={{ disabled: current }}
                      disabled={current}
                      onPress={async () => {
                        close();
                        await edit(moveMeal(p.draft, moreDate, d));
                      }}
                      className={`min-h-12 w-[22%] items-center justify-center rounded-2xl border ${current ? "border-foreground bg-foreground" : "border-border bg-background"}`}
                    >
                      <Text className={`text-[15px] font-semibold ${current ? "text-background" : "text-foreground"}`}>{dayLabel(d).weekday}</Text>
                      {occupied ? <Text className="text-[11px] text-muted">swap</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {mealsByDate.get(moreDate)?.recipeId ? (
              <Button
                variant="secondary"
                label="Not for us — never suggest it"
                onPress={async () => {
                  const id = mealsByDate.get(moreDate)?.recipeId;
                  close();
                  if (!id) return;
                  await p.recipesData.dismiss(id, "plan");
                  const pick = p.proposeSwap(moreDate, new Set([id]));
                  await edit(pick ? replaceMeal(p.draft, moreDate, pick, servings) : removeMeal(p.draft, moreDate));
                  p.setMessage({ tone: "info", text: "Got it — we won't suggest that recipe again. You can undo this in Recipes." });
                }}
              />
            ) : null}
            <Button
              variant="danger"
              label="Clear this night"
              onPress={async () => {
                close();
                await edit(removeMeal(p.draft, moreDate));
              }}
            />
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={sheet.kind === "custom"}
        title="Add your own meal"
        description="Leftovers, eating out, a family recipe — anything you like."
        onClose={close}
        footer={
          <Button
            size="lg"
            label="Add meal"
            disabled={!customTitle.trim() || busy}
            onPress={async () => {
              if (sheet.kind !== "custom") return;
              const date = sheet.date;
              close();
              await edit(addCustomMeal(p.draft, date, customTitle, servings));
            }}
          />
        }
      >
        <Field label="What's for dinner?">
          <Input value={customTitle} onChangeText={(t: string) => setCustomTitle(t.slice(0, 80))} placeholder="e.g. Leftovers or Pizza night" accessibilityLabel="What's for dinner?" />
        </Field>
      </Sheet>

      <Sheet
        visible={sheet.kind === "rebuild"}
        title="Rebuild a confirmed week?"
        description="Locked meals and your own meals stay. Everything else is replaced, and you'll need to confirm the week again."
        onClose={close}
        footer={
          <>
            <Button
              size="lg"
              label="Rebuild week"
              onPress={() => {
                const regenerate = sheet.kind === "rebuild" && sheet.regenerate;
                close();
                void p.build(mode, { regenerate });
              }}
            />
            <Button size="lg" variant="secondary" label="Keep my week" onPress={close} />
          </>
        }
      >
        <Text className="text-[15px] text-muted">Tip: lock the dinners you want to keep before rebuilding.</Text>
      </Sheet>

      <Sheet
        visible={sheet.kind === "eating"}
        title={sheet.kind === "eating" ? `Who's eating ${dayLabel(sheet.date, "long").weekday}?` : "Who's eating?"}
        description="Everyone counts as eating unless they say they're out. Each person answers for themselves; anyone can add guests."
        onClose={close}
      >
        {sheet.kind === "eating"
          ? (() => {
              const att = eating.forDay(sheet.date);
              const meal = mealsByDate.get(sheet.date);
              if (!att) return <Text className="text-[15px] text-muted">Loading…</Text>;
              const differs = Boolean(meal) && att.servings > 0 && att.servings !== meal!.servings;
              return (
                <View className="gap-5">
                  <EatingControls att={att} onEating={(e) => void eating.setEating(sheet.date, e)} onGuests={(n) => void eating.setGuests(sheet.date, n)} />
                  <Notice>
                    {att.servings === 0 ? "Nobody's eating — you could remove this dinner or move it to another night." : `${att.servings} serving${att.servings === 1 ? "" : "s"} needed${differs ? ` (planned: ${meal!.servings})` : ""}.`}
                  </Notice>
                  {differs ? (
                    <Button
                      label={`Make it ${att.servings} servings`}
                      disabled={busy}
                      onPress={async () => {
                        await edit(setServings(p.draft, sheet.date, att.servings));
                        close();
                      }}
                    />
                  ) : null}
                  {eating.error ? <Notice tone="error">{eating.error}</Notice> : null}
                </View>
              );
            })()
          : null}
      </Sheet>

      <Sheet visible={sheet.kind === "repeat"} title="Repeat a previous week" description="Copies those dinners onto the same days of this week." onClose={close}>
        {sheet.kind === "repeat" ? (
          <View className="gap-2">
            {sheet.weeks.map((w) => (
              <Pressable
                key={w.id}
                accessibilityRole="button"
                onPress={async () => {
                  close();
                  await edit(repeatWeek(p.draft, w, new Set([...p.candidates, ...p.allDesserts].map((x) => x.recipe.id))));
                }}
                className="rounded-2xl border border-border px-4 py-3"
              >
                <Text className="text-[16px] font-semibold text-foreground">Week of {dayLabel(w.weekStart).day}</Text>
                <Text className="text-[14px] text-muted">
                  {w.meals
                    .map((m) => (m.recipeId ? p.byId.get(m.recipeId)?.recipe.title : m.customTitle))
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(" · ") || "No dinners"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-background py-3">
      <Text className="text-[22px] font-bold text-foreground">{value}</Text>
      <Text className="mt-0.5 text-[13px] text-muted">{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Planning settings (from onboarding), collapsed below the planner.
// ---------------------------------------------------------------------------
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-4 border-b border-border py-2.5">
      <Text className="w-28 text-[16px] text-muted">{label}</Text>
      <Text className="flex-1 text-[16px] text-foreground">{value}</Text>
    </View>
  );
}

function Settings({ title, children }: { title: string; children: ReactNode }) {
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

function PlanningSettings() {
  const c = useThemeColors();
  const p = useProfile();
  const [open, setOpen] = useState(false);
  const list = (items: string[], empty = "None") => (items.length ? items.join(", ") : empty);
  const amount =
    p.budget.amountCents === null
      ? "No limit"
      : `$${(p.budget.amountCents / 100).toFixed(p.budget.amountCents % 100 ? 2 : 0)} ${labelFor(budgetPeriods, p.budget.period)}`;

  return (
    <View className="mt-4 gap-4">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        className="min-h-12 flex-row items-center justify-between"
      >
        <Text className="text-[17px] font-semibold text-foreground">Planning settings</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={c.muted} />
      </Pressable>
      {open ? (
        <>
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
            <Row label="Cuisines" value={list(p.diet.cuisines.map((x) => labelFor(cuisines, x)), "Any")} />
          </Settings>
          <Settings title="Cooking">
            <Row label="Skill" value={`Level ${p.skillLevel} · ${skillLevels.find((s) => s.level === p.skillLevel)?.label}`} />
            <Row label="Equipment" value={list(p.equipment.map((e) => labelFor(equipment, e)))} />
            <Row label="Top goals" value={list(p.goals.ranked.slice(0, 3).map((g) => labelFor(cookingGoals, g)))} />
          </Settings>
          <WeeklyDraftsCard />
        </>
      ) : null}
      <Button variant="secondary" icon="book-outline" label="Browse recipes" onPress={() => router.push("/recipes")} />
    </View>
  );
}
